import * as oxigraph from 'oxigraph';
import { analysisDescriptions, analysisOf, backgroundBlocks, planDisproportionality } from '../ontology/analyses';
import { archetypeOf, type Archetype } from '../ontology/archetypes';
import { conformanceProblems, methodsFor, validateData, validatorFor, type MethodOption } from '../ontology/methods';
import { ask, defaultGraphDataset, NS, select, type Graph } from '../ontology/ontology';

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
  tasks: { method: string; label: string; archetype: Archetype }[];
  /** On-demand methods available now, shown for urgent objects. */
  actions: { method: string; label: string; archetype: Archetype }[];
  /** Highest urgency of the object's state values; 0 when none is urgent. */
  urgency: number;
  /** Earliest deadline, as an ISO date. */
  deadline?: string;
}

export interface ComposedInput {
  name: string;
  label: string;
  kind: 'text' | 'url' | 'choice' | 'person' | 'object';
  /** The values the person may choose from, with their labels. */
  choices?: { value: string; label: string }[];
  default?: string;
}

/** What a signed method asks the signer to agree to (spec 3.4, Electronic signatures). */
export interface SignatureRequest {
  signer: string;
  signerName: string;
  meaning: string;
  /** True while signing is by typed name in development mode: not a valid electronic signature. */
  development: boolean;
}

/** A signature given at commit: in development mode, the signer's full name, typed. */
export interface SignatureGiven {
  typedName: string;
}

export interface MethodComposition {
  method: string;
  label: string;
  archetype: Archetype;
  object: ObjectSummary;
  inputs: ComposedInput[];
  /** Present when the method requires a signature. */
  signature?: SignatureRequest;
}

export interface CommitResult {
  commit: string;
  changes: ChangeView[];
  created: string[];
  /** Described effects recorded as pending work (spec 3.4). */
  pending: string[];
  /** What each pending effect will do, in words, in the same order. */
  pendingDescriptions: string[];
  /** The signature bound to the commit, when the method requires one. */
  signature?: { signerName: string; signedAt: string; meaning: string; development: boolean };
  /** What the method's background run will do, in words. Empty unless the method runs in the background. */
  background: string[];
  /** The background run the commit started, for a method that runs in the background. */
  run?: RunView;
}

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed';

/** A background run (spec 3.4, Background runs), as the principal may see it. */
export interface RunView {
  run: string;
  method: string;
  methodLabel: string;
  object: string;
  objectIdentifier: string;
  status: RunStatus;
  /** How much is done, from 0 to 1, while it runs. Reported, not kept. */
  progress?: number;
  startedBy: string;
  startedByName: string;
  startedAt: string;
  endedAt?: string;
  /** What the run found, or why it failed. */
  message?: string;
  /** The objects the run created. */
  created: { iri: string; identifier: string }[];
}

/** A notification, as its recipient sees it. */
export interface NotificationView {
  notification: string;
  title: string;
  message: string;
  /** How the run it is about ended. */
  status: 'succeeded' | 'failed';
  run: string;
  object: string;
  objectIdentifier: string;
  at: string;
  read: boolean;
}

type Term = oxigraph.NamedNode | oxigraph.Literal;
interface Change {
  subject: string;
  property: string;
  oldValue?: Term;
  newValue?: Term;
}

const { namedNode, literal, quad, defaultGraph } = oxigraph;

/** Query rows with ?value and ?label, as choices. */
const asChoices = (rows: Record<string, string>[]) => rows.map((r) => ({ value: r.value, label: r.label }));

/** A change as the person reads it: who, what, from and to, with labels. */
export interface ChangeView {
  subject: string;
  property: string;
  oldValue?: string;
  newValue?: string;
  subjectLabel: string;
  propertyLabel: string;
  oldLabel?: string;
  newLabel?: string;
}
const RDF_TYPE = `${NS.rdf}type`;

/** The part of the journal the gateway writes to (see journal.ts, server only). */
export interface JournalWriter {
  append(kind: JournalKind, at: Date, removed: oxigraph.Quad[], added: oxigraph.Quad[]): unknown;
}

/** What a journal entry records: a commit, a recorded read, a run's change of status, or notifications read. */
export type JournalKind = 'commit' | 'read' | 'run' | 'notification';

const RUN_STATUS = (status: RunStatus) => namedNode(`${NS.p}RunStatus-${status}`);
const WORKER = `${NS.p}BackgroundWorker`;
const xsdDateTime = (at: Date) => literal(at.toISOString(), namedNode(`${NS.xsd}dateTime`));
/** Lets readers in while a worker runs, between steps of its work. */
const yieldToReaders = () => new Promise((resolve) => setTimeout(resolve, 0));

