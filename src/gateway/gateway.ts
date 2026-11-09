import { readFileSync } from 'node:fs';
import { fromNQuads, Journal, seedFingerprint } from './journal';
import oxigraph from 'oxigraph';
import { conformanceProblems, methodsFor, validateData, validatorFor, type MethodOption } from '../ontology/methods';
import { ask, defaultGraphDataset, loadOntology, NS, select, SEED_FILE, type Graph } from '../ontology/ontology';

/**
 * The intelligence gateway (platform spec section 3.4): the only code path that reads or
 * writes the graph. Every request carries a principal; reads are filtered by role and rule;
 * commits run as one transaction and are recorded with PROV-O provenance.
 */

export interface Principal {
  /** IRI of the person or agent. */
  person: string;
  /** IRI of the role they act in. */
  role: string;
}

export class GatewayError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404,
    readonly reasons: string[],
  ) {
    super(reasons.join('; '));
  }
}

export interface ObjectSummary {
  iri: string;
  identifier: string;
  type: string;
  typeLabel: string;
  state: Record<string, string>;
}

export interface ObjectView extends ObjectSummary {
  /** Outgoing and incoming links the principal may see, by relationship label. */
  links: { relationship: string; label: string; direction: 'out' | 'in'; objects: { iri: string; identifier: string }[] }[];
  properties: Record<string, string>;
}

export interface TypeDescription {
  type: string;
  label: string;
  comment: string;
  domain: string;
  dimensions: Record<string, unknown>[];
  methods: Record<string, unknown>[];
}

export interface NavigationDomain {
  domain: string;
  label: string;
  types: { type: string; label: string; pluralLabel: string; count: number }[];
}

export interface ToDoItem {
  object: ObjectSummary;
  /** Tasks the principal can run now. Empty for an urgent object with only on-demand methods available. */
  tasks: { method: string; label: string }[];
  /** On-demand methods available now, shown for urgent objects. */
  actions: { method: string; label: string }[];
  /** Highest urgency of the object's state values; 0 when none is urgent. */
  urgency: number;
  /** Earliest deadline, as an ISO date. */
  deadline?: string;
}

export interface CommitResult {
  commit: string;
  changes: { subject: string; property: string; oldValue?: string; newValue?: string }[];
  created: string[];
  pending: string[];
}

type Term = oxigraph.NamedNode | oxigraph.Literal;
interface Change {
  subject: string;
  property: string;
  oldValue?: Term;
  newValue?: Term;
}

const { namedNode, literal, quad, defaultGraph } = oxigraph;
const RDF_TYPE = `${NS.rdf}type`;

export interface GatewayOptions {
  dataNamespace?: string;
  now?: () => Date;
  /** Where the journal lives. Without one, state is held in memory only, as in tests. */
  journal?: Journal;
}

export class Gateway {
  private commitCount = 0;
  private readCount = 0;
  /** Commits run one at a time, in the order they arrive. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly graph: Graph,
    private readonly options: GatewayOptions = {},
  ) {
    this.commitCount = Number(this.q(`SELECT (COUNT(?c) AS ?n) WHERE { GRAPH ?c { ?c a p:Commit } }`)[0].n);
    this.readCount = Number(this.q(`SELECT (COUNT(?r) AS ?n) WHERE { GRAPH ?g { ?r a p:Read } }`)[0].n);
  }

  /** The ontology with the seed graph, in memory only: the starting point for tests. */
  static withSeed(extraTurtle: string[] = [], options: GatewayOptions = {}): Gateway {
    return new Gateway(loadOntology([readFileSync(SEED_FILE, 'utf8'), ...extraTurtle]), options);
  }