export interface GatewayOptions {
  dataNamespace?: string;
  now?: () => Date;
  /** Accept signatures by typed name (development only, never a valid electronic signature). Off by default. */
  developmentSignatures?: boolean;
  /** Where commits and recorded reads are written before the gateway answers. Without one, state is in memory only. */
  journal?: JournalWriter;
}

export class Gateway {
  private commitCount = 0;
  private readCount = 0;
  private runCount = 0;
  private notificationCount = 0;
  /** Each running run's progress, from 0 to 1. Reported while it runs, not kept (spec 3.4). */
  private readonly progress = new Map<string, number>();
  /** Commits and background work run one at a time, in the order they arrive. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly graph: Graph,
    private readonly options: GatewayOptions = {},
  ) {
    this.commitCount = Number(this.q(`SELECT (COUNT(?c) AS ?n) WHERE { GRAPH ?c { ?c a p:Commit } }`)[0].n);
    this.readCount = Number(this.q(`SELECT (COUNT(?r) AS ?n) WHERE { GRAPH ?g { ?r a p:Read } }`)[0].n);
    this.runCount = Number(this.q(`SELECT (COUNT(?r) AS ?n) WHERE { GRAPH ?r { ?r a p:Run } }`)[0].n);
    this.notificationCount = Number(this.q(`SELECT (COUNT(?x) AS ?n) WHERE { GRAPH ?x { ?x a p:Notification } }`)[0].n);
    // A run that had not ended when the gateway stopped starts again (spec 3.4, Background runs).
    for (const { run } of this.q(`SELECT ?run WHERE { GRAPH ?run { ?run a p:Run ; p:runStatus ?s ; prov:startedAtTime ?at FILTER(?s IN (p:RunStatus-queued, p:RunStatus-running)) } } ORDER BY ?at STRLEN(STR(?run)) ?run`)) {
      void this.enqueue(() => this.work(run));
    }
  }

  /** Runs a task after every commit and run before it. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** Resolves once every commit and background run queued so far, and any they queue in turn, has finished. */
  async idle(): Promise<void> {
    let current: Promise<unknown>;
    do {
      current = this.queue;
      await current;
    } while (current !== this.queue);
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
        (m) => ({ ...m, archetype: archetypeOf(this.graph.store, m.method), inputs: this.inputs(m.method) }),
      ),
    }));
  }

  private inputs(method: string) {
    return this.q(`SELECT ?input ?name ?label ?datatype ?valuesFrom ?objectOf ?isActor ?choicesAlong WHERE {
        <${method}> p:input ?input . ?input p:inputName ?name ; rdfs:label ?label ; p:order ?order .
        OPTIONAL { ?input p:datatype ?datatype } OPTIONAL { ?input p:valuesFrom ?valuesFrom }
        OPTIONAL { ?input p:objectOf ?objectOf } OPTIONAL { ?input p:isActor ?isActor } OPTIONAL { ?input p:choicesAlong ?choicesAlong } } ORDER BY ?order`);
  }

  // ---------------------------------------------------------------- people (development)

  /**
   * The people and agents in the graph, with the roles each may act in. For the development persona
   * switcher only (design system spec 4.1); the HTTP transport serves it in development mode only.
   */
  people(): { person: string; name: string; roles: { role: string; label: string }[] }[] {
    const rows = this.q(`SELECT ?person ?name ?role ?label WHERE { ?person a p:Person ; rdfs:label ?name ; p:actsAs ?role . ?role rdfs:label ?label } ORDER BY ?name ?label`);
    const people = new Map<string, { person: string; name: string; roles: { role: string; label: string }[] }>();
    for (const r of rows) {
      const entry = people.get(r.person) ?? { person: r.person, name: r.name, roles: [] };
      entry.roles.push({ role: r.role, label: r.label });
      people.set(r.person, entry);
    }
    return [...people.values()];
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
          (isTask ? tasks : actions).push({ method: m.method, label: m.label, archetype: archetypeOf(this.graph.store, m.method) });
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
    // Coded values show their labels; a property with several values shows them all, in order.
    const properties: Record<string, string> = {};
    for (const r of this.q(`SELECT ?prop ?label ?value ?valueLabel WHERE { <${object}> ?prop ?value . ?prop rdfs:label ?label .
          OPTIONAL { ?value skos:prefLabel ?valueLabel } OPTIONAL { ?value p:order ?order }
          FILTER NOT EXISTS { ?prop a p:Relationship } FILTER NOT EXISTS { ?prop a p:StateDimension } FILTER(?prop != ls:identifier) } ORDER BY ?label ?order ?value`)) {
      if (hidden.has(r.prop)) continue;
      const value = r.valueLabel ?? r.value;
      properties[r.label] = properties[r.label] ? `${properties[r.label]}, ${value}` : value;
    }
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
  commit(principal: Principal, idOrIri: string, method: string, inputs: Record<string, string> = {}, signature?: SignatureGiven): Promise<CommitResult> {
    return this.enqueue(() => this.runCommit(principal, idOrIri, method, inputs, signature));
  }

  /**
   * Commit steps 1 to 5 (spec 3.4) on a working copy: role, inputs, preconditions, effects and validation.
   * Throws with the reasons at the first failure. Nothing reaches the live graph.
   */
  private async plan(principal: Principal, idOrIri: string, method: string, inputs: Record<string, string>) {
    this.authorize(principal);
    const object = this.resolve(idOrIri);
    const { type } = this.typeOf(object);
    if (!ask(this.graph.store, `ASK { <${method}> a p:Method ; p:appliesTo <${type}> }`)) throw new GatewayError(400, ['This method does not apply to this object']);

    // A background method no worker can do is refused before anything else (spec 3.4, Background runs).
    const noWorker = backgroundBlocks(this.graph.store, method);
    if (noWorker.length) throw new GatewayError(400, noWorker);

    // 1. The role may run the method.
    if (!ask(this.graph.store, `ASK { <${principal.role}> p:mayRun <${method}> }`)) throw new GatewayError(403, ['Your role cannot run this method']);

    // 2. Every input is present, of the right kind, and meets its constraints.
    const resolvedInputs = await this.checkInputs(principal, object, method, inputs);

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

    return { object, method, resolvedInputs, work, at, changes, created, pending };
  }

  /** Preview a method (spec 3.4): what a commit would change, without saving anything. */
  async preview(principal: Principal, idOrIri: string, method: string, inputs: Record<string, string> = {}): Promise<Omit<CommitResult, 'commit'>> {
    const { changes, created, pending, work } = await this.plan(principal, idOrIri, method, inputs);
    return {
      changes: changes.map((c) => this.changeView(c, work)),
      created,
      pending,
      pendingDescriptions: this.describe_(pending),
      background: analysisDescriptions(this.graph.store, method),
    };
  }

  private async runCommit(principal: Principal, idOrIri: string, method: string, inputs: Record<string, string>, given?: SignatureGiven): Promise<CommitResult> {
    const { object, resolvedInputs, work, at, changes, created, pending } = await this.plan(principal, idOrIri, method, inputs);
    const signature = this.checkSignature(principal, method, given);

    // 6. Record the commit: journal first, flushed to disk, then the live graph.
    const commit = `${this.dataNamespace}commit/${this.commitCount + 1}`;
    const record = this.record(commit, principal, object, method, resolvedInputs, changes, created, pending, at, signature);
    const removed = changes.filter((c) => c.oldValue).map((c) => quad(namedNode(c.subject), namedNode(c.property), c.oldValue!, defaultGraph()));
    const added = [...changes.filter((c) => c.newValue).map((c) => quad(namedNode(c.subject), namedNode(c.property), c.newValue!, defaultGraph())), ...record];
    // A background method's commit also starts its run, in the same entry (spec 3.4, Background runs).
    const run = analysisOf(this.graph.store, method) ? `${this.dataNamespace}run/${this.runCount + 1}` : undefined;
    if (run) added.push(...this.runRecord(run, principal, object, method, commit, at));
    this.options.journal?.append('commit', at, removed, added);
    for (const q of removed) this.graph.store.delete(q);
    for (const q of added) this.graph.store.add(q);
    // The working copy's default graph is now exactly the live one, so its validated dataset is reused.
    this.graph.dataset = work.dataset;
    this.commitCount++;
    if (run) {
      this.runCount++;
      void this.enqueue(() => this.work(run));
    }

    return {
      commit,
      changes: changes.map((c) => this.changeView(c, work)),
      created,
      pending,
      pendingDescriptions: this.describe_(pending),
      ...(signature ? { signature: { signerName: signature.signerName, signedAt: at.toISOString(), meaning: signature.meaning, development: signature.development } } : {}),
      background: analysisDescriptions(this.graph.store, method),
      ...(run ? { run: this.runView(run) } : {}),
    };
  }

  /** What signing a method means, and who would sign: undefined when the method needs no signature. */
  private signatureRequest(principal: Principal, method: string): SignatureRequest | undefined {
    const meaning = this.q(`SELECT ?m WHERE { <${method}> p:requiresSignature true ; p:signatureMeaning ?m }`)[0]?.m;
    if (!meaning) return undefined;
    const signerName = this.q(`SELECT ?n WHERE { <${principal.person}> rdfs:label ?n }`)[0]?.n ?? principal.person;
    return { signer: principal.person, signerName, meaning, development: Boolean(this.options.developmentSignatures) };
  }

  /** Electronic signatures (spec 3.4): the principal signs, never an agent, and only as development mode allows. */
  private checkSignature(principal: Principal, method: string, given?: SignatureGiven): SignatureRequest | undefined {
    const request = this.signatureRequest(principal, method);
    if (!request) return undefined;
    if (ask(this.graph.store, `ASK { <${principal.person}> p:isAgent true }`)) throw new GatewayError(403, ['Only a person can sign. Agents never sign.']);
    if (!this.options.developmentSignatures) throw new GatewayError(403, ['Signing needs an identity provider, and none is connected yet.']);
    if (!given) throw new GatewayError(400, ['This method needs your signature.']);
    const normal = (n: string) => n.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
    if (normal(given.typedName) !== normal(request.signerName)) throw new GatewayError(400, ['The typed name does not match your name.']);
    return request;
  }

  private describe_(effects: string[]): string[] {
    return effects.map((e) => this.q(`SELECT ?d WHERE { <${e}> p:description ?d }`)[0]?.d ?? e);
  }

  /** Labels a change from the graph it was made in: identifiers for objects, labels for concepts and people. */
  private changeView(c: Change, graph: Graph): ChangeView {
    const label = (term?: Term) => {
      if (!term) return undefined;
      if (term.termType === 'Literal') return term.value;
      return this.q(`SELECT ?l WHERE { { <${term.value}> skos:prefLabel ?l } UNION { <${term.value}> ls:identifier ?l } UNION { <${term.value}> rdfs:label ?l } } LIMIT 1`, graph)[0]?.l ?? term.value;
    };
    return {
      subject: c.subject,
      property: c.property,
      oldValue: c.oldValue?.value,
      newValue: c.newValue?.value,
      subjectLabel: label(namedNode(c.subject))!,
      propertyLabel: c.property === RDF_TYPE ? 'type' : label(namedNode(c.property))!,
      ...(c.oldValue ? { oldLabel: label(c.oldValue) } : {}),
      ...(c.newValue ? { newLabel: label(c.newValue) } : {}),
    };
  }

  /** Compose a method (spec 3.4): its inputs with their kinds, choices and defaults, and its archetype. */
  async compose(principal: Principal, idOrIri: string, method: string): Promise<MethodComposition> {
    this.authorize(principal);
    const object = this.resolve(idOrIri);
    const { type } = this.typeOf(object);
    if (!this.canRead(principal, type)) throw new GatewayError(403, ['Your role cannot read this object']);
    const m = this.q(`SELECT ?label WHERE { <${method}> a p:Method ; p:appliesTo <${type}> ; rdfs:label ?label }`)[0];
    if (!m) throw new GatewayError(400, ['This method does not apply to this object']);
    if (!ask(this.graph.store, `ASK { <${principal.role}> p:mayRun <${method}> }`)) throw new GatewayError(403, ['Your role cannot run this method']);

    const validator = validatorFor(this.graph);
    const signature = this.signatureRequest(principal, method);
    const inputs = await Promise.all(this.inputs(method).map(async (input): Promise<ComposedInput> => {
      const base = { name: input.name, label: input.label };
      if (input.datatype) return { ...base, kind: input.datatype === `${NS.xsd}anyURI` ? 'url' : 'text' };
      if (input.valuesFrom) {
        // The input's shape may narrow the scheme, such as causality without "unassessed".
        const narrowed = this.q(`SELECT ?value WHERE { <${input.input}> p:inputShape ?shape . ?shape sh:in/rdf:rest*/rdf:first ?value }`).map((r) => r.value);
        const choices = this.q(`SELECT ?value ?label WHERE { ?value skos:inScheme <${input.valuesFrom}> ; skos:prefLabel ?label ; p:order ?order } ORDER BY ?order`)
          .filter((c) => !narrowed.length || narrowed.includes(c.value));
        return { ...base, kind: 'choice', choices: asChoices(choices) };
      }
      if (input.isActor && signature) {
        // A signed method's person input is the signer: the principal, and nobody else (spec 3.4).
        return { ...base, kind: 'person', choices: [{ value: principal.person, label: signature.signerName }], default: principal.person };
      }
      if (input.isActor) {
        // People whose roles may run this method, or everyone when no role may yet. The principal by default.
        let people = this.q(`SELECT DISTINCT ?value ?label WHERE { ?value a p:Person ; rdfs:label ?label ; p:actsAs/p:mayRun <${method}> } ORDER BY ?label`);
        if (!people.length) people = this.q(`SELECT ?value ?label WHERE { ?value a p:Person ; rdfs:label ?label } ORDER BY ?label`);
        const self = people.some((p) => p.value === principal.person) ? principal.person : undefined;
        return { ...base, kind: 'person', choices: asChoices(people), ...(self ? { default: self } : {}) };
      }
      const candidates = input.choicesAlong
        ? this.q(`SELECT ?value ?label WHERE { <${object}> <${input.choicesAlong}> ?value . ?value ls:identifier ?label } ORDER BY ?label`)
        : this.q(`SELECT ?value ?label WHERE { ?value a <${input.objectOf}> ; ls:identifier ?label FILTER(?value != <${object}>) } ORDER BY ?label`);
      // Only objects that meet the input's shape qualify, such as cases that are not closed.
      const shapes = this.q(`SELECT ?shape WHERE { <${input.input}> p:inputShape ?shape }`).map((r) => r.shape);
      const qualifying = [];
      for (const c of candidates) if (!(await conformanceProblems(this.graph, c.value, shapes, validator)).length) qualifying.push(c);
      return { ...base, kind: 'object', choices: asChoices(qualifying) };
    }));
    return { method, label: m.label, archetype: archetypeOf(this.graph.store, method), object: this.summary(object), inputs, ...(signature ? { signature } : {}) };
  }

  private async checkInputs(principal: Principal, object: string, method: string, given: Record<string, string>): Promise<Map<string, Term>> {
    const inputs = this.inputs(method);
    const signed = ask(this.graph.store, `ASK { <${method}> p:requiresSignature true }`);
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
        else if (input.isActor && signed && iri !== principal.person) problems.push(`${input.label} must be you: nobody signs for someone else`);
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
  private record(id: string, principal: Principal, object: string, method: string, inputs: Map<string, Term>, changes: Change[], created: string[], pending: string[], at: Date, signature?: SignatureRequest, onBehalfOf?: string): oxigraph.Quad[] {
    const g = namedNode(id);
    const quads: oxigraph.Quad[] = [];
    const add = (s: string, p: string, o: Term) => quads.push(quad(namedNode(s), namedNode(p), o, g));
    add(id, RDF_TYPE, namedNode(`${NS.p}Commit`));
    add(id, `${NS.p}method`, namedNode(method));
    add(id, `${NS.p}target`, namedNode(object));
    add(id, `${NS.prov}wasAssociatedWith`, namedNode(principal.person));
    add(id, `${NS.p}actedAs`, namedNode(principal.role));
    if (onBehalfOf) add(id, `${NS.p}onBehalfOf`, namedNode(onBehalfOf));
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
    if (signature) {
      // Bound to the commit's own record, so the signature cannot be separated from what was signed.
      const sig = `${id}/signature`;
      add(id, `${NS.p}signature`, namedNode(sig));
      add(sig, RDF_TYPE, namedNode(`${NS.p}Signature`));
      add(sig, `${NS.p}signedBy`, namedNode(signature.signer));
      add(sig, `${NS.p}signedAt`, literal(at.toISOString(), namedNode(`${NS.xsd}dateTime`)));
      add(sig, `${NS.p}meaning`, literal(signature.meaning));
      if (signature.development) add(sig, `${NS.p}isDevelopmentSignature`, literal('true', namedNode(`${NS.xsd}boolean`)));
    }
    return quads;
  }

  // ---------------------------------------------------------------- background runs (spec 3.4)

  /** The run's own record, in its own named graph: queued, started by this commit. */
  private runRecord(run: string, principal: Principal, object: string, method: string, commit: string, at: Date): oxigraph.Quad[] {
    const g = namedNode(run);
    const add = (p: string, o: Term) => quad(g, namedNode(p), o, g);
    return [
      add(RDF_TYPE, namedNode(`${NS.p}Run`)),
      add(`${NS.p}method`, namedNode(method)),
      add(`${NS.p}target`, namedNode(object)),
      add(`${NS.prov}wasAssociatedWith`, namedNode(principal.person)),
      add(`${NS.p}actedAs`, namedNode(principal.role)),
      add(`${NS.p}startCommit`, namedNode(commit)),
      add(`${NS.prov}startedAtTime`, xsdDateTime(at)),
      add(`${NS.p}runStatus`, RUN_STATUS('queued')),
    ];
  }

  private runStatus(run: string): RunStatus | undefined {
    const status = this.q(`SELECT ?s WHERE { GRAPH <${run}> { <${run}> p:runStatus ?s } }`)[0]?.s;
    return status?.slice(`${NS.p}RunStatus-`.length) as RunStatus | undefined;
  }

  /** Changes a run's status: journal first, then the live graph. */
  private setRunStatus(run: string, from: RunStatus, to: RunStatus, extra: oxigraph.Quad[] = [], removedExtra: oxigraph.Quad[] = [], kind: JournalKind = 'run', at = this.now()) {
    const g = namedNode(run);
    const removed = [quad(g, namedNode(`${NS.p}runStatus`), RUN_STATUS(from), g), ...removedExtra];
    const added = [quad(g, namedNode(`${NS.p}runStatus`), RUN_STATUS(to), g), ...extra];
    this.options.journal?.append(kind, at, removed, added);
    for (const q of removed) this.graph.store.delete(q);
    for (const q of added) this.graph.store.add(q);
  }

  /** The worker: does a run's analysis and ends the run with its result or the reason it failed. */
  private async work(run: string): Promise<void> {
    const r = this.q(`SELECT ?method ?target ?person ?role WHERE { GRAPH <${run}> { <${run}> p:method ?method ; p:target ?target ; prov:wasAssociatedWith ?person ; p:actedAs ?role } }`)[0];
    const status = this.runStatus(run);
    if (!r || (status !== 'queued' && status !== 'running')) return;
    if (status === 'queued') this.setRunStatus(run, 'queued', 'running');
    this.progress.set(run, 0);
    const starter: Principal = { person: r.person, role: r.role };
    try {
      const outcome = await this.analyse(run, starter, r.method, r.target);
      this.endRun(run, starter, r.method, r.target, 'succeeded', outcome.message, outcome);
    } catch (error) {
      if (!(error instanceof GatewayError)) console.error(error);
      const reason = error instanceof GatewayError ? error.reasons.join(' ') : 'The worker failed. Nothing was changed.';
      this.endRun(run, starter, r.method, r.target, 'failed', reason);
    } finally {
      this.progress.delete(run);
    }
  }

  /**
   * A disproportionality analysis (spec 3.4, Background runs): applied to a working copy, validated against every shape,
   * and returned for the run's end to commit. Throws with the reasons when it cannot run or its result breaks a shape.
   */
  private async analyse(run: string, starter: Principal, method: string, object: string) {
    const analysis = analysisOf(this.graph.store, method);
    if (!analysis) throw new GatewayError(400, backgroundBlocks(this.graph.store, method));
    const plan = planDisproportionality(this.graph.store, analysis.effect, object);
    if (plan.cannotRun) throw new GatewayError(400, [plan.cannotRun]);

    const e = this.q(`SELECT ?outcomeAs ?aggregatesBy ?typeLabel ?plural ?countsPlural WHERE { <${analysis.effect}> p:recordsOutcomeAs ?outcomeAs ; p:aggregatesBy ?aggregatesBy ;
        p:createsType ?type ; p:counts ?counts . ?type rdfs:label ?typeLabel ; p:pluralLabel ?plural . ?counts p:pluralLabel ?countsPlural }`)[0];
    const work: Graph = { store: new oxigraph.Store(this.graph.store.match(null, null, null, defaultGraph()) as oxigraph.Quad[]), dataset: this.graph.dataset };
    const at = this.now();
    const changes: Change[] = [];
    const created: string[] = [];
    const found: string[] = [];
    const again: string[] = [];
    const stats = (f: (typeof plan.findings)[number]) =>
      `PRR ${Number.isFinite(f.prr) ? f.prr.toFixed(1) : 'unbounded'}, chi-squared ${f.chiSquare.toFixed(1)}`;
    for (const [i, f] of plan.findings.entries()) {
      this.progress.set(run, i / plan.findings.length);
      await yieldToReaders();
      if (!f.meets) continue;
      if (f.existing) {
        again.push(`${f.outcomeLabel[0].toUpperCase()}${f.outcomeLabel.slice(1)} meets the thresholds and already has ${f.existing}.`);
        continue;
      }
      const iri = this.applyCreation(work, object, analysis.effect, new Map(), starter, at, changes);
      this.set(work, iri, e.outcomeAs, namedNode(f.outcome), changes, false);
      for (const x of f.objects) this.set(work, iri, e.aggregatesBy, namedNode(x), changes, false);
      created.push(iri);
      const identifier = this.q(`SELECT ?id WHERE { <${iri}> ls:identifier ?id }`, work)[0].id;
      found.push(`${identifier} for ${f.outcomeLabel}, in ${f.a} ${e.countsPlural.toLowerCase()} (${stats(f)})`);
    }
    this.progress.set(run, 1);

    work.dataset = defaultGraphDataset(work.store);
    const problems = await validateData(work);
    if (problems.length) throw new GatewayError(400, problems);

    const what = e.plural.toLowerCase();
    const message = [
      found.length ? `Found ${found.length} new ${found.length === 1 ? e.typeLabel.toLowerCase() : what}: ${found.join('; ')}.` : `No new ${what}.`,
      ...again,
    ].join(' ');
    return { message, changes, created, work, at };
  }

  /** Ends a run: its result commit, if any, its status, and the starter's notification, in one journal entry. */
  private endRun(run: string, starter: Principal, method: string, object: string, status: 'succeeded' | 'failed', message: string,
    outcome?: { changes: Change[]; created: string[]; work: Graph; at: Date }) {
    const at = outcome?.at ?? this.now();
    const g = namedNode(run);
    const removed: oxigraph.Quad[] = [];
    const added: oxigraph.Quad[] = [
      quad(g, namedNode(`${NS.prov}endedAtTime`), xsdDateTime(at), g),
      quad(g, namedNode(`${NS.p}message`), literal(message), g),
    ];
    let commit: string | undefined;
    if (outcome?.changes.length) {
      commit = `${this.dataNamespace}commit/${this.commitCount + 1}`;
      const worker: Principal = { person: WORKER, role: starter.role };
      removed.push(...outcome.changes.filter((c) => c.oldValue).map((c) => quad(namedNode(c.subject), namedNode(c.property), c.oldValue!, defaultGraph())));
      added.push(
        ...outcome.changes.filter((c) => c.newValue).map((c) => quad(namedNode(c.subject), namedNode(c.property), c.newValue!, defaultGraph())),
        ...this.record(commit, worker, object, method, new Map(), outcome.changes, outcome.created, [], at, undefined, starter.person),
        quad(g, namedNode(`${NS.p}resultCommit`), namedNode(commit), g),
      );
    }
    // The starter is told how it ended (spec 3.4). Only they see it.
    const notification = `${this.dataNamespace}notification/${this.notificationCount + 1}`;
    const n = namedNode(notification);
    const methodLabel = this.q(`SELECT ?l WHERE { <${method}> rdfs:label ?l }`)[0].l;
    const add = (p: string, o: Term) => added.push(quad(n, namedNode(p), o, n));
    add(RDF_TYPE, namedNode(`${NS.p}Notification`));
    add(`${NS.p}recipient`, namedNode(starter.person));
    add(`${NS.p}about`, g);
    add(`${NS.p}target`, namedNode(object));
    add(`${NS.p}title`, literal(`${methodLabel} ${status === 'succeeded' ? 'finished' : 'failed'}`));
    add(`${NS.p}message`, literal(message));
    add(`${NS.prov}generatedAtTime`, xsdDateTime(at));

    this.setRunStatus(run, this.runStatus(run)!, status, added, removed, commit ? 'commit' : 'run', at);
    if (commit) {
      this.graph.dataset = outcome!.work.dataset;
      this.commitCount++;
    }
    this.notificationCount++;
  }

  private runView(run: string): RunView {
    const r = this.q(`SELECT ?method ?methodLabel ?target ?person ?name ?status ?startedAt ?endedAt ?message ?result WHERE {
        GRAPH <${run}> { <${run}> p:method ?method ; p:target ?target ; prov:wasAssociatedWith ?person ; p:runStatus ?status ; prov:startedAtTime ?startedAt .
          OPTIONAL { <${run}> prov:endedAtTime ?endedAt } OPTIONAL { <${run}> p:message ?message } OPTIONAL { <${run}> p:resultCommit ?result } }
        ?method rdfs:label ?methodLabel . OPTIONAL { ?person rdfs:label ?name } }`)[0];
    if (!r) throw new GatewayError(404, [`No run ${run}`]);
    const status = r.status.slice(`${NS.p}RunStatus-`.length) as RunStatus;
    const created = r.result
      ? this.q(`SELECT ?iri ?identifier WHERE { GRAPH <${r.result}> { <${r.result}> prov:generated ?iri } ?iri ls:identifier ?identifier } ORDER BY ?identifier`).map((c) => ({ iri: c.iri, identifier: c.identifier }))
      : [];
    const progress = this.progress.get(run);
    return {
      run,
      method: r.method,
      methodLabel: r.methodLabel,
      object: r.target,
      objectIdentifier: this.q(`SELECT ?id WHERE { <${r.target}> ls:identifier ?id }`)[0]?.id ?? r.target,
      status,
      ...(status === 'running' && progress !== undefined ? { progress } : {}),
      startedBy: r.person,
      startedByName: r.name ?? r.person,
      startedAt: r.startedAt,
      ...(r.endedAt ? { endedAt: r.endedAt } : {}),
      ...(r.message ? { message: r.message } : {}),
      created,
    };
  }

  /** Track runs (spec 3.4): the runs on objects the principal may read, newest first. Optionally one object's, or only those not ended. */
  runs(principal: Principal, filter: { object?: string; active?: boolean } = {}): RunView[] {
    this.authorize(principal);
    const object = filter.object ? this.resolve(filter.object) : undefined;
    const rows = this.q(`SELECT ?run ?target WHERE { GRAPH ?run { ?run a p:Run ; p:target ?target ; prov:startedAtTime ?at ; p:runStatus ?s } ${object ? `FILTER(?target = <${object}>)` : ''}
        ${filter.active ? 'FILTER(?s IN (p:RunStatus-queued, p:RunStatus-running))' : ''} } ORDER BY DESC(?at) DESC(STRLEN(STR(?run))) DESC(?run)`);
    const hidden = this.unreadable(principal.role);
    return rows.filter((r) => !hidden.has(this.typeOf(r.target).type)).map((r) => this.runView(r.run));
  }

  /** One run, when the principal may read its object. */
  run(principal: Principal, run: string): RunView {
    this.authorize(principal);
    const view = this.runView(run.includes('://') ? run : `${this.dataNamespace}run/${run}`);
    if (!this.canRead(principal, this.typeOf(view.object).type)) throw new GatewayError(403, ['Your role cannot read this object']);
    return view;
  }

  /** Notifications (spec 3.4): the principal's own, newest first. */
  notifications(principal: Principal): NotificationView[] {
    this.authorize(principal);
    return this.q(`SELECT ?n ?title ?message ?run ?status ?target ?id ?at ?readAt WHERE { GRAPH ?n { ?n a p:Notification ; p:recipient <${principal.person}> ; p:title ?title ;
        p:message ?message ; p:about ?run ; p:target ?target ; prov:generatedAtTime ?at OPTIONAL { ?n p:readAt ?readAt } }
        GRAPH ?run { ?run p:runStatus ?status } OPTIONAL { ?target ls:identifier ?id } } ORDER BY DESC(?at) DESC(STRLEN(STR(?n))) DESC(?n)`).map((r) => ({
      notification: r.n,
      title: r.title,
      message: r.message,
      status: r.status === `${NS.p}RunStatus-failed` ? 'failed' : 'succeeded',
      run: r.run,
      object: r.target,
      objectIdentifier: r.id ?? r.target,
      at: r.at,
      read: Boolean(r.readAt),
    }));
  }

  /** Marks the principal's unread notifications read: the ones given, or all. Returns how many changed. */
  markRead(principal: Principal, notifications?: string[]): number {
    this.authorize(principal);
    const unread = this.notifications(principal).filter((n) => !n.read && (!notifications || notifications.includes(n.notification)));
    if (notifications?.some((id) => !this.notifications(principal).some((n) => n.notification === id))) throw new GatewayError(404, ['No such notification for you']);
    if (!unread.length) return 0;
    const at = this.now();
    const added = unread.map((n) => quad(namedNode(n.notification), namedNode(`${NS.p}readAt`), xsdDateTime(at), namedNode(n.notification)));
    this.options.journal?.append('notification', at, [], added);
    for (const q of added) this.graph.store.add(q);
    return unread.length;
  }

  /** Every commit, oldest first. */
  commits(): { commit: string; method: string; target: string; person: string; role: string; at: string }[] {
    return this.q(`SELECT ?commit ?method ?target ?person ?role ?at WHERE { GRAPH ?commit {
        ?commit a p:Commit ; p:method ?method ; p:target ?target ; prov:wasAssociatedWith ?person ; p:actedAs ?role ; prov:startedAtTime ?at } }
        ORDER BY ?at STRLEN(STR(?commit)) ?commit`) as never;
  }
}