  /**
   * The ontology with the seed graph and everything in the journal at journalPath (platform spec
   * section 3.4, Persistence). Creates the journal if it does not exist. Refuses to start if the
   * journal's chain is broken or it was written on a different seed.
   */
  static open(journalPath: string, options: Omit<GatewayOptions, 'journal'> & { extraTurtle?: string[] } = {}): Gateway {
    const sources = [readFileSync(SEED_FILE, 'utf8'), ...(options.extraTurtle ?? [])];
    const graph = loadOntology(sources);
    const { journal, entries } = Journal.open(journalPath, seedFingerprint(sources), options.now?.() ?? new Date());
    for (const entry of entries) {
      for (const q of fromNQuads(entry.removed)) graph.store.delete(q);
      for (const q of fromNQuads(entry.added)) graph.store.add(q);
    }
    graph.dataset = defaultGraphDataset(graph.store);
    return new Gateway(graph, { ...options, journal });
  }

  private get dataNamespace() {
    return this.options.dataNamespace ?? NS.d;
  }

  private now() {
    return this.options.now?.() ?? new Date();
  }

  private q(query: string, graph: Graph = this.graph) {
    return select(graph.store, query);
  }

  // ---------------------------------------------------------------- principals

  /** The person must exist and be allowed to act in the role. */
  private authorize(principal: Principal): void {
    if (!ask(this.graph.store, `ASK { <${principal.person}> p:actsAs <${principal.role}> . <${principal.role}> a p:Role }`)) {
      throw new GatewayError(403, ['This person cannot act in this role']);
    }
  }

  private unreadable(role: string): Set<string> {
    return new Set(this.q(`SELECT ?x WHERE { <${role}> p:mayNotRead ?x }`).map((r) => r.x));
  }

  // ---------------------------------------------------------------- describe

  describe(principal: Principal): TypeDescription[] {
    this.authorize(principal);
    const hidden = this.unreadable(principal.role);
    const types = (this.q(`SELECT ?type ?label ?comment ?domain WHERE {
        ?type a p:ObjectType ; rdfs:label ?label ; rdfs:comment ?comment ; p:inDomain/rdfs:label ?domain } ORDER BY ?label`) as { type: string; label: string; comment: string; domain: string }[])
      .filter((t) => !hidden.has(t.type));
    return types.map((t) => ({
      ...t,
      dimensions: this.q(`SELECT ?dimension ?label ?scheme WHERE { ?dimension p:dimensionOf <${t.type}> ; rdfs:label ?label ; p:valuesFrom ?scheme }`).map(
        (d) => ({ ...d, values: this.q(`SELECT ?value ?label WHERE { ?value skos:inScheme <${d.scheme}> ; skos:prefLabel ?label }`) }),
      ),
      methods: this.q(`SELECT ?method ?label ?comment WHERE { ?method p:appliesTo <${t.type}> ; rdfs:label ?label ; rdfs:comment ?comment } ORDER BY ?label`).map(
        (m) => ({ ...m, inputs: this.inputs(m.method) }),
      ),
    }));
  }

  private inputs(method: string) {
    return this.q(`SELECT ?input ?name ?label ?datatype ?valuesFrom ?objectOf ?isActor ?choicesAlong WHERE {
        <${method}> p:input ?input . ?input p:inputName ?name ; rdfs:label ?label .
        OPTIONAL { ?input p:datatype ?datatype } OPTIONAL { ?input p:valuesFrom ?valuesFrom }
        OPTIONAL { ?input p:objectOf ?objectOf } OPTIONAL { ?input p:isActor ?isActor } OPTIONAL { ?input p:choicesAlong ?choicesAlong } }`);
  }

  // ---------------------------------------------------------------- navigation and to do

  /** The object world of the principal's work: their roles' work domains, limited to what they may read (spec 5.1). */
  navigation(principal: Principal): NavigationDomain[] {
    this.authorize(principal);
    const hidden = this.unreadable(principal.role);
    const domains = this.q(`SELECT ?domain ?label WHERE { <${principal.role}> p:worksIn ?domain . ?domain rdfs:label ?label } ORDER BY ?label`);
    return domains.map(({ domain, label }) => ({
      domain,
      label,
      types: this.q(`SELECT ?type ?label ?pluralLabel (COUNT(?o) AS ?count) WHERE {
          ?type a p:ObjectType ; p:inDomain <${domain}> ; rdfs:label ?label ; p:pluralLabel ?pluralLabel .
          OPTIONAL { ?o a ?type } } GROUP BY ?type ?label ?pluralLabel ORDER BY ?label`)
        .filter((t) => !hidden.has(t.type))
        .map((t) => ({ type: t.type, label: t.label, pluralLabel: t.pluralLabel, count: Number(t.count) })),
    }));
  }

  /**
   * To do (spec 5.1): objects where the principal can run a task now, or urgent objects where they can run
   * any method. Ordered by nearest deadline, then urgency.
   */
  async todo(principal: Principal): Promise<ToDoItem[]> {
    this.authorize(principal);
    const hidden = this.unreadable(principal.role);
    const methods = this.q(`SELECT ?method ?label ?type ?onDemand WHERE {
        <${principal.role}> p:mayRun ?method . ?method p:appliesTo ?type ; rdfs:label ?label .
        OPTIONAL { ?method p:onDemand ?onDemand } } ORDER BY ?label`).filter((m) => !hidden.has(m.type));
    const preconditions = new Map<string, string[]>();
    for (const { method } of methods) preconditions.set(method, this.q(`SELECT ?pre WHERE { <${method}> p:precondition ?pre }`).map((r) => r.pre));
    const validator = validatorFor(this.graph);

    const items: ToDoItem[] = [];
    for (const type of new Set(methods.map((m) => m.type))) {
      for (const { o } of this.q(`SELECT ?o WHERE { ?o a <${type}> }`)) {
        const urgency = Number(this.q(`SELECT (MAX(?u) AS ?max) WHERE { <${o}> ?d ?v . ?d a p:StateDimension . ?v p:urgency ?u }`)[0]?.max ?? 0);
        const tasks: ToDoItem['tasks'] = [];
        const actions: ToDoItem['actions'] = [];
        for (const m of methods.filter((m) => m.type === type)) {
          const isTask = m.onDemand !== 'true';
          if (!isTask && urgency < 3) continue;
          if ((await conformanceProblems(this.graph, o, preconditions.get(m.method)!, validator)).length) continue;
          (isTask ? tasks : actions).push({ method: m.method, label: m.label });
        }
        if (!tasks.length && !(urgency >= 3 && actions.length)) continue;
        const deadline = this.q(`SELECT (MIN(?date) AS ?first) WHERE { <${o}> ?p ?date . ?p p:isDeadline true }`)[0]?.first;
        items.push({ object: this.summary(o), tasks, actions, urgency, ...(deadline ? { deadline } : {}) });
      }
    }
    return items.sort(
      (a, b) =>
        (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') ||
        b.urgency - a.urgency ||
        a.object.identifier.localeCompare(b.object.identifier, undefined, { numeric: true }),
    );
  }

  // ---------------------------------------------------------------- reads

  /** Resolves an object IRI or identifier, such as SC-003, to its IRI. */
  resolve(idOrIri: string): string {
    if (idOrIri.includes('://')) return idOrIri;
    const match = this.q(`SELECT ?o WHERE { ?o ls:identifier ${JSON.stringify(idOrIri)} }`);
    if (!match.length) throw new GatewayError(404, [`No object ${idOrIri}`]);
    return match[0].o;
  }

  private typeOf(object: string): { type: string; typeLabel: string } {
    const rows = this.q(`SELECT ?type ?typeLabel WHERE { <${object}> a ?type . ?type a p:ObjectType ; rdfs:label ?typeLabel }`);
    if (!rows.length) throw new GatewayError(404, [`No object ${object}`]);
    return rows[0] as { type: string; typeLabel: string };
  }

  private canRead(principal: Principal, type: string): boolean {
    return !this.unreadable(principal.role).has(type);
  }

  find(principal: Principal, type: string, state: Record<string, string> = {}): ObjectSummary[] {
    this.authorize(principal);
    if (!this.canRead(principal, type)) throw new GatewayError(403, ['Your role cannot read this type']);
    const filters = Object.entries(state).map(([dim, value]) => `?o <${dim}> <${value}> .`).join(' ');
    return this.q(`SELECT ?o WHERE { ?o a <${type}> ; ls:identifier ?id . ${filters} } ORDER BY ?id`).map((r) => this.summary(r.o));
  }

  private summary(object: string): ObjectSummary {
    const { type, typeLabel } = this.typeOf(object);
    const identifier = this.q(`SELECT ?id WHERE { <${object}> ls:identifier ?id }`)[0]?.id ?? object;
    const state = Object.fromEntries(
      this.q(`SELECT ?dim ?value WHERE { ?d p:dimensionOf <${type}> ; rdfs:label ?dim . <${object}> ?d ?v . ?v skos:prefLabel ?value }`).map((r) => [r.dim, r.value]),
    );
    return { iri: object, identifier, type, typeLabel, state };
  }

  read(principal: Principal, idOrIri: string): ObjectView {
    this.authorize(principal);
    const object = this.resolve(idOrIri);
    const summary = this.summary(object);
    if (!this.canRead(principal, summary.type)) throw new GatewayError(403, ['Your role cannot read this object']);
    const hidden = this.unreadable(principal.role);
    for (const { prop, shape } of this.q(`SELECT ?prop ?shape WHERE { ?rule p:hides ?prop ; p:hiddenWhen ?shape }`)) {
      if (this.conformsSync(object, shape)) hidden.add(prop);
    }
    const visible = (o: string) => {
      const t = this.q(`SELECT ?t WHERE { <${o}> a ?t . ?t a p:ObjectType }`)[0]?.t;
      return !t || !hidden.has(t);
    };
    const links: ObjectView['links'] = [];
    for (const direction of ['out', 'in'] as const) {
      const pattern = direction === 'out' ? `<${object}> ?rel ?o` : `?o ?rel <${object}>`;
      const rows = this.q(`SELECT ?rel ?label ?o ?id WHERE { ${pattern} . ?rel a p:Relationship ; rdfs:label ?label . OPTIONAL { ?o ls:identifier ?id } } ORDER BY ?label ?id`);
      for (const r of rows) {
        if (!visible(r.o)) continue;
        let entry = links.find((l) => l.relationship === r.rel && l.direction === direction);
        if (!entry) links.push((entry = { relationship: r.rel, label: r.label, direction, objects: [] }));
        entry.objects.push({ iri: r.o, identifier: r.id ?? r.o });
      }
    }
    const properties = Object.fromEntries(
      this.q(`SELECT ?prop ?label ?value WHERE { <${object}> ?prop ?value . ?prop rdfs:label ?label .
          FILTER NOT EXISTS { ?prop a p:Relationship } FILTER NOT EXISTS { ?prop a p:StateDimension } FILTER(?prop != ls:identifier) }`)
        .filter((r) => !hidden.has(r.prop))
        .map((r) => [r.label, r.value]),
    );
    if (ask(this.graph.store, `ASK { <${summary.type}> p:holdsPersonalData true }`)) this.recordRead(principal, object);
    return { ...summary, links, properties };
  }

  /** A synchronous check of the hiding shapes, which use only core constraints on the object's own values. */
  private conformsSync(object: string, shape: string): boolean {
    const constraints = this.q(`SELECT ?class ?path ?value WHERE { OPTIONAL { <${shape}> sh:class ?class }
        OPTIONAL { <${shape}> sh:property ?ps . ?ps sh:path ?path ; sh:hasValue ?value } }`);
    return constraints.every((c) =>
      (!c.class || ask(this.graph.store, `ASK { <${object}> a <${c.class}> }`)) &&
      (!c.path || ask(this.graph.store, `ASK { <${object}> <${c.path}> <${c.value}> }`)),
    );
  }

  private recordRead(principal: Principal, object: string) {
    const at = this.now();
    const read = namedNode(`${this.dataNamespace}audit/read-${this.readCount + 1}`);
    const g = namedNode(`${this.dataNamespace}audit`);
    const quads = [
      quad(read, namedNode(RDF_TYPE), namedNode(`${NS.p}Read`), g),
      quad(read, namedNode(`${NS.prov}wasAssociatedWith`), namedNode(principal.person), g),
      quad(read, namedNode(`${NS.p}actedAs`), namedNode(principal.role), g),
      quad(read, namedNode(`${NS.p}target`), namedNode(object), g),
      quad(read, namedNode(`${NS.prov}startedAtTime`), literal(at.toISOString(), namedNode(`${NS.xsd}dateTime`)), g),
    ];
    // Journal first: if the read cannot be recorded durably, it is not answered.
    this.options.journal?.append('read', at, [], quads);
    for (const q of quads) this.graph.store.add(q);
    this.readCount++;
  }

  /** The audit trail of personal-data reads, newest last. */
  reads(): { person: string; role: string; object: string; at: string }[] {
    return this.q(`SELECT ?person ?role ?object ?at WHERE { GRAPH <${this.dataNamespace}audit> {
        ?r a p:Read ; prov:wasAssociatedWith ?person ; p:actedAs ?role ; p:target ?object ; prov:startedAtTime ?at } } ORDER BY ?at STRLEN(STR(?r)) ?r`) as never;
  }

  // ---------------------------------------------------------------- methods

  async methods(principal: Principal, idOrIri: string): Promise<MethodOption[]> {
    this.authorize(principal);
    const object = this.resolve(idOrIri);
    if (!this.canRead(principal, this.typeOf(object).type)) throw new GatewayError(403, ['Your role cannot read this object']);
    return methodsFor(this.graph, object, principal.role);
  }

  // ---------------------------------------------------------------- commits

  /** Commits run one at a time: each waits for the one before it to finish. */
  commit(principal: Principal, idOrIri: string, method: string, inputs: Record<string, string> = {}): Promise<CommitResult> {
    const run = this.queue.then(() => this.runCommit(principal, idOrIri, method, inputs));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async runCommit(principal: Principal, idOrIri: string, method: string, inputs: Record<string, string>): Promise<CommitResult> {
    this.authorize(principal);
    const object = this.resolve(idOrIri);
    const { type } = this.typeOf(object);
    if (!ask(this.graph.store, `ASK { <${method}> a p:Method ; p:appliesTo <${type}> }`)) throw new GatewayError(400, ['This method does not apply to this object']);

    // 1. The role may run the method.
    if (!ask(this.graph.store, `ASK { <${principal.role}> p:mayRun <${method}> }`)) throw new GatewayError(403, ['Your role cannot run this method']);

    // 2. Every input is present, of the right kind, and meets its constraints.
    const resolvedInputs = await this.checkInputs(object, method, inputs);

    // 3. The object meets every precondition.
    const preconditions = this.q(`SELECT ?pre WHERE { <${method}> p:precondition ?pre }`).map((r) => r.pre);
    const blocks = await conformanceProblems(this.graph, object, preconditions);
    if (blocks.length) throw new GatewayError(400, blocks);

    // 4. Apply the declared effects, to a working copy that readers never see.
    // Only the current state is copied; commit and audit records live in named graphs, which grow with history.
    const work: Graph = { store: new oxigraph.Store(this.graph.store.match(null, null, null, defaultGraph()) as oxigraph.Quad[]), dataset: this.graph.dataset };
    const at = this.now();
    const changes: Change[] = [];
    const created: string[] = [];
    const pending: string[] = [];
    for (const effect of this.q(`SELECT ?e ?kind WHERE { <${method}> p:effect ?e . ?e a ?kind FILTER(STRSTARTS(STR(?kind), "${NS.p}")) } ORDER BY ?e`)) {
      const kind = effect.kind.slice(NS.p.length);
      if (kind === 'StateChange') this.applyStateChange(work, object, effect.e, resolvedInputs, changes);
      else if (kind === 'Creation') created.push(this.applyCreation(work, object, effect.e, resolvedInputs, principal, at, changes));
      else if (kind === 'Link') this.applyLink(work, object, effect.e, resolvedInputs, changes);
      else if (kind === 'DescribedEffect') pending.push(effect.e);
    }

    // 5. Validate the changed copy against every shape. Any violation discards it.
    work.dataset = defaultGraphDataset(work.store);
    const problems = await validateData(work);
    if (problems.length) throw new GatewayError(400, problems);

    // 6. Record the commit: journal first, flushed to disk, then the live graph.
    const commit = `${this.dataNamespace}commit/${this.commitCount + 1}`;
    const record = this.record(commit, principal, object, method, resolvedInputs, changes, created, pending, at);
    const removed = changes.filter((c) => c.oldValue).map((c) => quad(namedNode(c.subject), namedNode(c.property), c.oldValue!, defaultGraph()));
    const added = [...changes.filter((c) => c.newValue).map((c) => quad(namedNode(c.subject), namedNode(c.property), c.newValue!, defaultGraph())), ...record];
    this.options.journal?.append('commit', at, removed, added);
    for (const q of removed) this.graph.store.delete(q);
    for (const q of added) this.graph.store.add(q);
    // The working copy's default graph is now exactly the live one, so its validated dataset is reused.
    this.graph.dataset = work.dataset;
    this.commitCount++;

    return {
      commit,
      changes: changes.map((c) => ({ subject: c.subject, property: c.property, oldValue: c.oldValue?.value, newValue: c.newValue?.value })),
      created,
      pending,
    };
  }

  private async checkInputs(object: string, method: string, given: Record<string, string>): Promise<Map<string, Term>> {
    const inputs = this.inputs(method);
    const problems: string[] = [];
    const resolved = new Map<string, Term>();
    for (const name of Object.keys(given)) {
      if (!inputs.some((i) => i.name === name)) problems.push(`Unknown input ${name}`);
    }
    for (const input of inputs) {
      const raw = given[input.name];
      if (raw === undefined || raw === '') {
        problems.push(`${input.label} is required`);
        continue;
      }
      let value: Term;
      if (input.datatype) {
        if (input.datatype === `${NS.xsd}anyURI` && !URL.canParse(raw)) problems.push(`${input.label} must be a web address`);
        value = literal(raw, namedNode(input.datatype));
      } else {
        const iri = input.valuesFrom ? raw : this.tryResolve(raw);
        value = namedNode(iri);
        if (input.valuesFrom && !ask(this.graph.store, `ASK { <${iri}> skos:inScheme <${input.valuesFrom}> }`)) problems.push(`${input.label} is not an allowed value`);
        if (input.objectOf && !ask(this.graph.store, `ASK { <${iri}> a <${input.objectOf}> }`)) problems.push(`${input.label} is not the right kind of object`);
        if (input.isActor && !ask(this.graph.store, `ASK { <${iri}> a p:Person }`)) problems.push(`${input.label} is not a known person`);
        if (input.choicesAlong && !ask(this.graph.store, `ASK { <${object}> <${input.choicesAlong}> <${iri}> }`)) problems.push(`${input.label} is not one of the allowed choices`);
      }
      for (const { shape } of this.q(`SELECT ?shape WHERE { <${input.input}> p:inputShape ?shape }`)) {
        problems.push(...(await conformanceProblems(this.graph, value.value, [shape])));
      }
      for (const { prop } of this.q(`SELECT ?prop WHERE { <${input.input}> p:distinctFrom ?prop }`)) {
        if (ask(this.graph.store, `ASK { <${object}> <${prop}> <${value.value}> }`)) problems.push(`${input.label} must be someone else (rule 5: separation of duties)`);
      }
      resolved.set(input.input, value);
    }
    if (problems.length) throw new GatewayError(400, problems);
    return resolved;
  }

  private tryResolve(raw: string): string {
    try {
      return this.resolve(raw);
    } catch {
      return raw.includes('://') ? raw : `${this.dataNamespace}${raw}`;
    }
  }

  private set(work: Graph, subject: string, property: string, value: Term | undefined, changes: Change[], replace = true) {
    const s = namedNode(subject);
    const p = namedNode(property);
    const old = replace ? (work.store.match(s, p, null, defaultGraph()) as oxigraph.Quad[]) : [];
    for (const q of old) {
      work.store.delete(q);
      changes.push({ subject, property, oldValue: q.object as Term });
    }
    if (value) {
      work.store.add(quad(s, p, value, defaultGraph()));
      const last = changes.at(-1);
      if (old.length && last && last.subject === subject && last.property === property && !last.newValue) last.newValue = value;
      else changes.push({ subject, property, newValue: value });
    }
  }

  private applyStateChange(work: Graph, object: string, effect: string, inputs: Map<string, Term>, changes: Change[]) {
    const e = this.q(`SELECT ?dim ?value ?fromInput ?along ?alongInverse ?whenInput ?whenValue WHERE { <${effect}> p:dimension ?dim .
        OPTIONAL { <${effect}> p:value ?value } OPTIONAL { <${effect}> p:valueFromInput ?fromInput } OPTIONAL { <${effect}> p:along ?along }
        OPTIONAL { <${effect}> p:alongInverse ?alongInverse } OPTIONAL { <${effect}> p:whenInput ?whenInput ; p:whenValue ?whenValue } }`)[0];
    if (e.whenInput && inputs.get(e.whenInput)?.value !== e.whenValue) return;
    const value = e.value ? namedNode(e.value) : inputs.get(e.fromInput);
    const targets = e.along
      ? this.q(`SELECT ?t WHERE { <${object}> <${e.along}> ?t }`, work).map((r) => r.t)
      : e.alongInverse
        ? this.q(`SELECT ?t WHERE { ?t <${e.alongInverse}> <${object}> }`, work).map((r) => r.t)
        : [object];
    for (const target of targets) this.set(work, target, e.dim, value, changes);
  }

  private applyCreation(work: Graph, object: string, effect: string, inputs: Map<string, Term>, principal: Principal, at: Date, changes: Change[]): string {
    const e = this.q(`SELECT ?type ?typeLabel ?link ?actorAs ?setsDate ?fromDate ?days WHERE { <${effect}> p:createsType ?type . ?type rdfs:label ?typeLabel .
        OPTIONAL { <${effect}> p:linkedBy ?link } OPTIONAL { <${effect}> p:recordsActorAs ?actorAs } OPTIONAL { <${effect}> p:setsDate ?setsDate }
        OPTIONAL { <${effect}> p:fromDate ?fromDate } OPTIONAL { <${effect}> p:plusDays/p:parameterValue ?days } }`)[0];
    const prefix = e.typeLabel.replace(/[^A-Za-z]+/g, '');
    let n = Number(this.q(`SELECT (COUNT(?o) AS ?n) WHERE { ?o a <${e.type}> }`, work)[0].n) + 1;
    while (ask(work.store, `ASK { ?o ls:identifier "${prefix}-${n}" }`)) n++;
    const identifier = `${prefix}-${n}`;
    const created = `${this.dataNamespace}${identifier}`;
    this.set(work, created, RDF_TYPE, namedNode(e.type), changes, false);
    this.set(work, created, `${NS.ls}identifier`, literal(identifier), changes, false);
    if (e.link) this.set(work, created, e.link, namedNode(object), changes, false);
    const states = [
      ...this.q(`SELECT ?v WHERE { <${effect}> p:initialState ?v }`).map((r) => r.v),
      ...this.q(`SELECT ?i WHERE { <${effect}> p:initialFromInput ?i }`).map((r) => inputs.get(r.i)!.value),
    ];
    for (const value of states) {
      const dim = this.q(`SELECT ?d WHERE { ?d p:dimensionOf <${e.type}> ; p:valuesFrom ?s . <${value}> skos:inScheme ?s }`)[0].d;
      this.set(work, created, dim, namedNode(value), changes, false);
    }
    if (e.actorAs) this.set(work, created, e.actorAs, namedNode(principal.person), changes, false);
    if (e.setsDate) {
      let day = at;
      if (e.fromDate) {
        const from = this.q(`SELECT ?d WHERE { <${object}> <${e.fromDate}> ?d }`, work)[0]?.d;
        if (!from) throw new GatewayError(400, [`The object has no ${e.fromDate.split('#').pop()} to count from`]);
        day = new Date(`${from}T00:00:00Z`);
        day.setUTCDate(day.getUTCDate() + Number(e.days ?? 0));
      }
      this.set(work, created, e.setsDate, literal(day.toISOString().slice(0, 10), namedNode(`${NS.xsd}date`)), changes, false);
    }
    return created;
  }

  private applyLink(work: Graph, object: string, effect: string, inputs: Map<string, Term>, changes: Change[]) {
    const e = this.q(`SELECT ?link ?input WHERE { <${effect}> p:linkedBy ?link ; p:toInput ?input }`)[0];
    this.set(work, object, e.link, inputs.get(e.input), changes, false);
  }

  /** The commit's provenance record, as statements in its own named graph. */
  private record(id: string, principal: Principal, object: string, method: string, inputs: Map<string, Term>, changes: Change[], created: string[], pending: string[], at: Date): oxigraph.Quad[] {
    const g = namedNode(id);
    const quads: oxigraph.Quad[] = [];
    const add = (s: string, p: string, o: Term) => quads.push(quad(namedNode(s), namedNode(p), o, g));
    add(id, RDF_TYPE, namedNode(`${NS.p}Commit`));
    add(id, `${NS.p}method`, namedNode(method));
    add(id, `${NS.p}target`, namedNode(object));
    add(id, `${NS.prov}wasAssociatedWith`, namedNode(principal.person));
    add(id, `${NS.p}actedAs`, namedNode(principal.role));
    add(id, `${NS.prov}startedAtTime`, literal(at.toISOString(), namedNode(`${NS.xsd}dateTime`)));
    let i = 0;
    for (const [input, value] of inputs) {
      const iv = `${id}/input/${++i}`;
      add(id, `${NS.p}inputValue`, namedNode(iv));
      add(iv, RDF_TYPE, namedNode(`${NS.p}InputValue`));
      add(iv, `${NS.p}forInput`, namedNode(input));
      add(iv, `${NS.rdf}value`, value);
    }
    changes.forEach((c, k) => {
      const ch = `${id}/change/${k + 1}`;
      add(id, `${NS.p}change`, namedNode(ch));
      add(ch, RDF_TYPE, namedNode(`${NS.p}ValueChange`));
      add(ch, `${NS.p}changedSubject`, namedNode(c.subject));
      add(ch, `${NS.p}changedProperty`, namedNode(c.property));
      if (c.oldValue) add(ch, `${NS.p}oldValue`, c.oldValue);
      if (c.newValue) add(ch, `${NS.p}newValue`, c.newValue);
    });
    for (const o of created) add(id, `${NS.prov}generated`, namedNode(o));
    for (const e of pending) add(id, `${NS.p}pendingEffect`, namedNode(e));
    return quads;
  }

  /** Every commit, oldest first. */
  commits(): { commit: string; method: string; target: string; person: string; role: string; at: string }[] {
    return this.q(`SELECT ?commit ?method ?target ?person ?role ?at WHERE { GRAPH ?commit {
        ?commit a p:Commit ; p:method ?method ; p:target ?target ; prov:wasAssociatedWith ?person ; p:actedAs ?role ; prov:startedAtTime ?at } }
        ORDER BY ?at STRLEN(STR(?commit)) ?commit`) as never;
  }
}
