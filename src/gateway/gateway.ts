import * as oxigraph from 'oxigraph';
import { analysisDescriptions, analysisOf, backgroundBlocks, planDisproportionality } from '../ontology/analyses';
import { CONNECTED_MODELS } from '../ontology/models';
import { templateProperties } from '../ontology/titles';
import { DraftingError, sha256, type Drafter } from './drafting';
import { containsWords, interpret, normalize, type Interpretation, type SearchModel, type SearchPlan } from './search';
import { PROPOSAL_TOOL, type SkillModel } from './skills';
import { ANSWER_TOOL, DRAFT_CHANGE_TOOL, checkTurns, MAX_ABOUT, type AnswerStatus, type AskModel, type AskTool, type AskToolOutput, type AskTurn } from './ask';
import { archetypeOf, type Archetype } from '../ontology/archetypes';
import { titleOf } from '../ontology/titles';
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
  /** The signed-in account that made the request, when the deployment has sign-in (spec 3.4, Identity). Recorded, never trusted for access. */
  account?: string;
}

export class GatewayError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 415 | 502,
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
  /** What people call the object, from its type's title template (spec 3.1, Title); the type's label when it has none. */
  title: string;
  /** The type's plural label, for summaries and lists. */
  pluralLabel: string;
  state: Record<string, string>;
  /** Where the object is in its type's lifecycle: the type's first state dimension (spec 5.1). */
  lifecycle?: { dimension: string; stage: string; position: number; stages: string[] };
}

/**
 * One end of a relationship, as seen from an object of a type (spec 3.1 and 5.1, Within an object): the relationship read
 * from this side, whether the objects at the other end are contained here, contain this object, or are only related, and
 * whether this end holds at most one object.
 */
export interface RelationshipEndDescription {
  relationship: string;
  /** The relationship's label going out, its inverse label coming in: a study "enrolls" patients. */
  label: string;
  direction: 'out' | 'in';
  kind: 'contains' | 'partOf' | 'related';
  /** True when this end holds at most one object. */
  one: boolean;
  /** The type at the other end. */
  type: string;
  typeLabel: string;
  pluralLabel: string;
}

/** A relationship end of one object, with the objects at its other end that the principal may read. */
export interface RelationshipEnd extends RelationshipEndDescription {
  objects: ObjectSummary[];
  /** True when the principal may create an object inside this one, at this end (spec 5.3, Creating and editing objects). */
  canAdd?: boolean;
}

/** Where one stage stands in an object's journey (spec 5.1, Journey). */
export type JourneyStatus = 'passed' | 'current' | 'upcoming' | 'skipped' | 'unknown';

/**
 * An object's journey along its lifecycle (spec 5.1, Journey): the main path's stages, passed, current, to come or
 * skipped, read from the object's own commits; at an exit, the stages up to the one it left from, then the exit.
 */
export interface Journey {
  /** The lifecycle's name, such as Workflow. */
  dimension: string;
  steps: { stage: string; status: JourneyStatus; exit?: boolean }[];
}

export interface ObjectView extends ObjectSummary {
  /**
   * Every relationship end the object's type has in the ontology, in both directions, that reaches a type the principal
   * may read: contained objects first, then in the ontology's order (spec 5.1, Within an object). Empty ends are kept.
   */
  links: RelationshipEnd[];
  properties: Record<string, string>;
  /** The domain the object's type belongs to. */
  domainLabel: string;
  /** Highest urgency of its state values; 0 when none is urgent. */
  urgency: number;
  /** Its earliest deadline, as an ISO date. */
  deadline?: string;
  /** Where it is along its lifecycle. Absent for a type with no lifecycle, or one whose main path has one stage. */
  journey?: Journey;
  /** The latest commit on the object: which method, who ran it and when. Absent when nothing has changed it. */
  lastChange?: { commit: string; method: string; methodLabel: string; person: string; personName: string; at: string };
}

export interface TypeDescription {
  type: string;
  label: string;
  comment: string;
  domain: string;
  dimensions: Record<string, unknown>[];
  methods: Record<string, unknown>[];
  /** The type's relationship ends, both ways (spec 3.1). */
  relationships: RelationshipEndDescription[];
}

export interface NavigationDomain {
  domain: string;
  label: string;
  /** Creatable: the principal may create objects of the type (spec 5.3, Creating and editing objects). */
  types: { type: string; label: string; pluralLabel: string; count: number; creatable?: boolean }[];
}

/** Each person's homepage (spec 5.1, Home): their world's health, where things stand, and how they are keeping up. */
export interface HomeView {
  /** The metrics the person's roles watch, as they stand today. */
  metrics: { metric: string; label: string; comment: string; type: string; pluralLabel: string; count: number; total: number; health?: 'on track' | 'watch' | 'at risk' }[];
  /** For each type of the person's work with a lifecycle and objects: its objects by lifecycle stage, in order. */
  lifecycles: { type: string; label: string; pluralLabel: string; dimension: string; total: number; stages: { value: string; label: string; count: number }[] }[];
  /** The person's commits in the last 7 days, the runs they started included. */
  doneLast7Days: number;
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
  kind: 'line' | 'text' | 'number' | 'date' | 'url' | 'choice' | 'person' | 'object';
  /** True when the field may be left empty, as optional fields of a create or edit form (spec 5.3). */
  optional?: boolean;
  /** The values the person may choose from, with their labels. */
  choices?: { value: string; label: string }[];
  /** True when a choice takes any number of the values, sent separated by spaces (spec 3.1, Input). */
  many?: boolean;
  default?: string;
  /** True when the input is about the object it is given for, so a batch asks for it object by object (spec 5.4). */
  perObject?: boolean;
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
  /** For a set method (spec 5.4, Acting on a set): the objects of the set, in the order chosen. */
  objects?: ObjectSummary[];
  /** For a set method that declares a comparison: its rows, one cell per object of the set. */
  comparison?: ComparisonView;
  /** The word that names the commit button, when the method names one (platform spec 5.4), such as Select. */
  commitLabel?: string;
  /** The approved skills that would propose its inputs for this person (spec 3.3, Skills); ask for their proposals with propose. */
  skills?: { skill: string; label: string }[];
}

/** A set method's comparison (spec 5.4, Acting on a set): rows keyed by a state value, a cell per object of the set. */
export interface ComparisonView {
  rows: { key: string; label: string; cells: ({ identifier: string; title: string; status?: string; urgent?: boolean } | null)[] }[];
}

/** One field of a create or edit form (spec 5.3, Creating and editing objects): a property, link or classifying state. */
export interface FormField extends Omit<ComposedInput, 'kind'> {
  kind: 'line' | 'text' | 'number' | 'date' | 'url' | 'choice' | 'object';
  /** The property, relationship or state dimension the field sets. */
  property: string;
  required: boolean;
  /** The object's current value, when editing. */
  value?: string;
}

/** A create or edit form, from the ontology (spec 5.3, Creating and editing objects). */
export interface ObjectForm {
  mode: 'create' | 'edit';
  type: string;
  typeLabel: string;
  /** The object being edited. */
  object?: ObjectSummary;
  /** The object a new one is created inside. */
  parent?: ObjectSummary;
  fields: FormField[];
  /** For a create, the ways to begin a skill names (spec 3.3, Starting points), in order. The form is what the create form begins. */
  startingPoints?: StartingPointView[];
}

/** A way to begin creating an object, as a skill names it (spec 3.3, Starting points). */
export interface StartingPointView {
  startingPoint: string;
  label: string;
  description: string;
  /** The beginning it uses, such as the create form. */
  begins: string;
  beginsLabel: string;
  /** Whether the platform can run it now; when not, why. */
  available: boolean;
  notYet?: string;
  /** The skill that names it. */
  skill: string;
  skillLabel: string;
}

/** A set method a selection qualifies for (spec 5.4, Acting on a set). */
export interface SetMethodOption {
  method: string;
  label: string;
  archetype: Archetype;
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
  /** The draft the commit accepted, for a method that produces a draft. */
  fromDraft?: { draft: string; model: string; edited: boolean };
  /** For a change set (spec 3.7): what applying it, or rolling it back, would do to the structure and the graph. */
  impact?: StructureImpact;
  /** The skill's proposal the inputs started from, with the inputs kept as proposed and those changed (spec 3.3, Skills). */
  fromProposal?: { proposal: string; kept: string[]; changed: string[]; followedRecommendation?: boolean };
}

/** A search's answer (spec 5.2): how the query was understood, and the objects it found, best first. */
export interface SearchResult {
  query: string;
  interpretation: Interpretation;
  results: { object: ObjectSummary; matched: string[] }[];
  /** How many objects matched, of which results holds the best. */
  total: number;
  /** Who understood the query: the connected model, by its name, or the ontology reading (spec 5.2). */
  understoodBy: { model: string } | { ontology: true };
}

/** An answer to a question (spec 5.2, Asking a question), or the search it fell back to, and why. */
export interface AskResult {
  question: string;
  answer?: {
    status: AnswerStatus;
    text: string;
    /** The objects the answer rests on: only those the model read in this question, as the principal may see them. */
    cited: ObjectSummary[];
    /** The model that answered, as the provider reports it. */
    model: string;
    /** How many objects the tools showed the model while it answered. */
    lookedAt: number;
  };
  /** The question searched instead, when no model answered it. */
  search?: SearchResult;
  /** Why the question was searched rather than answered. */
  searched?: string;
}

export type DraftStatus = 'undecided' | 'accepted' | 'discarded';

/** A generated draft (spec 3.4, Generated drafts), as the person deciding on it sees it. */
export interface DraftView {
  draft: string;
  method: string;
  methodLabel: string;
  object: string;
  objectIdentifier: string;
  /** The text the model wrote. */
  text: string;
  /** The model that wrote it, as the provider reports it. */
  model: string;
  generatedAt: string;
  status: DraftStatus;
  /** The objects whose records the model was given. */
  given: { iri: string; identifier: string }[];
  requestedBy: string;
  requestedByName: string;
}

/** A skill's proposal (spec 3.3, Skills), as the person deciding sees it. It changes nothing. */
export interface ProposalView {
  proposal: string;
  skill: string;
  /** The skill's name, such as Simulation assumptions. */
  label: string;
  version: string;
  method: string;
  /** How it ran: the model as the provider reports it, or the reference procedure by name. */
  ranBy: { model: string } | { procedure: string };
  /** Why the reference procedure ran instead of the connected model, when it did. */
  fellBack?: string;
  reasoning: string;
  /** A value for each input the skill could ground, in the method's input order. */
  values: { name: string; label: string; value: string; valueLabel: string; restsOn: { iri: string; identifier: string }[] }[];
  /** The object of the set it recommends, for a skill that recommends. */
  recommended?: { iri: string; identifier: string };
  restsOn: { iri: string; identifier: string }[];
  generatedAt: string;
}

/** The skills that serve a method, for the principal: each one's proposal, or why it did not run. */
export interface SkillProposals {
  proposals: ProposalView[];
  notRun: { skill: string; label: string; reason: string }[];
}

/** Accepting a draft: which one, and the text to commit, as written or edited. */
export interface DraftGiven {
  draft: string;
  text: string;
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
export type JournalKind = 'commit' | 'read' | 'run' | 'notification' | 'draft' | 'proposal';

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
  /** The model connected for drafting (spec 3.4, Generated drafts). Without one, drafting methods are refused. */
  drafter?: Drafter;
  /** The model connected to understand search queries (spec 5.2). Without one, queries are read against the ontology. */
  searchModel?: SearchModel;
  /** The model connected to answer questions (spec 5.2, Asking a question). Without one, questions are searched. */
  askModel?: AskModel;
  /** The model connected to run skills (spec 3.3, Skills). Without one, skills run their reference procedures. */
  skillModel?: SkillModel;
}

/** The read-only tools a model answering a question may call (spec 5.2, Asking a question). Domain-free: names come from the ontology. */
const ASK_TOOLS: AskTool[] = [
  {
    name: 'find_objects',
    description:
      'Finds objects the person may read, best first, up to 50, with the total. Give types by name, states by value (or "Dimension: value"), linked_to as identifiers of objects the results must be linked to (give types too, or you get those objects themselves), words to find in what the person may read, and mine for the person\'s own work. Leave a list empty when it does not apply. Names not understood are returned so you can correct them.',
    input_schema: {
      type: 'object',
      properties: {
        types: { type: 'array', items: { type: 'string' }, description: 'Type names, such as Safety Case.' },
        states: { type: 'array', items: { type: 'string' }, description: 'State values, such as serious, or Seriousness: serious.' },
        linked_to: { type: 'array', items: { type: 'string' }, description: 'Identifiers, such as SITE-2.' },
        words: { type: 'array', items: { type: 'string' }, description: 'Single words to find in the records, such as rash.' },
        mine: { type: 'boolean', description: 'True for the person\'s own work: waiting for them, or naming them.' },
      },
      required: ['types', 'states', 'linked_to', 'words', 'mine'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_object',
    description: 'Reads one object as the person may see it: its type, title, state, properties, links to other objects, deadline, urgency and last change.',
    input_schema: { type: 'object', properties: { identifier: { type: 'string', description: 'Such as AE-003.' } }, required: ['identifier'], additionalProperties: false },
  },
  {
    name: 'count_objects',
    description:
      'Counts the objects of one type the person may read, optionally only those in the given states, and optionally grouped by one of the type\'s state dimensions or links (by name). Grouped by a link, each group is a linked object\'s identifier.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'A type name, such as Adverse Event.' },
        states: { type: 'array', items: { type: 'string' }, description: 'State values to count only, such as serious. Empty for all.' },
        group_by: { type: 'string', description: 'A state dimension, such as Workflow, or a link, such as runs at. Empty for a total only.' },
      },
      required: ['type', 'states', 'group_by'],
      additionalProperties: false,
    },
  },
  {
    name: 'methods_for',
    description: 'Lists the methods the person could run on an object, each available now or blocked with the reasons. Use it for why something cannot be done, or what to do next. It never runs one.',
    input_schema: { type: 'object', properties: { identifier: { type: 'string', description: 'Such as PT-03.' } }, required: ['identifier'], additionalProperties: false },
  },
];

/** What a change set would do (spec 3.7, Impact before approval), as the person deciding on it sees it. */
export interface StructureImpact {
  /** What changes in the structure, one line per operation. */
  structure: string[];
  /** Objects whose state moves, such as from a deprecated value to its replacement. */
  moves: { identifier: string; from: string; to: string }[];
  /** Objects that would no longer conform, with the reasons, or why the change cannot be made at all. */
  notConforming: string[];
  /** Methods, metrics, states and titles that refer to what changes. */
  refersTo: string[];
  /** Each ontology version it would move. */
  versions: string[];
}

/** Frees a working copy's store at once, rather than when the collector next finds it: each holds the whole graph. */
function freeStore(store: oxigraph.Store) {
  (store as unknown as { free?: () => void }).free?.();
}

/**
 * Changes as a Turtle patch (spec 3.7), for review into the repository's files: the prefixes it uses, then the statements
 * removed and those added, one to a line, with prefixed names where a namespace is known.
 */
function turtlePatch(changes: { subject: string; property: string; oldValue?: Term; newValue?: Term }[]): string {
  const used = new Set<string>();
  const name = (iri: string) => {
    const known = Object.entries(NS).find(([, ns]) => iri.startsWith(ns) && /^[A-Za-z][A-Za-z0-9_-]*$/.test(iri.slice(ns.length)));
    if (!known) return `<${iri}>`;
    used.add(known[0]);
    return `${known[0]}:${iri.slice(known[1].length)}`;
  };
  const term = (t: Term) =>
    t.termType === 'NamedNode' ? name(t.value)
    : `${JSON.stringify(t.value)}${t.termType === 'Literal' && t.datatype && t.datatype.value !== `${NS.xsd}string` ? `^^${name(t.datatype.value)}` : ''}`;
  const line = (c: { subject: string; property: string }, t: Term) => `${name(c.subject)} ${c.property === RDF_TYPE ? 'a' : name(c.property)} ${term(t)} .`;
  const removed = changes.filter((c) => c.oldValue).map((c) => line(c, c.oldValue!));
  const added = changes.filter((c) => c.newValue).map((c) => line(c, c.newValue!));
  const prefixes = [...used].sort().map((p) => `@prefix ${p}: <${(NS as Record<string, string>)[p]}> .`);
  return [...prefixes, '', '# Removed', ...removed, '', '# Added', ...added].join('\n');
}

/** A skill that serves a method, as the gateway runs it. */
interface SkillRow {
  skill: string;
  label: string;
  version: string;
  instructions: string;
  procedure?: string;
  procedureLabel?: string;
  recommends: boolean;
  inputs: { input: string; name: string; label: string; datatype?: string; among: boolean }[];
}

/** A proposal as made, before it is recorded. */
type MadeProposal = Pick<ProposalView, 'values' | 'recommended' | 'reasoning' | 'restsOn' | 'ranBy' | 'fellBack'>;

export class Gateway {
  private commitCount = 0;
  private readCount = 0;
  private runCount = 0;
  private notificationCount = 0;
  private draftCount = 0;
  private proposalCount = 0;
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
    this.draftCount = Number(this.q(`SELECT (COUNT(?x) AS ?n) WHERE { GRAPH ?x { ?x a p:Draft } }`)[0].n);
    this.proposalCount = Number(this.q(`SELECT (COUNT(?x) AS ?n) WHERE { GRAPH ?x { ?x a p:Proposal } }`)[0].n);
    this.identifyStructure();
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
    const hidden = this.q(`SELECT ?x WHERE { <${role}> p:mayNotRead ?x }`).map((r) => r.x);
    // A role that reads no personal data, such as the Structure Steward, reads no type that holds it (spec 3.7).
    if (ask(this.graph.store, `ASK { <${role}> p:readsNoPersonalData true }`)) hidden.push(...this.q(`SELECT ?t WHERE { ?t p:holdsPersonalData true }`).map((r) => r.t));
    return new Set(hidden);
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
      relationships: this.ends(t.type).filter((e) => !hidden.has(e.type)),
    }));
  }

  private endsCache = new Map<string, RelationshipEndDescription[]>();
  /** The shapes, compiled once for validating commits, until the structure changes (spec 3.7). */
  private compiledShapes?: ReturnType<typeof validatorFor>;

  private shapesValidator() {
    this.compiledShapes ??= validatorFor(this.graph);
    return this.compiledShapes;
  }

  /**
   * A working copy of the current state (spec 3.4, commit step 4): the default graph only, copied inside the store's own
   * engine, as N-Triples, so no statement becomes a JavaScript object on the way.
   */
  private workingCopy(): oxigraph.Store {
    const copy = new oxigraph.Store();
    copy.load(this.graph.store.dump({ format: 'application/n-triples', from_graph_name: defaultGraph() }), { format: 'application/n-triples' });
    return copy;
  }

  /**
   * The changes a person reads in a preview or an outcome. A change to the structure shows only what happens to objects,
   * such as the change set's status and the objects that move: what happens to the structure is its impact (spec 3.7).
   */
  private shownChanges(method: string, changes: Change[], work: Graph): Change[] {
    if (!this.changesStructure(method)) return changes;
    return changes.filter((c) => c.property !== `${NS.p}patch` && ask(work.store, `ASK { <${c.subject}> ls:identifier ?i ; a ?t . ?t a p:ObjectType FILTER NOT EXISTS { ?t p:inDomain p:Structure FILTER(?t NOT IN (p:ChangeSet)) } }`));
  }

  /** Whether a method changes the structure itself (spec 3.7). */
  private changesStructure(method: string): boolean {
    return ask(this.graph.store, `ASK { <${method}> p:effect/a ?k FILTER(?k IN (p:ApplyStructureChange, p:RollBackStructureChange)) }`);
  }

  /**
   * A type's relationship ends, from its shapes and the shapes that point at it (spec 3.1): each relationship read from
   * this side, with its containment and whether it holds at most one object. The ontology does not change while the
   * gateway runs, so the answer is kept.
   */
  private ends(type: string): RelationshipEndDescription[] {
    const cached = this.endsCache.get(type);
    if (cached) return cached;
    const target = (ps: string, cls: string) => `{ ${ps} sh:class ${cls} } UNION { ${ps} sh:or/rdf:rest*/rdf:first/sh:class ${cls} }`;
    type EndRow = { rel: string; label: string; order: string; partOf?: string; hasPart?: string; max?: string; other: string; direction: 'out' | 'in' };
    const rows: EndRow[] = [
      ...this.q(`SELECT ?rel ?label ?order ?partOf ?hasPart ?max ?other WHERE {
          ?shape (sh:targetClass|p:describes) <${type}> ; sh:property ?ps . ?ps sh:path ?rel . ?rel a p:Relationship ; rdfs:label ?label ; p:order ?order .
          OPTIONAL { ?rel p:partOf ?partOf } OPTIONAL { ?rel p:hasPart ?hasPart } OPTIONAL { ?ps sh:maxCount ?max }
          ${target('?ps', '?other')} }`).map((r) => ({ ...r, direction: 'out' }) as EndRow),
      ...this.q(`SELECT ?rel ?label ?order ?partOf ?hasPart ?other WHERE {
          ?shape (sh:targetClass|p:describes) ?other ; sh:property ?ps . ?ps sh:path ?rel . ?rel a p:Relationship ; p:inverseLabel ?label ; p:order ?order .
          OPTIONAL { ?rel p:partOf ?partOf } OPTIONAL { ?rel p:hasPart ?hasPart }
          ${target('?ps', `<${type}>`)} }`).map((r) => ({ ...r, direction: 'in' }) as EndRow),
    ];
    const kindOf = (r: EndRow): RelationshipEndDescription['kind'] => {
      const subjectIsPart = r.partOf === 'true';
      const objectIsPart = r.hasPart === 'true';
      if (r.direction === 'out') return subjectIsPart ? 'partOf' : objectIsPart ? 'contains' : 'related';
      return subjectIsPart ? 'contains' : objectIsPart ? 'partOf' : 'related';
    };
    const rank = { contains: 0, partOf: 1, related: 2 };
    const ends = rows
      .map((r) => {
        const other = this.typeLabels(r.other);
        return { relationship: r.rel, label: r.label, direction: r.direction, kind: kindOf(r), one: r.direction === 'out' && r.max === '1', type: r.other, ...other, order: Number(r.order) };
      })
      .sort((a, b) => rank[a.kind] - rank[b.kind] || a.order - b.order || (a.direction === b.direction ? 0 : a.direction === 'out' ? -1 : 1) || a.typeLabel.localeCompare(b.typeLabel))
      .map(({ order: _order, ...end }) => end);
    this.endsCache.set(type, ends);
    return ends;
  }

  /** Highest urgency of the object's state values; 0 when none is urgent (spec 5.1). */
  private urgencyOf(object: string): number {
    return Number(this.q(`SELECT (MAX(?u) AS ?max) WHERE { <${object}> ?d ?v . ?d a p:StateDimension . ?v p:urgency ?u }`)[0]?.max ?? 0);
  }

  /** The object's earliest deadline, as an ISO date (spec 5.1). */
  private deadlineOf(object: string): string | undefined {
    return this.q(`SELECT (MIN(?date) AS ?first) WHERE { <${object}> ?p ?date . ?p p:isDeadline true }`)[0]?.first;
  }

  private typeLabels(type: string): { typeLabel: string; pluralLabel: string } {
    const row = this.q(`SELECT ?label ?plural WHERE { <${type}> rdfs:label ?label . OPTIONAL { <${type}> p:pluralLabel ?plural } }`)[0];
    return { typeLabel: row?.label ?? type, pluralLabel: row?.plural ?? row?.label ?? type };
  }

  private inputs(method: string) {
    return this.q(`SELECT ?input ?name ?label ?datatype ?valuesFrom ?objectOf ?isActor ?choicesAlong ?perObject ?manyValues WHERE {
        <${method}> p:input ?input . ?input p:inputName ?name ; rdfs:label ?label ; p:order ?order .
        OPTIONAL { ?input p:datatype ?datatype } OPTIONAL { ?input p:valuesFrom ?valuesFrom } OPTIONAL { ?input p:manyValues ?manyValues }
        OPTIONAL { ?input p:objectOf ?objectOf } OPTIONAL { ?input p:isActor ?isActor } OPTIONAL { ?input p:choicesAlong ?choicesAlong } OPTIONAL { ?input p:perObject ?perObject } } ORDER BY ?order`);
  }

  // ---------------------------------------------------------------- people (development)

  /**
   * The people and agents in the graph, with the roles each may act in. For the development persona
   * switcher only (design system spec 4.1); the HTTP transport serves it in development mode only.
   */
  /**
   * The person a signed-in account acts as (spec 3.4, Identity): the person in the graph with that email, and their roles.
   * Undefined when nobody has it.
   */
  personWithEmail(email: string): { person: string; name: string; roles: { role: string; label: string }[] } | undefined {
    const found = this.q(`SELECT ?person WHERE { ?person a p:Person ; p:email ?email FILTER(LCASE(STR(?email)) = ${JSON.stringify(email.toLowerCase())}) }`)[0];
    return found && this.people().find((p) => p.person === found.person);
  }

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

  /**
   * The object world of the principal's work: the entry types of their roles' work domains, limited to what they may
   * read (spec 5.1). A type whose objects are part of another object is reached inside it, unless the role works across it.
   */
  navigation(principal: Principal): NavigationDomain[] {
    this.authorize(principal);
    const hidden = this.unreadable(principal.role);
    const contained = new Set(this.q(`SELECT DISTINCT ?type WHERE {
        { ?shape (sh:targetClass|p:describes) ?type ; sh:property ?ps . ?ps sh:path ?rel . ?rel p:partOf true }
        UNION { ?ps sh:path ?rel . ?rel p:hasPart true . ?ps (sh:class|sh:or/rdf:rest*/rdf:first/sh:class) ?type }
      }`).map((r) => r.type));
    for (const { type } of this.q(`SELECT ?type WHERE { <${principal.role}> p:worksAcross ?type }`)) contained.delete(type);
    const domains = this.q(`SELECT ?domain ?label WHERE { <${principal.role}> p:worksIn ?domain . ?domain rdfs:label ?label } ORDER BY ?label`);
    return domains.map(({ domain, label }) => ({
      domain,
      label,
      types: this.q(`SELECT ?type ?label ?pluralLabel (COUNT(?o) AS ?count) WHERE {
          ?type a p:ObjectType ; p:inDomain <${domain}> ; rdfs:label ?label ; p:pluralLabel ?pluralLabel .
          OPTIONAL { ?o a ?type } } GROUP BY ?type ?label ?pluralLabel ORDER BY ?label`)
        .filter((t) => !hidden.has(t.type) && !contained.has(t.type))
        .map((t) => ({ type: t.type, label: t.label, pluralLabel: t.pluralLabel, count: Number(t.count), ...(this.mayCreate(principal, t.type) ? { creatable: true } : {}) })),
    })).filter((d) => d.types.length > 0);
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
        FILTER NOT EXISTS { ?method p:onSet true }
        OPTIONAL { ?method p:onDemand ?onDemand } } ORDER BY ?label`).filter((m) => !hidden.has(m.type));
    const preconditions = new Map<string, string[]>();
    for (const { method } of methods) preconditions.set(method, this.q(`SELECT ?pre WHERE { <${method}> p:precondition ?pre }`).map((r) => r.pre));
    const validator = validatorFor(this.graph);

    const items: ToDoItem[] = [];
    for (const type of new Set(methods.map((m) => m.type))) {
      for (const { o } of this.q(`SELECT ?o WHERE { ?o a <${type}> }`)) {
        const urgency = this.urgencyOf(o);
        const tasks: ToDoItem['tasks'] = [];
        const actions: ToDoItem['actions'] = [];
        for (const m of methods.filter((m) => m.type === type)) {
          const isTask = m.onDemand !== 'true';
          if (!isTask && urgency < 3) continue;
          if (this.unavailable(m.method).length) continue;
          if (this.ownerBlocks(principal, o, m.method).length) continue;
          if ((await conformanceProblems(this.graph, o, preconditions.get(m.method)!, validator)).length) continue;
          (isTask ? tasks : actions).push({ method: m.method, label: m.label, archetype: archetypeOf(this.graph.store, m.method) });
        }
        if (!tasks.length && !(urgency >= 3 && actions.length)) continue;
        const deadline = this.deadlineOf(o);
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
    const pluralLabel = this.q(`SELECT ?l WHERE { <${type}> p:pluralLabel ?l }`)[0]?.l ?? typeLabel;
    const title = titleOf(this.graph.store, object) ?? typeLabel;
    return { iri: object, identifier, type, typeLabel, title, pluralLabel, state, ...this.lifecycleOf(object, type) };
  }

  /** The object's stage in its type's first state dimension, with every stage in order. */
  private lifecycleOf(object: string, type: string): { lifecycle?: ObjectSummary['lifecycle'] } {
    const dim = this.q(`SELECT ?d ?label ?scheme WHERE { ?d p:dimensionOf <${type}> ; rdfs:label ?label ; p:valuesFrom ?scheme ; p:order 1 }`)[0];
    if (!dim) return {};
    const stages = this.q(`SELECT ?v ?label WHERE { ?v skos:inScheme <${dim.scheme}> ; skos:prefLabel ?label ; p:order ?o FILTER NOT EXISTS { ?v p:valueStatus p:ValueStatus-deprecated } } ORDER BY ?o`);
    const value = this.q(`SELECT ?v WHERE { <${object}> <${dim.d}> ?v }`)[0]?.v;
    const position = stages.findIndex((s) => s.v === value);
    if (position < 0) return {};
    return { lifecycle: { dimension: dim.label, stage: stages[position].label, position, stages: stages.map((s) => s.label) } };
  }

  /**
   * An object's journey (spec 5.1, Journey). The lifecycle's values in order are the main path, apart from exits
   * (`p:exit`). The object's commits say which stages it entered: a stage before the current one that it never entered,
   * after its first recorded value, was skipped; stages before its first recorded value, as in a seed graph, are taken as
   * passed. At an exit, the journey runs to the stage it left from, by its history or else the ontology (`p:exitFrom`),
   * then ends at the exit; when neither says, the main path's stages are not known.
   */
  private journeyOf(object: string, type: string): Journey | undefined {
    const dim = this.q(`SELECT ?d ?label ?scheme WHERE { ?d p:dimensionOf <${type}> ; rdfs:label ?label ; p:valuesFrom ?scheme ; p:order 1 }`)[0];
    if (!dim) return undefined;
    const values = this.q(`SELECT ?v ?label ?exit ?from WHERE { ?v skos:inScheme <${dim.scheme}> ; skos:prefLabel ?label ; p:order ?o .
        OPTIONAL { ?v p:exit ?exit } OPTIONAL { ?v p:exitFrom ?from } } ORDER BY ?o`);
    const main = values.filter((v) => v.exit !== 'true');
    if (main.length < 2) return undefined;
    const current = this.q(`SELECT ?v WHERE { <${object}> <${dim.d}> ?v }`)[0]?.v;
    const at = values.find((v) => v.v === current);
    if (!at) return undefined;

    // The object's own changes to its lifecycle, oldest first, as its commits recorded them.
    const history = this.q(`SELECT ?old ?new WHERE { GRAPH ?commit { ?commit a p:Commit ; prov:startedAtTime ?at ; p:change ?ch .
        ?ch p:changedSubject <${object}> ; p:changedProperty <${dim.d}> . OPTIONAL { ?ch p:oldValue ?old } OPTIONAL { ?ch p:newValue ?new } } }
        ORDER BY ?at STRLEN(STR(?commit)) ?commit`);
    const entered = new Set(history.flatMap((h) => [h.old, h.new]).filter(Boolean));
    const first = history.length ? (history[0].old ?? history[0].new) : current;
    const firstIndex = main.findIndex((v) => v.v === first);
    const before = (i: number): JourneyStatus => (entered.has(main[i].v) || !history.length || (firstIndex >= 0 && i < firstIndex) ? 'passed' : 'skipped');

    if (at.exit !== 'true') {
      const index = main.findIndex((v) => v.v === current);
      return {
        dimension: dim.label,
        steps: main.map((v, i) => ({ stage: v.label, status: i < index ? before(i) : i === index ? 'current' : 'upcoming' })),
      };
    }
    // At an exit: where it left the main path, by its own history, or else by the ontology.
    const left = [...history].reverse().find((h) => h.new === current)?.old ?? at.from;
    const leftIndex = main.findIndex((v) => v.v === left);
    const path = leftIndex < 0
      ? main.map((v) => ({ stage: v.label, status: 'unknown' as const }))
      : main.slice(0, leftIndex + 1).map((v, i) => ({ stage: v.label, status: i === leftIndex ? ('passed' as const) : before(i) }));
    return { dimension: dim.label, steps: [...path, { stage: at.label, status: 'current', exit: true }] };
  }

  read(principal: Principal, idOrIri: string): ObjectView {
    this.authorize(principal);
    const object = this.resolve(idOrIri);
    const view = this.view(principal, object);
    if (ask(this.graph.store, `ASK { <${view.type}> p:holdsPersonalData true }`)) this.recordRead(principal, object);
    return view;
  }

  /** An object as the principal may see it, with nothing recorded: reads and searches decide what to audit. */
  private view(principal: Principal, object: string): ObjectView {
    const summary = this.summary(object);
    if (!this.canRead(principal, summary.type)) throw new GatewayError(403, ['Your role cannot read this object']);
    const hidden = this.unreadable(principal.role);
    for (const { prop, shape } of this.q(`SELECT ?prop ?shape WHERE { ?rule p:hides ?prop ; p:hiddenWhen ?shape }`)) {
      if (this.conformsSync(object, shape)) hidden.add(prop);
    }
    const unreadableTypes = this.unreadable(principal.role);
    const links: RelationshipEnd[] = this.ends(summary.type)
      .filter((end) => !unreadableTypes.has(end.type))
      .map((end) => {
        const pattern = end.direction === 'out' ? `<${object}> <${end.relationship}> ?o` : `?o <${end.relationship}> <${object}>`;
        const objects = this.q(`SELECT ?o WHERE { ${pattern} . ?o a <${end.type}> ; ls:identifier ?id } ORDER BY ?id`).map((r) => this.summary(r.o));
        return { ...end, objects, ...(end.kind === 'contains' && !end.one && this.mayCreate(principal, end.type) ? { canAdd: true } : {}) };
      });
    // Coded values show their labels, people their names; a property with several values shows them all, in order.
    const properties: Record<string, string> = {};
    for (const r of this.q(`SELECT ?prop ?label ?value ?valueLabel WHERE { <${object}> ?prop ?value . ?prop rdfs:label ?label .
          OPTIONAL { ?value skos:prefLabel ?valueLabel } OPTIONAL { ?value a p:Person ; rdfs:label ?valueLabel } OPTIONAL { ?value p:order ?order }
          FILTER NOT EXISTS { ?prop a p:Relationship } FILTER NOT EXISTS { ?prop a p:StateDimension } FILTER(?prop != ls:identifier) } ORDER BY ?label ?order ?value`)) {
      if (hidden.has(r.prop)) continue;
      const value = r.valueLabel ?? r.value;
      properties[r.label] = properties[r.label] ? `${properties[r.label]}, ${value}` : value;
    }
    const last = this.q(`SELECT ?commit ?method ?methodLabel ?person ?personName ?at WHERE { GRAPH ?commit {
        ?commit a p:Commit ; p:method ?method ; p:target <${object}> ; prov:wasAssociatedWith ?person ; prov:startedAtTime ?at } .
        OPTIONAL { ?method rdfs:label ?methodLabel } OPTIONAL { ?person rdfs:label ?personName } } ORDER BY DESC(?at) DESC(STRLEN(STR(?commit))) DESC(?commit) LIMIT 1`)[0];
    const lastChange = last && { commit: last.commit, method: last.method, methodLabel: last.methodLabel ?? last.method, person: last.person, personName: last.personName ?? last.person, at: last.at };
    const domainLabel = this.q(`SELECT ?label WHERE { <${summary.type}> p:inDomain/rdfs:label ?label }`)[0]?.label ?? '';
    const deadline = this.deadlineOf(object);
    const journey = this.journeyOf(object, summary.type);
    return { ...summary, domainLabel, urgency: this.urgencyOf(object), ...(deadline ? { deadline } : {}), links, properties, ...(journey ? { journey } : {}), ...(lastChange ? { lastChange } : {}) };
  }

  // ---------------------------------------------------------------- search (spec 5.2)

  /**
   * Search (spec 5.2): the query read against the ontology, then applied to what the principal may read. A result whose
   * personal data matched the query is a read of it, and is audited as one.
   */
  async search(principal: Principal, query: string, options: { limit?: number; understand?: 'model' | 'ontology' } = {}): Promise<SearchResult> {
    const limit = options.limit ?? 50;
    this.authorize(principal);
    const hidden = this.unreadable(principal.role);
    const types = this.q(`SELECT ?type ?label ?pluralLabel WHERE { ?type a p:ObjectType ; rdfs:label ?label ; p:pluralLabel ?pluralLabel } ORDER BY ?label`)
      .filter((t) => !hidden.has(t.type)) as { type: string; label: string; pluralLabel: string }[];
    const readable = new Set(types.map((t) => t.type));
    const states = this.q(`SELECT ?dimension ?dimensionLabel ?type ?value ?label WHERE { ?dimension p:dimensionOf ?type ; rdfs:label ?dimensionLabel ; p:valuesFrom ?scheme .
        ?value skos:inScheme ?scheme ; skos:prefLabel ?label }`).filter((v) => readable.has(v.type)) as never;
    const identifiers = new Map(
      this.q(`SELECT ?o ?id ?type WHERE { ?o ls:identifier ?id ; a ?type . ?type a p:ObjectType }`)
        .filter((r) => readable.has(r.type))
        .map((r) => [normalize(r.id), { iri: r.o, identifier: r.id }]),
    );
    const vocabulary = { types, states, identifier: (w: string) => identifiers.get(w) };
    // A connected model understands the query, from the vocabulary only; without one, or if it fails, the ontology reading does.
    let interpretation = interpret(query, vocabulary);
    let understoodBy: SearchResult['understoodBy'] = { ontology: true };
    const model = options.understand !== 'ontology' ? this.options.searchModel : undefined;
    if (model && normalize(query)) {
      const mentioned = normalize(query)
        .split(/[^\p{L}\p{N}-]+/u)
        .map((w) => identifiers.get(w)?.identifier)
        .filter((id): id is string => Boolean(id));
      const person = this.q(`SELECT ?name ?role WHERE { <${principal.person}> rdfs:label ?name . <${principal.role}> rdfs:label ?role }`)[0];
      const relationships = this.q(`SELECT DISTINCT ?l WHERE { ?r a p:Relationship ; rdfs:label ?l } ORDER BY ?l`).map((r) => r.l);
      try {
        const plan = await model.plan({
          query,
          person: { name: person?.name ?? '', role: person?.role ?? '' },
          types: types.map((t) => ({ iri: t.type, name: t.label, plural: t.pluralLabel })),
          states: (states as unknown as { dimension: string; dimensionLabel: string; type: string; value: string; label: string }[]).map((v) => ({
            iri: v.value,
            type: v.type,
            dimension: v.dimensionLabel,
            value: v.label,
          })),
          relationships,
          identifiers: [...new Set(mentioned)],
        });
        interpretation = this.checkPlan(plan, vocabulary);
        understoodBy = { model: model.model };
      } catch (error) {
        console.warn('The search model could not understand the query; reading it against the ontology instead.', error instanceof Error ? error.message : error);
      }
    }
    return this.match(principal, query, interpretation, understoodBy, limit, readable);
  }

  /** Applies an understood query to what the principal may read (spec 5.2): the core of search, shared with Ask. */
  private async match(
    principal: Principal,
    query: string,
    interpretation: Interpretation,
    understoodBy: SearchResult['understoodBy'],
    limit: number,
    readable: Set<string>,
  ): Promise<SearchResult> {
    const empty = { query, interpretation, results: [], total: 0, understoodBy };
    const understood = interpretation.types.length + interpretation.states.length + interpretation.identifiers.length + interpretation.words.length + (interpretation.mine ? 1 : 0);
    if (!understood) return empty;

    // Candidates: the identified objects, the objects of the types linked to them, or every object of the types.
    const wanted = interpretation.types.length ? interpretation.types.map((t) => t.type) : [...readable];
    const linked = interpretation.identifiers.length > 0 && interpretation.types.length > 0;
    let candidates: { iri: string; score: number; matched: string[] }[];
    if (linked) {
      candidates = interpretation.identifiers.flatMap((anchor) =>
        this.q(`SELECT DISTINCT ?o ?type WHERE { { <${anchor.iri}> ?r ?o } UNION { ?o ?r <${anchor.iri}> } ?r a p:Relationship . ?o a ?type . ?type a p:ObjectType }`)
          .filter((r) => wanted.includes(r.type))
          .map((r) => ({ iri: r.o, score: 60, matched: [`Linked to ${anchor.identifier}`] })),
      );
    } else if (interpretation.identifiers.length) {
      candidates = interpretation.identifiers.map((i) => ({ iri: i.iri, score: 100, matched: ['Identifier'] }));
    } else {
      candidates = wanted.flatMap((type) => this.q(`SELECT ?o WHERE { ?o a <${type}> }`).map((r) => ({ iri: r.o, score: interpretation.words.length ? 20 : 50, matched: [] })));
    }
    const seen = new Set<string>();
    candidates = candidates.filter((c) => !seen.has(c.iri) && seen.add(c.iri));

    // Mine: work waiting for the principal on To do, or objects that name them in a person property (spec 5.2).
    if (interpretation.mine) {
      const waiting = new Set((await this.todo(principal)).map((i) => i.object.iri));
      const naming = new Map(
        this.q(`SELECT ?o ?label WHERE { ?o ?p <${principal.person}> . ?p rdfs:label ?label . ?o a ?t . ?t a p:ObjectType }`).map((r) => [r.o, r.label]),
      );
      candidates = candidates.filter((c) => waiting.has(c.iri) || naming.has(c.iri));
      for (const c of candidates) c.matched.unshift(waiting.has(c.iri) ? 'Yours: waiting for you' : `Yours: ${naming.get(c.iri)} you`);
    }

    // States: within a dimension any of the values understood; across dimensions, all of them.
    const byDimension = new Map<string, { values: Set<string>; label: string }>();
    for (const s of interpretation.states) {
      const entry = byDimension.get(s.dimension) ?? { values: new Set(), label: s.dimensionLabel };
      entry.values.add(s.value);
      byDimension.set(s.dimension, entry);
    }
    const typeLabel = new Map(interpretation.types.map((t) => [t.type, t.label]));
    const matches: { iri: string; score: number; matched: string[]; view: ObjectView; personal: boolean }[] = [];
    for (const c of candidates) {
      const view = this.view(principal, c.iri);
      const matched = [...c.matched];
      if (typeLabel.has(view.type)) matched.push(`Type: ${typeLabel.get(view.type)}`);
      if (byDimension.size) {
        const own = this.q(`SELECT ?d ?v WHERE { ?d p:dimensionOf <${view.type}> . <${c.iri}> ?d ?v }`);
        const relevant = [...byDimension.entries()].filter(([d]) => this.q(`SELECT ?t WHERE { <${d}> p:dimensionOf ?t }`)[0]?.t === view.type);
        if (!relevant.length || !relevant.every(([d, { values }]) => own.some((o) => o.d === d && values.has(o.v)))) continue;
        for (const [d, { label }] of relevant) matched.push(`${label}: ${own.filter((o) => o.d === d).map((o) => this.q(`SELECT ?l WHERE { <${o.v}> skos:prefLabel ?l }`)[0].l).join(', ')}`);
      }
      // Words: each must appear in what the principal may read; say where, preferring the identifier and state.
      let personal = false;
      if (interpretation.words.length) {
        const fields: [string, string][] = [
          ['Identifier', view.identifier],
          ...Object.entries(view.state).map(([k, v]) => [k, v] as [string, string]),
          ...Object.entries(view.properties).map(([k, v]) => [k, v] as [string, string]),
          ...view.links.map((l) => [l.label, l.objects.map((o) => o.identifier).join(', ')] as [string, string]),
        ];
        const all = fields.map(([, v]) => v).join(' ');
        if (!containsWords(all, interpretation.words)) continue;
        const hits = fields.filter(([, v]) => interpretation.words.some((w) => containsWords(v, [w])));
        for (const [k, v] of hits.slice(0, 2)) matched.push(k === 'Identifier' ? 'Identifier' : `${k}: ${v.length > 80 ? `${v.slice(0, 77).trimEnd()}…` : v}`);
        personal = hits.some(([k]) => k in view.properties);
        c.score += hits.some(([k]) => k === 'Identifier') ? 10 : 5;
      }
      matches.push({ ...c, matched, view, personal: personal && ask(this.graph.store, `ASK { <${view.type}> p:holdsPersonalData true }`) });
    }
    matches.sort((a, b) => b.score - a.score || a.view.identifier.localeCompare(b.view.identifier, undefined, { numeric: true }));
    const shown = matches.slice(0, limit);
    // Matching personal data is reading it (spec 5.2): audited as the principal's read.
    for (const m of shown) if (m.personal) this.recordRead(principal, m.iri);
    return {
      query,
      interpretation,
      results: shown.map((m) => ({
        object: { iri: m.view.iri, identifier: m.view.identifier, type: m.view.type, typeLabel: m.view.typeLabel, title: m.view.title, pluralLabel: m.view.pluralLabel, state: m.view.state, ...(m.view.lifecycle ? { lifecycle: m.view.lifecycle } : {}) },
        matched: m.matched,
      })),
      total: matches.length,
      understoodBy,
    };
  }

  // ---------------------------------------------------------------- ask (spec 5.2, Asking a question)

  /** How many turns a question may take, tool calls included (spec 5.2: bounded). */
  static readonly ASK_STEPS = 12;

  /**
   * Ask (spec 5.2, Asking a question): a connected model answers from what the principal may read, through read-only
   * gateway tools run as the principal. The answer cites only objects the model read here. Without a model, or when it
   * fails or declines, the question is searched, and the result says why.
   */
  async ask(principal: Principal, question: string, earlier: AskTurn[] = [], about: string[] = []): Promise<AskResult> {
    this.authorize(principal);
    // The objects the question is asked from (spec 5.2, About an object): each must be one the principal may read.
    const objects = [...new Set(about)].slice(0, MAX_ABOUT).map((id) => {
      const object = this.resolve(id);
      if (!this.canRead(principal, this.typeOf(object).type)) throw new GatewayError(403, [`You may not read ${id}`]);
      return this.summary(object);
    });
    const model = this.options.askModel;
    // Without a model, a question about objects shows those objects; any other question is searched.
    const searchFor = objects.length ? objects.map((o) => o.identifier).join(' ') : question;
    const searched = async (reason?: string): Promise<AskResult> => ({ question, search: await this.search(principal, searchFor), ...(reason ? { searched: reason } : {}) });
    if (!normalize(question)) return searched();
    if (!model) return searched(objects.length ? 'No model is connected to answer questions, so here is what you asked about.' : 'No model is connected to answer questions, so the question was searched.');

    // What the model met through the tools in this question: only these may be cited.
    const seen = new Map<string, string>();
    const toolbox = {
      // A person who may create change sets may also have one drafted from their words (spec 3.7, Drafted in words).
      tools: [...ASK_TOOLS, ...(ask(this.graph.store, `ASK { <${principal.role}> p:mayCreate p:ChangeSet }`) ? [DRAFT_CHANGE_TOOL] : []), ANSWER_TOOL],
      run: (name: string, input: unknown) => this.runAskTool(principal, name, input, seen),
    };
    try {
      // The objects asked about are read now, as the principal and audited, and may be cited like anything read.
      const records = [];
      for (const o of objects) records.push((await this.runAskTool(principal, 'read_object', { identifier: o.identifier }, seen)).content);
      const answer = await model.answer({ question, earlier: checkTurns(earlier), about: records, context: this.askContext(principal), toolbox, maxSteps: Gateway.ASK_STEPS });
      const cited: ObjectSummary[] = [];
      for (const identifier of answer.cited) {
        const iri = seen.get(normalize(identifier));
        if (iri && !cited.some((c) => c.iri === iri)) cited.push(this.summary(iri));
      }
      return { question, answer: { status: answer.status, text: answer.text, cited, model: answer.model, lookedAt: seen.size } };
    } catch (error) {
      console.warn('The ask model could not answer; searching the question instead.', error instanceof Error ? error.message : error);
      return searched('The model could not answer, so the question was searched.');
    }
  }

  /** Who is asking, today, and the vocabulary they may read, as text for the model. Never a record (spec 5.2). */
  private askContext(principal: Principal): string {
    const person = this.q(`SELECT ?name ?role WHERE { <${principal.person}> rdfs:label ?name . <${principal.role}> rdfs:label ?role }`)[0];
    const hidden = this.unreadable(principal.role);
    const lines = [
      `The person asking: ${person?.name ?? 'unknown'}, acting as ${person?.role ?? 'unknown'}.`,
      `Today: ${this.now().toISOString().slice(0, 10)}.`,
      'The kinds of object they may read, with their states, other properties and links:',
    ];
    for (const t of this.q(`SELECT ?type ?label ?plural ?domain WHERE { ?type a p:ObjectType ; rdfs:label ?label ; p:pluralLabel ?plural . OPTIONAL { ?type p:inDomain/rdfs:label ?domain } } ORDER BY ?label`)) {
      if (hidden.has(t.type)) continue;
      const states = this.q(`SELECT ?d ?dim ?value WHERE { ?d p:dimensionOf <${t.type}> ; rdfs:label ?dim ; p:order ?o ; p:valuesFrom ?s . ?v skos:inScheme ?s ; skos:prefLabel ?value ; p:order ?vo } ORDER BY ?o ?vo`).filter((r) => !hidden.has(r.d));
      const dims = new Map<string, string[]>();
      for (const r of states) dims.set(r.dim, [...(dims.get(r.dim) ?? []), r.value]);
      // Names only, and only of properties the role may read: an unreadable property is not even named.
      const properties = this.q(`SELECT DISTINCT ?prop ?label WHERE { ?shape (sh:targetClass|p:describes) <${t.type}> ; sh:property/sh:path ?prop . ?prop rdfs:label ?label .
          FILTER NOT EXISTS { ?prop a p:Relationship } FILTER NOT EXISTS { ?prop a p:StateDimension } FILTER(?prop != ls:identifier) } ORDER BY ?label`)
        .filter((r) => !hidden.has(r.prop))
        .map((r) => r.label);
      const links = this.ends(t.type)
        .filter((end) => !hidden.has(end.type))
        .map((end) => `${end.label} ${end.one ? `one ${end.typeLabel}` : end.pluralLabel}`);
      lines.push(
        `- ${t.label} (plural ${t.plural})${t.domain ? `, in ${t.domain}` : ''}.` +
          (dims.size ? ` States: ${[...dims].map(([d, v]) => `${d} (${v.join(', ')})`).join('; ')}.` : '') +
          (properties.length ? ` Properties: ${properties.join(', ')}.` : '') +
          (links.length ? ` Links: ${links.join('; ')}.` : ''),
      );
    }
    return lines.join('\n');
  }

  /** Runs one of the model's tools as the principal. A refusal or a mistake goes back to the model to correct. */
  private async runAskTool(principal: Principal, name: string, input: unknown, seen: Map<string, string>): Promise<AskToolOutput> {
    const meet = (o: { iri: string; identifier: string }) => seen.set(normalize(o.identifier), o.iri);
    const brief = (o: ObjectSummary) => ({ identifier: o.identifier, type: o.typeLabel, title: o.title, state: o.state });
    const args = (input ?? {}) as Record<string, unknown>;
    const strings = (key: string) => (Array.isArray(args[key]) ? (args[key] as unknown[]).filter((v): v is string => typeof v === 'string') : []);
    const text = (key: string) => (typeof args[key] === 'string' ? (args[key] as string) : '');
    const out = (value: unknown): AskToolOutput => ({ content: JSON.stringify(value) });
    try {
      const vocabulary = this.askVocabulary(principal);
      switch (name) {
        case 'find_objects': {
          const types = strings('types').map((n) => ({ n, t: vocabulary.type(n) }));
          const chosen = types.filter((x) => x.t).map((x) => x.t!);
          const states = strings('states').map((n) => ({ n, s: vocabulary.states(n, chosen.map((t) => t.type)) }));
          const linked = strings('linked_to').map((n) => ({ n, o: vocabulary.identifier(n) }));
          const notUnderstood = [...types.filter((x) => !x.t), ...states.filter((x) => !x.s.length), ...linked.filter((x) => !x.o)].map((x) => x.n);
          const interpretation: Interpretation = {
            types: chosen.map((t) => ({ type: t.type, label: t.label })),
            states: states.flatMap((x) => x.s),
            identifiers: linked.filter((x) => x.o).map((x) => x.o!),
            words: strings('words').map(normalize).filter((w) => w && !w.includes(' ')).slice(0, 8),
            mine: args.mine === true,
          };
          const result = await this.match(principal, '', interpretation, { ontology: true }, 50, vocabulary.readable);
          for (const r of result.results) meet(r.object);
          return out({ total: result.total, shown: result.results.length, objects: result.results.map((r) => ({ ...brief(r.object), matched: r.matched })), ...(notUnderstood.length ? { notUnderstood } : {}) });
        }
        case 'read_object': {
          const view = this.read(principal, vocabulary.identifier(text('identifier'))?.iri ?? text('identifier'));
          meet(view);
          // Properties that identify a person directly reach the model withheld (spec 5.2).
          const withheld = new Set(this.q(`SELECT ?label WHERE { ?prop p:identifiesPerson true ; rdfs:label ?label }`).map((r) => r.label));
          const properties = Object.fromEntries(Object.entries(view.properties).map(([k, v]) => [k, withheld.has(k) ? 'withheld' : v]));
          for (const end of view.links) for (const o of end.objects) meet(o);
          return out({
            ...brief(view),
            domain: view.domainLabel,
            properties,
            links: view.links.filter((end) => end.objects.length).map((end) => ({ link: end.label, objects: end.objects.map(brief) })),
            ...(view.deadline ? { deadline: view.deadline } : {}),
            urgency: view.urgency,
            // Where it is along its lifecycle, so a question about progress is answered from the same journey a person sees.
            ...(view.journey ? { journey: { lifecycle: view.journey.dimension, stages: view.journey.steps.map((j) => ({ stage: j.stage, status: j.status, ...(j.exit ? { exit: true } : {}) })) } } : {}),
            ...(view.lastChange ? { lastChange: { method: view.lastChange.methodLabel, by: view.lastChange.personName, at: view.lastChange.at } } : {}),
          });
        }
        case 'count_objects': {
          const type = vocabulary.type(text('type'));
          if (!type) return { content: `There is no type you may read called "${text('type')}". Use a name from the list you were given.`, isError: true };
          const states = strings('states').flatMap((n) => vocabulary.states(n, [type.type]));
          let objects = this.q(`SELECT ?o WHERE { ?o a <${type.type}> ; ls:identifier ?id } ORDER BY ?id`).map((r) => this.summary(r.o));
          const byDimension = new Map<string, Set<string>>();
          for (const s of states) byDimension.set(s.dimensionLabel, (byDimension.get(s.dimensionLabel) ?? new Set()).add(s.label));
          objects = objects.filter((o) => [...byDimension].every(([d, values]) => values.has(o.state[d])));
          const by = normalize(text('group_by'));
          if (!by) return out({ type: type.label, total: objects.length });
          const dimension = Object.keys(objects[0]?.state ?? {}).find((d) => normalize(d) === by) ?? this.q(`SELECT ?l WHERE { ?d p:dimensionOf <${type.type}> ; rdfs:label ?l }`).map((r) => r.l).find((l) => normalize(l) === by);
          const groups = new Map<string, number>();
          if (dimension) {
            for (const o of objects) groups.set(o.state[dimension] ?? 'none', (groups.get(o.state[dimension] ?? 'none') ?? 0) + 1);
          } else {
            const end = this.ends(type.type).find((e) => !vocabulary.hidden.has(e.type) && [e.label, e.typeLabel, e.pluralLabel, `${e.label} ${e.typeLabel}`].some((n) => normalize(n) === by));
            if (!end) return { content: `"${text('group_by')}" is neither a state nor a link of ${type.label}. Use one from the list you were given.`, isError: true };
            for (const o of objects) {
              const pattern = end.direction === 'out' ? `<${o.iri}> <${end.relationship}> ?x` : `?x <${end.relationship}> <${o.iri}>`;
              const others = this.q(`SELECT ?x ?id WHERE { ${pattern} . ?x a <${end.type}> ; ls:identifier ?id } ORDER BY ?id`);
              if (!others.length) groups.set('none', (groups.get('none') ?? 0) + 1);
              for (const x of others) {
                meet({ iri: x.x, identifier: x.id });
                groups.set(x.id, (groups.get(x.id) ?? 0) + 1);
              }
            }
          }
          return out({ type: type.label, total: objects.length, groupedBy: dimension ?? text('group_by'), groups: [...groups].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count })) });
        }
        case 'methods_for': {
          const object = vocabulary.identifier(text('identifier'));
          if (!object) return { content: `There is no object you may read with the identifier "${text('identifier')}".`, isError: true };
          meet(object);
          const methods = await this.methods(principal, object.iri);
          return out({ identifier: object.identifier, methods: methods.map((m) => ({ method: m.label, available: m.available, ...(m.blocks.length ? { blockedBecause: m.blocks } : {}) })) });
        }
        case 'draft_change_set': {
          const drafted = await this.draftChangeSet(principal, args);
          meet({ iri: drafted.iri, identifier: drafted.identifier });
          return out(drafted.view);
        }
        default:
          return { content: `There is no tool called ${name}.`, isError: true };
      }
    } catch (error) {
      if (error instanceof GatewayError) return { content: error.reasons.join(' '), isError: true };
      throw error;
    }
  }

  /**
   * Drafted in words (spec 3.7): a change set made from what a model drafted, as the principal, through the same create
   * and method requests a person uses. It is only a draft: proposing, approving and applying stay with people. When an
   * operation is refused, the draft is withdrawn and the reasons go back to the model to correct.
   */
  private async draftChangeSet(principal: Principal, args: Record<string, unknown>) {
    const summary = typeof args.summary === 'string' ? args.summary.trim() : '';
    if (!summary) throw new GatewayError(400, ['Say in a sentence what the change set changes and why']);
    const operations = Array.isArray(args.operations) ? (args.operations as Record<string, unknown>[]) : [];
    if (!operations.length) throw new GatewayError(400, ['A change set needs at least one operation']);
    const created = await this.create(principal, `${NS.p}ChangeSet`, { changeSummary: summary });
    const changeSet = created.created[0];
    const str = (o: Record<string, unknown>, k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim() : '');
    try {
      for (const [i, op] of operations.entries()) {
        const kind = str(op, 'kind');
        const step = `Operation ${i + 1} (${kind || 'no kind'})`;
        try {
          if (kind === 'add value') await this.commit(principal, changeSet, `${NS.p}AddValue`, { valueSet: str(op, 'value_set'), label: str(op, 'label') });
          else if (kind === 'relabel') await this.commit(principal, changeSet, `${NS.p}RelabelValue`, { value: str(op, 'value'), label: str(op, 'label') });
          else if (kind === 'deprecate') await this.commit(principal, changeSet, `${NS.p}DeprecateValue`, { value: str(op, 'value'), replacement: str(op, 'replacement') });
          else throw new GatewayError(400, ['The kind must be add value, relabel or deprecate']);
        } catch (error) {
          if (error instanceof GatewayError) throw new GatewayError(400, error.reasons.map((r) => `${step}: ${r}`));
          throw error;
        }
      }
    } catch (error) {
      await this.commit(principal, changeSet, `${NS.p}WithdrawChangeSet`).catch(() => undefined);
      throw error;
    }
    const summaryOf = this.summary(changeSet);
    const impact = await this.structureImpact(changeSet, 'apply');
    return {
      iri: changeSet,
      identifier: summaryOf.identifier,
      view: { identifier: summaryOf.identifier, title: summaryOf.title, status: 'draft', operations: impact.structure, impact, next: 'A person reviews the draft and proposes it; its owners approve it before it is applied.' },
    };
  }

  /** Names the model may use, resolved to what the principal may read: types, state values and identifiers. */
  private askVocabulary(principal: Principal) {
    const hidden = this.unreadable(principal.role);
    const types = this.q(`SELECT ?type ?label ?pluralLabel WHERE { ?type a p:ObjectType ; rdfs:label ?label ; p:pluralLabel ?pluralLabel }`).filter((t) => !hidden.has(t.type));
    const readable = new Set(types.map((t) => t.type));
    const allStates = this.q(`SELECT ?dimension ?dimensionLabel ?type ?value ?label WHERE { ?dimension p:dimensionOf ?type ; rdfs:label ?dimensionLabel ; p:valuesFrom ?scheme .
        ?value skos:inScheme ?scheme ; skos:prefLabel ?label }`).filter((v) => readable.has(v.type)) as Interpretation['states'];
    return {
      hidden,
      readable,
      type: (name: string) => {
        const n = normalize(name);
        const t = types.find((x) => normalize(x.label) === n || normalize(x.pluralLabel) === n);
        return t && { type: t.type, label: t.label };
      },
      /** A state value, as "value" or "Dimension: value", of the given types or of any type when none is given. */
      states: (phrase: string, of: string[]) => {
        const [dim, value] = phrase.includes(':') ? phrase.split(':').map(normalize) : ['', normalize(phrase)];
        return allStates.filter((s) => normalize(s.label) === value && (!dim || normalize(s.dimensionLabel) === dim) && (!of.length || of.includes(s.type)));
      },
      identifier: (id: string) => {
        const r = this.q(`SELECT ?o ?id ?type WHERE { ?o ls:identifier ?id ; a ?type . ?type a p:ObjectType FILTER(LCASE(STR(?id)) = ${JSON.stringify(normalize(id))}) }`)[0];
        return r && readable.has(r.type) ? { iri: r.o, identifier: r.id } : undefined;
      },
    };
  }

  /** A model's search plan, kept to the vocabulary the principal may read: anything else is dropped (spec 5.2). */
  private checkPlan(
    plan: SearchPlan,
    vocabulary: { types: { type: string; label: string }[]; states: unknown; identifier: (w: string) => { iri: string; identifier: string } | undefined },
  ): Interpretation {
    const states = vocabulary.states as { dimension: string; dimensionLabel: string; type: string; value: string; label: string }[];
    const types = vocabulary.types.filter((t) => plan.types.includes(t.type)).map((t) => ({ type: t.type, label: t.label }));
    const chosenStates = states
      .filter((v) => plan.states.includes(v.value))
      .filter((v) => !types.length || types.some((t) => t.type === v.type))
      .map((v) => ({ dimension: v.dimension, dimensionLabel: v.dimensionLabel, type: v.type, value: v.value, label: v.label }));
    const identifiers = plan.identifiers.map((id) => vocabulary.identifier(normalize(id))).filter((i): i is { iri: string; identifier: string } => Boolean(i));
    const words = plan.words.map(normalize).filter((w) => w && !w.includes(' ')).slice(0, 8);
    return { types, states: chosenStates, identifiers, words, mine: Boolean(plan.mine) };
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
      ...(principal.account ? [quad(read, namedNode(`${NS.p}signedInAs`), literal(principal.account), g)] : []),
      quad(read, namedNode(`${NS.p}target`), namedNode(object), g),
      quad(read, namedNode(`${NS.prov}startedAtTime`), literal(at.toISOString(), namedNode(`${NS.xsd}dateTime`)), g),
    ];
    // Journal first: if the read cannot be recorded durably, it is not answered.
    this.options.journal?.append('read', at, [], quads);
    for (const q of quads) this.graph.store.add(q);
    this.readCount++;
  }

  /** The audit trail of personal-data reads, newest last. */
  reads(): { person: string; role: string; object: string; at: string; account?: string }[] {
    return this.q(`SELECT ?person ?role ?object ?at ?account WHERE { GRAPH <${this.dataNamespace}audit> {
        ?r a p:Read ; prov:wasAssociatedWith ?person ; p:actedAs ?role ; p:target ?object ; prov:startedAtTime ?at .
        OPTIONAL { ?r p:signedInAs ?account } } } ORDER BY ?at STRLEN(STR(?r)) ?r`) as never;
  }

  // ---------------------------------------------------------------- methods

  async methods(principal: Principal, idOrIri: string): Promise<MethodOption[]> {
    this.authorize(principal);
    const object = this.resolve(idOrIri);
    if (!this.canRead(principal, this.typeOf(object).type)) throw new GatewayError(403, ['Your role cannot read this object']);
    // Methods the platform cannot run yet, for want of a worker or a connected model, are blocked with that reason.
    return (await methodsFor(this.graph, object, principal.role)).map((m) => {
      const missing = [...this.draftBlocks(m.method, true), ...this.ownerBlocks(principal, object, m.method)].filter((b) => !m.blocks.includes(b));
      return missing.length ? { ...m, available: false, blocks: [...missing, ...m.blocks] } : m;
    });
  }

  /** Why the platform cannot run a method at all yet: no worker for its background work, or no model to draft it. */
  private unavailable(method: string): string[] {
    return [...backgroundBlocks(this.graph.store, method), ...this.draftBlocks(method, true)];
  }

  /**
   * Why a method a model must write cannot run (spec 3.4, Generated drafts): no drafting effect the platform can run,
   * or, when asked, no model connected. Empty for other methods, such as a person's suggestion awaiting review.
   */
  private draftBlocks(method: string, needsModel: boolean): string[] {
    // A method a model must do, with no drafting effect the platform can run, such as proposing compounds.
    if (ask(this.graph.store, `ASK { <${method}> p:needsModel true }`) && !this.draftingOf(method)) {
      const described = this.q(`SELECT ?d WHERE { <${method}> p:effect ?e . ?e a p:DescribedEffect ; p:description ?d }`).map((r) => r.d);
      return [['No model can draft this yet.', ...described].join(' ')];
    }
    if (!this.draftingOf(method)) return [];
    if (needsModel && !this.options.drafter) return ['No model is connected to draft this. A deployment connects one; previews never do.'];
    return [];
  }

  private draftingOf(method: string): { effect: string; property: string; instructions: string; drawsOn: string[] } | undefined {
    const e = this.q(`SELECT ?e ?property ?instructions WHERE { <${method}> p:effect ?e . ?e a p:Drafting ; p:draftsProperty ?property ; p:instructions ?instructions }`)[0];
    if (!e) return undefined;
    const drawsOn = this.q(`SELECT ?r WHERE { <${e.e}> p:drawsOn ?r } ORDER BY ?r`).map((r) => r.r);
    return { effect: e.e, property: e.property, instructions: e.instructions, drawsOn };
  }

  // ---------------------------------------------------------------- commits

  /** Commits run one at a time: each waits for the one before it to finish. */
  commit(principal: Principal, idOrIri: string, method: string, inputs: Record<string, string> = {}, signature?: SignatureGiven, draft?: DraftGiven, proposal?: string): Promise<CommitResult> {
    return this.enqueue(() => this.runCommit(principal, idOrIri, method, inputs, signature, draft, [], proposal));
  }

  // ---------------------------------------------------------------- home (spec 5.1)

  /** Each person's homepage: the metrics their roles watch, where things stand, and what they have done lately. */
  home(principal: Principal): HomeView {
    this.authorize(principal);
    const today = this.now().toISOString().slice(0, 10);
    const metrics: HomeView['metrics'] = [];
    for (const m of this.q(`SELECT DISTINCT ?m ?label ?comment ?type ?plural ?past ?watch ?risk ?more WHERE { <${principal.role}> p:watches ?m .
        ?m rdfs:label ?label ; rdfs:comment ?comment ; p:metricOf ?type . ?type p:pluralLabel ?plural .
        OPTIONAL { ?m p:pastDue ?past } OPTIONAL { ?m p:watchAt ?watch } OPTIONAL { ?m p:riskAt ?risk } OPTIONAL { ?m p:moreIsBetter ?more } }`)) {
      if (!this.canRead(principal, m.type)) continue;
      const count = this.metricMatches(m.m, m.type, today).length;
      const total = Number(this.q(`SELECT (COUNT(?o) AS ?n) WHERE { ?o a <${m.type}> }`)[0].n);
      const health = this.healthOf(count, m.watch, m.risk, m.more);
      metrics.push({ metric: m.m, label: m.label, comment: m.comment, type: m.type, pluralLabel: m.plural, count, total, ...(health ? { health } : {}) });
    }
    // What needs attention first: at risk, then watch, then on track, then information only; by name within each.
    const severity = (h?: string) => (h === 'at risk' ? 0 : h === 'watch' ? 1 : h === 'on track' ? 2 : 3);
    metrics.sort((a, b) => severity(a.health) - severity(b.health) || a.label.localeCompare(b.label));
    // Where things stand: the types of the person's navigation, then those their metrics count, by lifecycle stage.
    // The lifecycle is the first dimension methods move; a classifying one, such as a study's phase, is not a lifecycle.
    const lifecycles: HomeView['lifecycles'] = [];
    const types = new Map(this.navigation(principal).flatMap((d) => d.types).map((t) => [t.type, t]));
    for (const m of metrics) {
      if (types.has(m.type)) continue;
      const t = this.q(`SELECT ?label ?plural WHERE { <${m.type}> rdfs:label ?label ; p:pluralLabel ?plural }`)[0];
      types.set(m.type, { type: m.type, label: t.label, pluralLabel: t.plural, count: m.total });
    }
    for (const t of types.values()) {
      const dim = this.q(`SELECT ?d ?label WHERE { ?d p:dimensionOf <${t.type}> ; p:order ?order ; rdfs:label ?label FILTER NOT EXISTS { ?d p:chosenOnCreate true } } ORDER BY ?order LIMIT 1`)[0];
      if (!dim || !t.count) continue;
      const stages = this.q(`SELECT ?v ?label (COUNT(?o) AS ?n) WHERE { <${dim.d}> p:valuesFrom ?s . ?v skos:inScheme ?s ; skos:prefLabel ?label ; p:order ?order . FILTER NOT EXISTS { ?v p:valueStatus p:ValueStatus-deprecated }
          OPTIONAL { ?o a <${t.type}> ; <${dim.d}> ?v } } GROUP BY ?v ?label ?order ORDER BY ?order`).map((r) => ({ value: r.v, label: r.label, count: Number(r.n) }));
      const total = stages.reduce((a, b) => a + b.count, 0);
      if (total) lifecycles.push({ type: t.type, label: t.label, pluralLabel: t.pluralLabel, dimension: dim.label, total, stages });
    }
    const since = new Date(this.now().getTime() - 7 * 86_400_000).toISOString();
    const doneLast7Days = Number(this.q(`SELECT (COUNT(DISTINCT ?c) AS ?n) WHERE { GRAPH ?c { ?c a p:Commit ; prov:wasAssociatedWith <${principal.person}> ; prov:startedAtTime ?at }
        FILTER(?at >= "${since}"^^xsd:dateTime) }`)[0].n);
    return { metrics, lifecycles, doneLast7Days };
  }

  /** The objects a metric counts: its type, in its states (values of one dimension are alternatives), past due if it says so. */
  private metricMatches(metric: string, type: string, today: string): string[] {
    const byDimension = new Map<string, string[]>();
    for (const { v, d } of this.q(`SELECT ?v ?d WHERE { <${metric}> p:inState ?v . ?d p:dimensionOf <${type}> ; p:valuesFrom ?s . ?v skos:inScheme ?s }`)) {
      byDimension.set(d, [...(byDimension.get(d) ?? []), v]);
    }
    const where = [...byDimension].map(([d, vs], i) => `?o <${d}> ?v${i} FILTER(?v${i} IN (${vs.map((v) => `<${v}>`).join(', ')}))`);
    const past = this.q(`SELECT ?p WHERE { <${metric}> p:pastDue ?p }`)[0]?.p;
    if (past) where.push(`?o <${past}> ?date FILTER(?date < "${today}"^^xsd:date)`);
    return this.q(`SELECT DISTINCT ?o WHERE { ?o a <${type}> . ${where.join(' . ')} } ORDER BY ?o`).map((r) => r.o);
  }

  private healthOf(count: number, watch?: string, risk?: string, more?: string): HomeView['metrics'][number]['health'] {
    if (watch === undefined) return undefined;
    const [w, r, better] = [Number(watch), Number(risk ?? watch), more === 'true'];
    return better ? (count <= r ? 'at risk' : count <= w ? 'watch' : 'on track') : count >= r ? 'at risk' : count >= w ? 'watch' : 'on track';
  }

  /** A metric and exactly the objects it counts, for its own page (spec 5.1, Home, From a metric to its objects). */
  metricObjects(principal: Principal, metricId: string): { metric: HomeView['metrics'][number]; objects: ObjectSummary[] } {
    this.authorize(principal);
    const metric = metricId.includes('://') ? metricId : `${NS.ls}${metricId}`;
    const m = this.q(`SELECT ?label ?comment ?type ?plural ?watch ?risk ?more WHERE { <${metric}> a p:Metric ; rdfs:label ?label ; rdfs:comment ?comment ; p:metricOf ?type .
        ?type p:pluralLabel ?plural OPTIONAL { <${metric}> p:watchAt ?watch } OPTIONAL { <${metric}> p:riskAt ?risk } OPTIONAL { <${metric}> p:moreIsBetter ?more } }`)[0];
    if (!m) throw new GatewayError(404, ['No such metric']);
    if (!this.canRead(principal, m.type)) throw new GatewayError(403, ['Your role cannot read these objects']);
    const objects = this.metricMatches(metric, m.type, this.now().toISOString().slice(0, 10)).map((o) => this.summary(o));
    const total = Number(this.q(`SELECT (COUNT(?o) AS ?n) WHERE { ?o a <${m.type}> }`)[0].n);
    const health = this.healthOf(objects.length, m.watch, m.risk, m.more);
    return {
      metric: { metric, label: m.label, comment: m.comment, type: m.type, pluralLabel: m.plural, count: objects.length, total, ...(health ? { health } : {}) },
      objects,
    };
  }

  // ---------------------------------------------------------------- creating and editing (spec 5.3)

  /** Whether the principal may create objects of a type: a permission, never for a type that comes only through methods. */
  private mayCreate(principal: Principal, type: string): boolean {
    return this.canRead(principal, type) && ask(this.graph.store, `ASK { <${principal.role}> p:mayCreate <${type}> FILTER NOT EXISTS { <${type}> p:onlyThroughMethods true } }`);
  }

  /** The containment that makes a type part of another: its one-valued link to the object it belongs to, and that object's types. */
  private parentLinkOf(type: string): { property: string; label: string; targets: string[] } | undefined {
    const r = this.q(`SELECT ?rel ?label ?ps WHERE { ?shape (sh:targetClass|p:describes) <${type}> ; sh:property ?ps . ?ps sh:path ?rel ; sh:maxCount 1 .
        ?rel p:partOf true ; rdfs:label ?label }`)[0];
    if (!r) return undefined;
    return { property: r.rel, label: r.label, targets: this.targetsOf(r.ps) };
  }

  private targetsOf(propertyShape: string): string[] {
    return this.q(`SELECT DISTINCT ?t WHERE { { <${propertyShape}> sh:class ?t } UNION { <${propertyShape}> sh:or/rdf:rest*/rdf:first/sh:class ?t } }`).map((r) => r.t);
  }

  /** The fields of a type's form: the title's properties, the parent and classifying states first and required, then the rest. */
  private formFields(principal: Principal, type: string, mode: 'create' | 'edit', object?: string): FormField[] {
    const hidden = this.unreadable(principal.role);
    const template = this.q(`SELECT ?t WHERE { <${type}> p:titleTemplate ?t }`)[0]?.t ?? '';
    const titled = new Set(templateProperties(template.split(' | ')[0]));
    const parent = this.parentLinkOf(type);
    const shapes = this.q(`SELECT ?ps ?path ?dt ?max ?name ?label ?order WHERE { ?shape (sh:targetClass|p:describes) <${type}> ; sh:property ?ps . ?ps sh:path ?path .
        OPTIONAL { ?ps sh:datatype ?dt } OPTIONAL { ?ps sh:maxCount ?max } OPTIONAL { ?ps sh:name ?name } OPTIONAL { ?path rdfs:label ?label } OPTIONAL { ?path p:order ?order }
        FILTER(?path != ls:identifier) }`);
    const current = (property: string) => (object ? this.q(`SELECT ?v WHERE { <${object}> <${property}> ?v }`)[0]?.v : undefined);
    const objectChoices = (types: string[]) =>
      types.filter((t) => this.canRead(principal, t)).flatMap((t) => this.q(`SELECT ?o WHERE { ?o a <${t}> ; ls:identifier ?id } ORDER BY ?id`).map((r) => this.summary(r.o)))
        .map((o) => ({ value: o.iri, label: `${o.identifier} · ${o.title}` }));
    const fields: FormField[] = [];
    for (const sh of shapes) {
      if (hidden.has(sh.path)) continue;
      const label = sh.label ?? sh.name ?? sh.path.split('#').pop()!;
      const name = sh.path.split(/[#/]/).pop()!;
      const base = { name, property: sh.path, label: label[0].toUpperCase() + label.slice(1) };
      const isDimension = ask(this.graph.store, `ASK { <${sh.path}> a p:StateDimension }`);
      const isRelationship = ask(this.graph.store, `ASK { <${sh.path}> a p:Relationship }`);
      const value = current(sh.path);
      if (isDimension) {
        // Only classifying states are chosen; lifecycles start at their first value and only methods move them.
        if (!ask(this.graph.store, `ASK { <${sh.path}> p:chosenOnCreate true }`)) continue;
        const choices = this.q(`SELECT ?value ?label WHERE { <${sh.path}> p:valuesFrom ?s . ?value skos:inScheme ?s ; skos:prefLabel ?label ; p:order ?order FILTER NOT EXISTS { ?value p:valueStatus p:ValueStatus-deprecated } } ORDER BY ?order`);
        fields.push({ ...base, kind: 'choice', required: true, choices: choices.map((c) => ({ value: c.value, label: c.label })), ...(value ? { value } : {}) });
      } else if (isRelationship) {
        if (sh.max !== '1') continue; // Many-valued links are kept in the object's tabs.
        const isParent = parent?.property === sh.path;
        if (isParent && mode === 'edit') continue; // An object does not move between the objects it belongs to.
        // A link is named by the type it reaches, such as Protocol, unless it reaches several, such as a program or an opportunity.
        const targets = this.targetsOf(sh.ps);
        const targetLabel = targets.length === 1 ? this.q(`SELECT ?l WHERE { <${targets[0]}> rdfs:label ?l }`)[0]?.l : undefined;
        fields.push({ ...base, ...(targetLabel ? { label: targetLabel } : {}), kind: 'object', required: isParent || titled.has(sh.path), choices: objectChoices(targets), ...(value ? { value } : {}) });
      } else if (sh.dt && sh.max === '1') {
        // A name the title shows is one line; other text may run longer.
        const kind = sh.dt === `${NS.xsd}decimal` || sh.dt === `${NS.xsd}integer` ? 'number' : sh.dt === `${NS.xsd}date` ? 'date' : sh.dt === `${NS.xsd}anyURI` ? 'url' : titled.has(sh.path) ? 'line' : 'text';
        fields.push({ ...base, kind, required: titled.has(sh.path), ...(value ? { value } : {}) });
      }
    }
    // Required first: the parent, then the title's properties and the classifying states, then the rest, each in shape order.
    const rank = (f: FormField) => (f.property === parent?.property ? 0 : f.required ? 1 : 2);
    return fields.map((f, i) => ({ f, i })).sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i).map(({ f }) => f);
  }

  /** Checks a form's values against its fields: required ones given, numbers and dates well formed, choices allowed. */
  private checkForm(fields: FormField[], values: Record<string, string>, editing: boolean): Map<FormField, Term | undefined> {
    const problems: string[] = [];
    const resolved = new Map<FormField, Term | undefined>();
    for (const name of Object.keys(values)) if (!fields.some((f) => f.name === name)) problems.push(`Unknown field ${name}`);
    for (const f of fields) {
      if (!(f.name in values) && editing) continue; // Not given: left as it is.
      const raw = (values[f.name] ?? '').trim();
      if (!raw) {
        if (f.required) problems.push(`${f.label} is required`);
        else resolved.set(f, undefined);
        continue;
      }
      const dt = this.q(`SELECT ?dt WHERE { ?ps sh:path <${f.property}> ; sh:datatype ?dt } LIMIT 1`)[0]?.dt;
      const problem =
        f.kind === 'number' && !/^-?\d+(\.\d+)?$/.test(raw) ? `${f.label} must be a number`
        : f.kind === 'number' && dt === `${NS.xsd}integer` && !/^-?\d+$/.test(raw) ? `${f.label} must be a whole number`
        : f.kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${f.label} must be a date`
        : f.kind === 'url' && !URL.canParse(raw) ? `${f.label} must be a web address`
        : (f.kind === 'choice' || f.kind === 'object') && !f.choices?.some((c) => c.value === raw) ? `${f.label} is not one of the allowed choices`
        : undefined;
      if (problem) {
        problems.push(problem);
        continue;
      }
      resolved.set(f, f.kind === 'choice' || f.kind === 'object' ? namedNode(raw) : literal(raw, namedNode(dt ?? `${NS.xsd}string`)));
    }
    if (problems.length) throw new GatewayError(400, problems);
    return resolved;
  }

  /** The form to create an object of a type, inside a parent when given (spec 5.3). */
  createForm(principal: Principal, type: string, parentId?: string): ObjectForm {
    this.authorize(principal);
    if (!ask(this.graph.store, `ASK { <${type}> a p:ObjectType }`)) throw new GatewayError(404, ['No such type']);
    if (ask(this.graph.store, `ASK { <${type}> p:onlyThroughMethods true }`)) throw new GatewayError(400, ['Objects of this type come only through the methods that create them']);
    if (!this.mayCreate(principal, type)) throw new GatewayError(403, ['Your role cannot create objects of this type']);
    const parent = parentId ? this.resolve(parentId) : undefined;
    let fields = this.formFields(principal, type, 'create');
    if (parent) {
      const link = this.parentLinkFor(type, parent);
      // Inside a parent, the field that names it is given already; a parent on its own side links to the new object.
      fields = fields.filter((f) => f.property !== link.property);
    }
    const typeLabel = this.q(`SELECT ?l WHERE { <${type}> rdfs:label ?l }`)[0].l;
    const startingPoints = this.startingPoints(principal, type);
    return { mode: 'create', type, typeLabel, fields, ...(parent ? { parent: this.summary(parent) } : {}), ...(startingPoints.length ? { startingPoints } : {}) };
  }

  /** The beginnings the platform implements (spec 3.3, Starting points). Only the create form so far. */
  private static readonly BEGINNINGS = new Set([`${NS.p}BeginWithForm`]);

  /**
   * Starting points (spec 3.3): the ways an approved skill names to begin creating a type, for a role that may create it,
   * in order, each available when the platform implements its beginning, or else with why not.
   */
  private startingPoints(principal: Principal, type: string): StartingPointView[] {
    const today = this.now().toISOString().slice(0, 10);
    return this.q(`SELECT ?skill ?skillLabel ?sp ?label ?description ?begins ?beginsLabel ?why WHERE {
        ?skill a p:Skill ; p:serves p:Create ; p:forType <${type}> ; rdfs:label ?skillLabel ; p:approvedOn ?approved ; p:startingPoint ?sp .
        FILTER(STR(?approved) <= "${today}")
        FILTER(NOT EXISTS { ?skill p:usableBy ?r } || EXISTS { ?skill p:usableBy <${principal.role}> })
        ?sp rdfs:label ?label ; rdfs:comment ?description ; p:begins ?begins ; p:order ?order . ?begins rdfs:label ?beginsLabel .
        OPTIONAL { ?begins p:notYetBecause ?why } } ORDER BY ?skillLabel ?order`).map((r) => {
      const available = Gateway.BEGINNINGS.has(r.begins);
      return {
        startingPoint: r.sp,
        label: r.label,
        description: r.description,
        begins: r.begins,
        beginsLabel: r.beginsLabel,
        available,
        ...(available ? {} : { notYet: r.why ?? 'The platform cannot begin this way yet.' }),
        skill: r.skill,
        skillLabel: r.skillLabel,
      };
    });
  }

  /** How a new object of a type belongs to a parent: its own link to the parent, or the parent's link to it. */
  private parentLinkFor(type: string, parent: string): { property: string; fromParent: boolean } {
    const parentType = this.typeOf(parent).type;
    const own = this.q(`SELECT ?rel WHERE { ?shape (sh:targetClass|p:describes) <${type}> ; sh:property ?ps . ?ps sh:path ?rel . ?rel p:partOf true .
        { ?ps sh:class <${parentType}> } UNION { ?ps sh:or/rdf:rest*/rdf:first/sh:class <${parentType}> } }`)[0];
    if (own) return { property: own.rel, fromParent: false };
    const theirs = this.q(`SELECT ?rel WHERE { ?shape (sh:targetClass|p:describes) <${parentType}> ; sh:property ?ps . ?ps sh:path ?rel . ?rel p:hasPart true .
        { ?ps sh:class <${type}> } UNION { ?ps sh:or/rdf:rest*/rdf:first/sh:class <${type}> } }`)[0];
    if (theirs) return { property: theirs.rel, fromParent: true };
    throw new GatewayError(400, ['A new object of this type cannot be created inside that object']);
  }

  /** Plans a create on a working copy: the new object, its lifecycles at their first values, and the values given. */
  private async planCreate(principal: Principal, type: string, values: Record<string, string>, parentId?: string) {
    const form = this.createForm(principal, type, parentId);
    const resolved = this.checkForm(form.fields, values, false);
    const work: Graph = { store: this.workingCopy(), dataset: this.graph.dataset };
    const changes: Change[] = [];
    const created = this.mint(work, type, changes);
    for (const { d, first } of this.q(`SELECT ?d ?first WHERE { ?d p:dimensionOf <${type}> ; p:valuesFrom ?s . ?first skos:inScheme ?s ; p:order 1
        FILTER NOT EXISTS { ?d p:chosenOnCreate true } FILTER NOT EXISTS { ?d p:startsEmpty true } }`)) this.set(work, created, d, namedNode(first), changes, false);
    for (const [f, v] of resolved) if (v) this.set(work, created, f.property, v, changes, false);
    if (form.parent) {
      const link = this.parentLinkFor(type, form.parent.iri);
      if (link.fromParent) this.set(work, form.parent.iri, link.property, namedNode(created), changes, false);
      else this.set(work, created, link.property, namedNode(form.parent.iri), changes, false);
    }
    work.dataset = defaultGraphDataset(work.store);
    const problems = await validateData(work);
    if (problems.length) throw new GatewayError(400, problems);
    return { work, changes, created };
  }

  /** Why an object cannot be edited now: no permission, a type that comes only through methods, or a rule that freezes it. */
  async editBlocks(principal: Principal, idOrIri: string): Promise<string[]> {
    this.authorize(principal);
    const object = this.resolve(idOrIri);
    const { type } = this.typeOf(object);
    if (!this.canRead(principal, type)) return ['Your role cannot read this object'];
    if (ask(this.graph.store, `ASK { <${type}> p:onlyThroughMethods true }`)) return ['Objects of this type change only through their methods'];
    if (!ask(this.graph.store, `ASK { <${principal.role}> p:mayEdit <${type}> }`)) return ['Your role cannot edit objects of this type'];
    const blocks: string[] = [];
    const validator = validatorFor(this.graph);
    for (const { shape, rule, label } of this.q(`SELECT ?shape ?rule ?label WHERE { ?r p:freezes ?shape ; rdfs:label ?rule . OPTIONAL { ?shape rdfs:label ?label } }`)) {
      if (!(await conformanceProblems(this.graph, object, [shape], validator)).length) blocks.push(`${label ?? 'This record'} cannot be edited (${rule}): correct it with a new linked record`);
    }
    return blocks;
  }

  /** The form to edit an object, with its current values (spec 5.3). */
  async editForm(principal: Principal, idOrIri: string): Promise<ObjectForm> {
    const blocks = await this.editBlocks(principal, idOrIri);
    if (blocks.length) throw new GatewayError(403, blocks);
    const object = this.resolve(idOrIri);
    const summary = this.summary(object);
    return { mode: 'edit', type: summary.type, typeLabel: summary.typeLabel, object: summary, fields: this.formFields(principal, summary.type, 'edit', object) };
  }

  private async planEdit(principal: Principal, idOrIri: string, values: Record<string, string>) {
    const form = await this.editForm(principal, idOrIri);
    const object = form.object!.iri;
    const resolved = this.checkForm(form.fields, values, true);
    const work: Graph = { store: this.workingCopy(), dataset: this.graph.dataset };
    const changes: Change[] = [];
    for (const [f, v] of resolved) {
      if ((f.value ?? '') === (v?.value ?? '')) continue;
      this.set(work, object, f.property, v, changes);
    }
    if (!changes.length) throw new GatewayError(400, ['Nothing has changed']);
    work.dataset = defaultGraphDataset(work.store);
    const problems = await validateData(work);
    if (problems.length) throw new GatewayError(400, problems);
    return { work, changes, object };
  }

  async previewCreate(principal: Principal, type: string, values: Record<string, string>, parentId?: string): Promise<Omit<CommitResult, 'commit'>> {
    const { work, changes, created } = await this.planCreate(principal, type, values, parentId);
    return { changes: changes.map((c) => this.changeView(c, work)), created: [created], pending: [], pendingDescriptions: [], background: [] };
  }

  async previewEdit(principal: Principal, idOrIri: string, values: Record<string, string>): Promise<Omit<CommitResult, 'commit'>> {
    const { work, changes } = await this.planEdit(principal, idOrIri, values);
    return { changes: changes.map((c) => this.changeView(c, work)), created: [], pending: [], pendingDescriptions: [], background: [] };
  }

  /** Creates an object, as a commit by the platform method Create (spec 5.3). */
  create(principal: Principal, type: string, values: Record<string, string>, parentId?: string): Promise<CommitResult> {
    return this.enqueue(async () => {
      this.authorize(principal);
      const { work, changes, created } = await this.planCreate(principal, type, values, parentId);
      return this.commitPlanned(principal, created, `${NS.p}Create`, work, changes, [created]);
    });
  }

  /** Edits an object, as a commit by the platform method Edit (spec 5.3). */
  edit(principal: Principal, idOrIri: string, values: Record<string, string>): Promise<CommitResult> {
    return this.enqueue(async () => {
      this.authorize(principal);
      const { work, changes, object } = await this.planEdit(principal, idOrIri, values);
      return this.commitPlanned(principal, object, `${NS.p}Edit`, work, changes, []);
    });
  }

  /** Records a planned, validated change as a commit: journal first, then the live graph (spec 3.4, steps 6 and 7). */
  private commitPlanned(principal: Principal, object: string, method: string, work: Graph, changes: Change[], created: string[]): CommitResult {
    const at = this.now();
    const commit = `${this.dataNamespace}commit/${this.commitCount + 1}`;
    const record = this.record(commit, principal, object, method, new Map(), changes, created, [], at);
    const removed = changes.filter((c) => c.oldValue).map((c) => quad(namedNode(c.subject), namedNode(c.property), c.oldValue!, defaultGraph()));
    const added = [...changes.filter((c) => c.newValue).map((c) => quad(namedNode(c.subject), namedNode(c.property), c.newValue!, defaultGraph())), ...record];
    this.options.journal?.append('commit', at, removed, added);
    for (const q of removed) this.graph.store.delete(q);
    for (const q of added) this.graph.store.add(q);
    this.graph.dataset = work.dataset;
    this.commitCount++;
    return { commit, changes: changes.map((c) => this.changeView(c, work)), created, pending: [], pendingDescriptions: [], background: [] };
  }

  // ---------------------------------------------------------------- acting on a set (spec 5.4)

  /** Why a set of objects does not qualify for a set method: empty when it does. */
  private async setBlocks(principal: Principal, objects: string[], method: string): Promise<string[]> {
    const m = this.q(`SELECT ?type ?min ?max ?same WHERE { <${method}> a p:Method ; p:onSet true ; p:appliesTo ?type .
        OPTIONAL { <${method}> p:minObjects ?min } OPTIONAL { <${method}> p:maxObjects ?max } OPTIONAL { <${method}> p:sameAlong ?same } }`)[0];
    if (!m) return ['This method does not act on a set'];
    const blocks: string[] = [];
    if (!ask(this.graph.store, `ASK { <${principal.role}> p:mayRun <${method}> }`)) blocks.push('Your role cannot run this method');
    if (new Set(objects).size !== objects.length) blocks.push('An object is chosen twice');
    if (m.min && objects.length < Number(m.min)) blocks.push(`Choose at least ${m.min}`);
    if (m.max && objects.length > Number(m.max)) blocks.push(`Choose at most ${m.max}`);
    for (const o of objects) {
      if (!ask(this.graph.store, `ASK { <${o}> a <${m.type}> }`)) blocks.push(`${this.summary(o).identifier} is not the right kind of object`);
      else if (!this.canRead(principal, m.type)) blocks.push('Your role cannot read these objects');
    }
    if (m.same) {
      const values = new Set(objects.map((o) => this.q(`SELECT ?v WHERE { <${o}> <${m.same}> ?v }`)[0]?.v ?? ''));
      if (values.size !== 1 || values.has('')) blocks.push(`They do not share the same ${this.q(`SELECT ?l WHERE { <${m.same}> rdfs:label ?l }`)[0]?.l ?? 'parent'}`);
    }
    const preconditions = this.q(`SELECT ?pre WHERE { <${method}> p:precondition ?pre }`).map((r) => r.pre);
    if (!blocks.length) {
      const validator = validatorFor(this.graph);
      for (const o of objects) blocks.push(...(await conformanceProblems(this.graph, o, preconditions, validator)).map((b) => `${this.summary(o).identifier}: ${b}`));
    }
    return [...new Set(blocks)];
  }

  /** The set methods a selection qualifies for (spec 5.4, Acting on a set). */
  async setMethods(principal: Principal, ids: string[]): Promise<SetMethodOption[]> {
    this.authorize(principal);
    const objects = ids.map((id) => this.resolve(id));
    if (objects.length < 2) return [];
    const types = new Set(objects.map((o) => this.typeOf(o).type));
    if (types.size !== 1) return [];
    const options: SetMethodOption[] = [];
    for (const { method, label } of this.q(`SELECT ?method ?label WHERE { ?method a p:Method ; p:onSet true ; p:appliesTo <${[...types][0]}> ; rdfs:label ?label } ORDER BY ?label`)) {
      if (!(await this.setBlocks(principal, objects, method)).length) options.push({ method, label, archetype: archetypeOf(this.graph.store, method) });
    }
    return options;
  }

  /** Compose a set method: its inputs, the input that chooses among the set offering the set, and its comparison. */
  async composeSet(principal: Principal, ids: string[], method: string): Promise<MethodComposition> {
    this.authorize(principal);
    const objects = ids.map((id) => this.resolve(id));
    const blocks = await this.setBlocks(principal, objects, method);
    if (blocks.length) throw new GatewayError(400, blocks);
    const label = this.q(`SELECT ?l WHERE { <${method}> rdfs:label ?l }`)[0].l;
    const commitLabel = this.q(`SELECT ?c WHERE { <${method}> p:commitLabel ?c }`)[0]?.c;
    const summaries = objects.map((o) => this.summary(o));
    const among = new Set(this.q(`SELECT ?name WHERE { <${method}> p:input ?i . ?i p:amongSet true ; p:inputName ?name }`).map((r) => r.name));
    const inputs: ComposedInput[] = this.inputs(method).map((input) => {
      const base = { name: input.name, label: input.label, ...(input.perObject === 'true' ? { perObject: true } : {}) };
      if (among.has(input.name)) return { ...base, kind: 'object', choices: summaries.map((o) => ({ value: o.iri, label: `${o.identifier} · ${o.title}` })) };
      if (input.datatype === `${NS.xsd}anyURI`) return { ...base, kind: 'url' };
      if (input.datatype === `${NS.xsd}decimal` || input.datatype === `${NS.xsd}integer`) return { ...base, kind: 'number' };
      return { ...base, kind: 'text' };
    });
    if (this.inputs(method).some((i) => !among.has(i.name) && !i.datatype)) throw new GatewayError(400, ['A set method takes only the choice among its set and plain values for now']);
    return {
      method,
      label,
      archetype: archetypeOf(this.graph.store, method),
      object: summaries[0],
      objects: summaries,
      inputs,
      ...(commitLabel ? { commitLabel } : {}),
      ...(this.comparison(method, objects) ?? {}),
      ...this.skillsOffered(principal, method),
    };
  }

  /** A set method's comparison: for each declared row key, each object's row object, its title and status (spec 5.4). */
  private comparison(method: string, objects: string[]): { comparison: ComparisonView } | undefined {
    const c = this.q(`SELECT ?path ?key ?when ?status WHERE { <${method}> p:comparison ?c . ?c p:rowPath ?path ; p:rowKey ?key .
        OPTIONAL { ?c p:rowWhen ?when } OPTIONAL { ?c p:rowStatus ?status } }`)[0];
    if (!c) return undefined;
    const keys = this.q(`SELECT ?k ?label ?order WHERE { <${c.key}> p:valuesFrom ?s . ?k skos:inScheme ?s ; skos:prefLabel ?label ; p:order ?order } ORDER BY ?order`);
    const byObject = objects.map((o) => {
      const rows = this.q(`SELECT ?row ?key ?status ?statusLabel ?urgency WHERE { <${o}> ${c.path} ?row . ?row <${c.key}> ?key .
          ${c.when ? `?row ?whenDim <${c.when}> .` : ''}
          ${c.status ? `OPTIONAL { ?row <${c.status}> ?status . ?status skos:prefLabel ?statusLabel OPTIONAL { ?status p:urgency ?urgency } }` : ''} }`);
      return new Map(rows.map((r) => [r.key, r]));
    });
    const statusLabel = c.status ? this.q(`SELECT ?l WHERE { <${c.status}> rdfs:label ?l }`)[0]?.l : undefined;
    const rows = keys
      .filter((k) => byObject.some((m) => m.has(k.k)))
      .map((k) => ({
        key: k.k,
        label: k.label[0].toUpperCase() + k.label.slice(1),
        cells: byObject.map((m) => {
          const r = m.get(k.k);
          if (!r) return null;
          const s = this.summary(r.row);
          return { identifier: s.identifier, title: s.title, ...(r.statusLabel ? { status: `${statusLabel}: ${r.statusLabel}` } : {}), ...(Number(r.urgency ?? 0) > 0 ? { urgent: true } : {}) };
        }),
      }));
    return { comparison: { rows } };
  }

  /** The chosen object and the others of a set, from the input that chooses among the set. */
  private async setPlan(principal: Principal, ids: string[], method: string, inputs: Record<string, string>) {
    const objects = ids.map((id) => this.resolve(id));
    const blocks = await this.setBlocks(principal, objects, method);
    if (blocks.length) throw new GatewayError(400, blocks);
    const among = this.q(`SELECT ?name ?label WHERE { <${method}> p:input ?i . ?i p:amongSet true ; p:inputName ?name ; rdfs:label ?label }`)[0];
    if (!among) throw new GatewayError(400, ['This set method chooses none of the set']);
    const raw = inputs[among.name];
    if (!raw) throw new GatewayError(400, [`${among.label} is required`]);
    const chosen = this.tryResolve(raw);
    if (!objects.includes(chosen)) throw new GatewayError(400, [`${among.label} must be one of the set`]);
    return { chosen, others: objects.filter((o) => o !== chosen), inputs: { ...inputs, [among.name]: chosen } };
  }

  /** Preview a set method: its effects on the chosen object and on the others (spec 5.4, Acting on a set). */
  async previewSet(principal: Principal, ids: string[], method: string, inputs: Record<string, string> = {}): Promise<Omit<CommitResult, 'commit'>> {
    this.authorize(principal);
    const set = await this.setPlan(principal, ids, method, inputs);
    const { changes, created, pending, work } = await this.plan(principal, set.chosen, method, set.inputs, undefined, set.others);
    return { changes: changes.map((c) => this.changeView(c, work)), created, pending, pendingDescriptions: this.describe_(pending), background: analysisDescriptions(this.graph.store, method) };
  }

  /** Commit a set method once, on the chosen object, with the others named in the same commit (spec 5.4, Acting on a set). */
  commitSet(principal: Principal, ids: string[], method: string, inputs: Record<string, string> = {}, proposal?: string): Promise<CommitResult> {
    return this.enqueue(async () => {
      this.authorize(principal);
      const set = await this.setPlan(principal, ids, method, inputs);
      return this.runCommit(principal, set.chosen, method, set.inputs, undefined, undefined, set.others, proposal);
    });
  }

  /**
   * Commit steps 1 to 5 (spec 3.4) on a working copy: role, inputs, preconditions, effects and validation.
   * Throws with the reasons at the first failure. Nothing reaches the live graph.
   */
  private async plan(principal: Principal, idOrIri: string, method: string, inputs: Record<string, string>, draftText?: string, others: string[] = []) {
    this.authorize(principal);
    const object = this.resolve(idOrIri);
    const { type } = this.typeOf(object);
    if (!ask(this.graph.store, `ASK { <${method}> a p:Method ; p:appliesTo <${type}> }`)) throw new GatewayError(400, ['This method does not apply to this object']);
    // A set method runs only on a set, through the set requests (spec 5.4, Acting on a set).
    if (!others.length && ask(this.graph.store, `ASK { <${method}> p:onSet true }`)) throw new GatewayError(400, ['This method acts on a set of objects chosen together']);

    // A background method no worker can do is refused before anything else (spec 3.4, Background runs).
    const noWorker = backgroundBlocks(this.graph.store, method);
    if (noWorker.length) throw new GatewayError(400, noWorker);
    // Accepting a draft needs no model: the text is already written. A method that can never be drafted is refused.
    const noDraft = this.draftBlocks(method, false);
    if (noDraft.length) throw new GatewayError(400, noDraft);

    // 1. The role may run the method.
    if (!ask(this.graph.store, `ASK { <${principal.role}> p:mayRun <${method}> }`)) throw new GatewayError(403, ['Your role cannot run this method']);
    const notOwner = this.ownerBlocks(principal, object, method);
    if (notOwner.length) throw new GatewayError(403, notOwner);

    // 2. Every input is present, of the right kind, and meets its constraints.
    const resolvedInputs = await this.checkInputs(principal, object, method, inputs);

    // 3. The object meets every precondition.
    const preconditions = this.q(`SELECT ?pre WHERE { <${method}> p:precondition ?pre }`).map((r) => r.pre);
    const blocks = await conformanceProblems(this.graph, object, preconditions);
    if (blocks.length) throw new GatewayError(400, blocks);

    // 4. Apply the declared effects, to a working copy that readers never see.
    // Only the current state is copied; commit and audit records live in named graphs, which grow with history.
    const work: Graph = { store: this.workingCopy(), dataset: this.graph.dataset };
    const at = this.now();
    const changes: Change[] = [];
    const created: string[] = [];
    const pending: string[] = [];
    for (const effect of this.q(`SELECT ?e ?kind WHERE { <${method}> p:effect ?e . ?e a ?kind FILTER(STRSTARTS(STR(?kind), "${NS.p}")) } ORDER BY ?e`)) {
      const kind = effect.kind.slice(NS.p.length);
      if (kind === 'StateChange' && ask(this.graph.store, `ASK { <${effect.e}> p:onOthers true }`)) {
        for (const other of others) this.applyStateChange(work, other, effect.e, resolvedInputs, changes);
      } else if (kind === 'StateChange') this.applyStateChange(work, object, effect.e, resolvedInputs, changes);
      else if (kind === 'Creation') created.push(this.applyCreation(work, object, effect.e, resolvedInputs, principal, at, changes));
      else if (kind === 'Link') this.applyLink(work, object, effect.e, resolvedInputs, changes);
      else if (kind === 'DescribedEffect') pending.push(effect.e);
      else if (kind === 'ApplyStructureChange') this.applyStructure(work, object, changes);
      else if (kind === 'RollBackStructureChange') this.rollBackStructure(work, object, changes);
      else if (kind === 'Drafting') {
        if (draftText === undefined) throw new GatewayError(400, ['This method needs a draft. Ask for one, then accept it.']);
        this.set(work, object, this.draftingOf(method)!.property, literal(draftText), changes);
      }
    }

    // Inputs recorded as properties: on the objects the method created, or else on the object itself.
    for (const { input, property } of this.q(`SELECT ?input ?property WHERE { <${method}> p:input ?input . ?input p:recordedAs ?property }`)) {
      const value = resolvedInputs.get(input);
      if (!value) continue;
      for (const target of created.length ? created : [object]) this.set(work, target, property, value, changes);
    }

    // 5. Validate the changed copy against every shape. Any violation discards it. A change to the structure brings its
    // own shapes, so it is validated against them; any other commit, against the shapes compiled once.
    work.dataset = defaultGraphDataset(work.store);
    const problems = await validateData(work, this.changesStructure(method) ? undefined : this.shapesValidator());
    if (problems.length) {
      freeStore(work.store);
      throw new GatewayError(400, problems);
    }

    return { object, method, resolvedInputs, work, at, changes, created, pending };
  }

  /** Preview a method (spec 3.4): what a commit would change, without saving anything. */
  async preview(principal: Principal, idOrIri: string, method: string, inputs: Record<string, string> = {}): Promise<Omit<CommitResult, 'commit'>> {
    const { object, changes, created, pending, work } = await this.plan(principal, idOrIri, method, inputs);
    // Deciding on a change set shows its impact (spec 3.7): of applying it, or for Roll back, of undoing it.
    const decidesChangeSet = ask(this.graph.store, `ASK { <${object}> a p:ChangeSet FILTER NOT EXISTS { <${method}> p:effect/a p:Creation } }`);
    const rollsBack = ask(this.graph.store, `ASK { <${method}> p:effect/a p:RollBackStructureChange }`);
    const result = {
      changes: this.shownChanges(method, changes, work).map((c) => this.changeView(c, work)),
      created,
      pending,
      pendingDescriptions: this.describe_(pending),
      background: analysisDescriptions(this.graph.store, method),
      ...(decidesChangeSet ? { impact: await this.structureImpact(object, rollsBack ? 'rollBack' : 'apply') } : {}),
    };
    freeStore(work.store);
    return result;
  }

  private async runCommit(principal: Principal, idOrIri: string, method: string, inputs: Record<string, string>, given?: SignatureGiven, draftGiven?: DraftGiven, others: string[] = [], proposalGiven?: string): Promise<CommitResult> {
    const accepted = draftGiven ? this.checkDraft(principal, this.resolve(idOrIri), method, draftGiven) : undefined;
    const { object, resolvedInputs, work, at, changes, created, pending } = await this.plan(principal, idOrIri, method, inputs, accepted?.text, others);
    const signature = this.checkSignature(principal, method, given);
    const fromProposal = proposalGiven ? this.proposalOutcome(proposalGiven, method, [object, ...others], resolvedInputs) : undefined;

    // 6. Record the commit: journal first, flushed to disk, then the live graph.
    const commit = `${this.dataNamespace}commit/${this.commitCount + 1}`;
    const record = this.record(commit, principal, object, method, resolvedInputs, changes, created, pending, at, signature);
    // A set method's commit names the set's other objects (spec 5.4, Acting on a set).
    for (const other of others) record.push(quad(namedNode(commit), namedNode(`${NS.p}alongWith`), namedNode(other), namedNode(commit)));
    const removed = changes.filter((c) => c.oldValue).map((c) => quad(namedNode(c.subject), namedNode(c.property), c.oldValue!, defaultGraph()));
    const added = [...changes.filter((c) => c.newValue).map((c) => quad(namedNode(c.subject), namedNode(c.property), c.newValue!, defaultGraph())), ...record];
    // A background method's commit also starts its run, in the same entry (spec 3.4, Background runs).
    const run = analysisOf(this.graph.store, method) ? `${this.dataNamespace}run/${this.runCount + 1}` : undefined;
    if (run) added.push(...this.runRecord(run, principal, object, method, commit, at));
    // Accepting a draft: the commit names it and says whether it was edited, and the draft is decided, in the same entry.
    if (accepted) {
      const g = namedNode(commit);
      added.push(
        quad(g, namedNode(`${NS.p}fromDraft`), namedNode(accepted.draft), g),
        quad(g, namedNode(`${NS.p}editedDraft`), literal(String(accepted.edited), namedNode(`${NS.xsd}boolean`)), g),
      );
      const decided = this.decideDraft(accepted.draft, principal, 'accepted', at);
      removed.push(...decided.removed);
      added.push(...decided.added);
    }
    // Starting from a proposal: the commit names it and, for each proposed input, whether the value was kept or changed.
    if (fromProposal) {
      const g = namedNode(commit);
      added.push(quad(g, namedNode(`${NS.p}fromProposal`), namedNode(fromProposal.proposal), g));
      for (const i of fromProposal.keptInputs) added.push(quad(g, namedNode(`${NS.p}keptInput`), namedNode(i), g));
      for (const i of fromProposal.changedInputs) added.push(quad(g, namedNode(`${NS.p}changedInput`), namedNode(i), g));
      if (fromProposal.followedRecommendation !== undefined) {
        added.push(quad(g, namedNode(`${NS.p}followedRecommendation`), literal(String(fromProposal.followedRecommendation), namedNode(`${NS.xsd}boolean`)), g));
      }
    }
    this.options.journal?.append('commit', at, removed, added);
    for (const q of removed) this.graph.store.delete(q);
    for (const q of added) this.graph.store.add(q);
    // The working copy's default graph is now exactly the live one, so its validated dataset is reused.
    this.graph.dataset = work.dataset;
    // A change to the structure changes what is derived from it (spec 3.7): from the next request on, views use the new structure.
    if (this.changesStructure(method)) {
      this.endsCache.clear();
      this.compiledShapes = undefined;
    }
    this.commitCount++;
    if (run) {
      this.runCount++;
      void this.enqueue(() => this.work(run));
    }

    const changeViews = this.shownChanges(method, changes, work).map((c) => this.changeView(c, work));
    freeStore(work.store);
    return {
      commit,
      changes: changeViews,
      created,
      pending,
      pendingDescriptions: this.describe_(pending),
      ...(signature ? { signature: { signerName: signature.signerName, signedAt: at.toISOString(), meaning: signature.meaning, development: signature.development } } : {}),
      background: analysisDescriptions(this.graph.store, method),
      ...(run ? { run: this.runView(run) } : {}),
      ...(accepted ? { fromDraft: { draft: accepted.draft, model: accepted.model, edited: accepted.edited } } : {}),
      ...(fromProposal
        ? {
            fromProposal: {
              proposal: fromProposal.proposal,
              kept: fromProposal.kept,
              changed: fromProposal.changed,
              ...(fromProposal.followedRecommendation !== undefined ? { followedRecommendation: fromProposal.followedRecommendation } : {}),
            },
          }
        : {}),
    };
  }

  // ---------------------------------------------------------------- structure evolution (spec 3.7)

  /**
   * The structure's own objects (spec 3.7) are the ontology's resources, so they carry no identifier in the files. Each is
   * identified by its local name, such as StudyScenario; where two share one, by its namespace's prefix as well.
   */
  private identifyStructure(): void {
    const rows = this.q(`SELECT DISTINCT ?r WHERE { ?t a p:ObjectType ; p:inDomain p:Structure . ?r a ?t FILTER(isIRI(?r)) FILTER NOT EXISTS { ?r ls:identifier ?i } }`);
    if (!rows.length) return;
    const local = (iri: string) => iri.slice(Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/')) + 1);
    const taken = new Set(this.q(`SELECT ?i WHERE { ?r ls:identifier ?i }`).map((r) => r.i));
    const byLocal = new Map<string, string[]>();
    for (const { r } of rows) byLocal.set(local(r), [...(byLocal.get(local(r)) ?? []), r]);
    const prefixOf = (iri: string) => Object.entries(NS).find(([, ns]) => iri.startsWith(ns) && !iri.slice(ns.length).includes('/'))?.[0] ?? 'x';
    for (const [name, iris] of byLocal) {
      for (const iri of iris) {
        const identifier = iris.length > 1 || taken.has(name) ? `${prefixOf(iri)}:${name}` : name;
        this.graph.store.add(quad(namedNode(iri), namedNode(`${NS.ls}identifier`), literal(identifier), defaultGraph()));
      }
    }
    this.graph.dataset = defaultGraphDataset(this.graph.store);
  }

  /** The operations of a change set, in the order they were added. */
  private operationsOf(changeSet: string, graph: Graph = this.graph) {
    return this.q(`SELECT ?op ?id ?kind ?set ?value ?label ?replacement ?created WHERE { ?op p:operationOf <${changeSet}> ; ls:identifier ?id ; p:operationKind ?kind .
        OPTIONAL { ?op p:onValueSet ?set } OPTIONAL { ?op p:onValue ?value } OPTIONAL { ?op p:newLabel ?label } OPTIONAL { ?op p:replacement ?replacement }
        OPTIONAL { ?op p:createdValue ?created } }`, graph).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  }

  /** The value sets a change set touches: those it adds to, and those of the values it changes. */
  private valueSetsTouched(changeSet: string): string[] {
    return [...new Set(this.operationsOf(changeSet).flatMap((op) => (op.set ? [op.set] : this.q(`SELECT ?s WHERE { <${op.value}> skos:inScheme ?s }`).map((r) => r.s))))];
  }

  /**
   * Who owns a value set (spec 3.7, Owners approve): the roles that create or edit the types whose state dimensions take
   * their values from it; the Structure Steward when no role does.
   */
  private ownersOf(valueSet: string): string[] {
    const roles = this.q(`SELECT DISTINCT ?role WHERE { ?d p:valuesFrom <${valueSet}> ; p:dimensionOf ?t . { ?role p:mayEdit ?t } UNION { ?role p:mayCreate ?t } } ORDER BY ?role`).map((r) => r.role);
    return roles.length ? roles : [`${NS.p}StructureSteward`];
  }

  /** The person who drafted a change set: who created it. */
  private drafterOf(changeSet: string): string | undefined {
    return this.q(`SELECT ?who WHERE { GRAPH ?c { ?c p:target <${changeSet}> ; p:method p:Create ; prov:wasAssociatedWith ?who } }`)[0]?.who;
  }

  /** Why the principal may not approve or reject this change set (spec 3.7): only an owner of every part, never its drafter alone, never an agent. */
  private ownerBlocks(principal: Principal, object: string, method: string): string[] {
    if (!ask(this.graph.store, `ASK { <${method}> p:approvedByOwners true }`)) return [];
    if (ask(this.graph.store, `ASK { <${principal.person}> p:isAgent true }`)) return ['Agents never approve or reject a change to the structure'];
    if (this.drafterOf(object) === principal.person) return ['You drafted this change set, so someone else must decide on it'];
    const label = (iri: string) => this.q(`SELECT ?l WHERE { { <${iri}> skos:prefLabel ?l } UNION { <${iri}> rdfs:label ?l } } LIMIT 1`)[0]?.l ?? iri;
    const blocks: string[] = [];
    for (const set of this.valueSetsTouched(object)) {
      const owners = this.ownersOf(set);
      if (!owners.includes(principal.role)) blocks.push(`Only an owner of ${label(set)} may decide on this: ${owners.map(label).join(' or ')}`);
    }
    return blocks;
  }

  /** Statements added and removed one by one, recorded as changes, for structure that holds several values. */
  private addStatement(work: Graph, s: string, p: string, o: Term, changes: Change[]) {
    const q = quad(namedNode(s), namedNode(p), o as oxigraph.Quad['object'], defaultGraph());
    if (work.store.has(q)) return;
    work.store.add(q);
    changes.push({ subject: s, property: p, newValue: o });
  }

  private removeStatement(work: Graph, s: string, p: string, o: Term, changes: Change[]) {
    const q = quad(namedNode(s), namedNode(p), o as oxigraph.Quad['object'], defaultGraph());
    if (!work.store.has(q)) return;
    work.store.delete(q);
    changes.push({ subject: s, property: p, oldValue: o });
  }

  /**
   * Apply structure change (spec 3.4, Structure changes): carries out a change set's operations on the working copy, with
   * their migration, moves each ontology they touch to its next version, and records the Turtle patch on the change set.
   */
  private applyStructure(work: Graph, changeSet: string, changes: Change[]) {
    const first = changes.length;
    const q = (query: string) => this.q(query, work);
    const local = (iri: string) => iri.slice(Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/')) + 1);
    let level: 'patch' | 'minor' = 'patch';
    for (const op of this.operationsOf(changeSet, work)) {
      const kind = op.kind.slice(`${NS.p}OperationKind-`.length);
      if (kind === 'addValue') {
        level = 'minor';
        const words = op.label.trim().split(/[^A-Za-z0-9]+/).filter(Boolean);
        const camel = words.map((w: string, i: number) => (i ? w[0].toUpperCase() + w.slice(1) : w.toLowerCase())).join('') || 'value';
        let value = `${op.set}-${camel}`;
        for (let n = 2; ask(work.store, `ASK { <${value}> ?p ?o }`); n++) value = `${op.set}-${camel}${n}`;
        const members = q(`SELECT ?v ?order WHERE { ?v skos:inScheme <${op.set}> OPTIONAL { ?v p:order ?order } }`);
        const order = Math.max(0, ...members.map((m) => Number(m.order ?? 0))) + 1;
        let identifier = local(value);
        if (ask(work.store, `ASK { ?x ls:identifier "${identifier}" }`)) identifier = `${changeSet.split('/').pop()}:${identifier}`;
        this.addStatement(work, value, RDF_TYPE, namedNode(`${NS.skos}Concept`), changes);
        this.addStatement(work, value, `${NS.skos}inScheme`, namedNode(op.set), changes);
        this.addStatement(work, value, `${NS.skos}prefLabel`, literal(op.label.trim()), changes);
        this.addStatement(work, value, `${NS.p}order`, literal(String(order), namedNode(`${NS.xsd}integer`)), changes);
        this.addStatement(work, value, `${NS.ls}identifier`, literal(identifier), changes);
        this.addStatement(work, op.op, `${NS.p}createdValue`, namedNode(value), changes);
        // Every shape that allows each value of the set now allows this one too. Shapes that allow only some, such as a
        // precondition's, are left as they are: the impact names them.
        const all = new Set(members.map((m) => m.v));
        for (const { list } of q(`SELECT DISTINCT ?list WHERE { ?ps sh:path ?dim ; sh:in ?list . ?dim p:valuesFrom <${op.set}> }`)) {
          const listed = new Set(q(`SELECT ?v WHERE { <${list}> rdf:rest*/rdf:first ?v }`).map((r) => r.v));
          if (listed.size !== all.size || [...all].some((v) => !listed.has(v))) continue;
          const last = q(`SELECT ?node WHERE { <${list}> rdf:rest* ?node . ?node rdf:rest rdf:nil }`)[0].node;
          let node = `${last}-rest`;
          for (let n = 2; ask(work.store, `ASK { <${node}> ?p ?o }`); n++) node = `${last}-rest-${n}`;
          this.removeStatement(work, last, `${NS.rdf}rest`, namedNode(`${NS.rdf}nil`), changes);
          this.addStatement(work, last, `${NS.rdf}rest`, namedNode(node), changes);
          this.addStatement(work, node, `${NS.rdf}first`, namedNode(value), changes);
          this.addStatement(work, node, `${NS.rdf}rest`, namedNode(`${NS.rdf}nil`), changes);
        }
      } else if (kind === 'relabel') {
        for (const { l } of q(`SELECT ?l WHERE { <${op.value}> skos:prefLabel ?l }`)) this.removeStatement(work, op.value, `${NS.skos}prefLabel`, literal(l), changes);
        this.addStatement(work, op.value, `${NS.skos}prefLabel`, literal(op.label.trim()), changes);
      } else if (kind === 'deprecate') {
        level = 'minor';
        this.set(work, op.value, `${NS.p}valueStatus`, namedNode(`${NS.p}ValueStatus-deprecated`), changes);
        this.set(work, op.value, `${NS.owl}deprecated`, literal('true', namedNode(`${NS.xsd}boolean`)), changes);
        this.set(work, op.value, `${NS.p}replacedBy`, namedNode(op.replacement), changes);
        // The migration: every object holding the value along a state dimension moves to its replacement.
        for (const { o, dim } of q(`SELECT ?o ?dim WHERE { ?o ?dim <${op.value}> . ?dim a p:StateDimension }`)) {
          this.removeStatement(work, o, dim, namedNode(op.value), changes);
          this.addStatement(work, o, dim, namedNode(op.replacement), changes);
        }
      }
    }
    // Each ontology whose terms changed moves to its next version: a relabel is a patch, an added value or a deprecation a minor version.
    const subjects = new Set(changes.slice(first).map((c) => c.subject));
    const versions: string[] = [];
    for (const o of q(`SELECT ?o ?v ?title WHERE { ?o a owl:Ontology ; owl:versionInfo ?v OPTIONAL { ?o dcterms:title ?title } }`)) {
      if (![...subjects].some((s) => s.startsWith(`${o.o}#`))) continue;
      const [major, minor, patch] = o.v.split('.').map(Number);
      const next = level === 'minor' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
      this.set(work, o.o, `${NS.owl}versionInfo`, literal(next), changes);
      this.set(work, o.o, `${NS.owl}versionIRI`, namedNode(`${o.o}/${next}`), changes);
      versions.push(`${o.title ?? o.o} ${o.v} → ${next}`);
    }
    for (const v of versions) this.addStatement(work, changeSet, `${NS.p}versionChange`, literal(v), changes);
    this.set(work, changeSet, `${NS.p}patch`, literal(turtlePatch(changes.slice(first).filter((c) => c.subject !== changeSet))), changes);
  }

  /** The commit that applied a change set, and its changes to the structure and the graph, in order. */
  private appliedChanges(changeSet: string) {
    const commit = this.q(`SELECT ?c WHERE { GRAPH ?c { ?c p:target <${changeSet}> ; p:method p:ApplyChangeSet } } ORDER BY DESC(STRLEN(STR(?c))) DESC(STR(?c)) LIMIT 1`)[0]?.c;
    if (!commit) return [];
    const ops = new Set(this.operationsOf(changeSet).map((o) => o.op));
    const g = namedNode(commit);
    // Read as terms, not text, so each value comes back with its datatype.
    const one = (s: Term, p: string) => this.graph.store.match(s as oxigraph.Quad['subject'], namedNode(p), null, g)[0]?.object as Term | undefined;
    return (this.graph.store.match(g, namedNode(`${NS.p}change`), null, g) as oxigraph.Quad[])
      .map((q) => q.object)
      .map((ch) => ({ n: Number(ch.value.split('/').pop()), subject: one(ch as Term, `${NS.p}changedSubject`)!.value, property: one(ch as Term, `${NS.p}changedProperty`)!.value, old: one(ch as Term, `${NS.p}oldValue`), new: one(ch as Term, `${NS.p}newValue`) }))
      .sort((a, b) => a.n - b.n)
      .filter((r) => r.subject !== changeSet && !ops.has(r.subject));
  }

  /**
   * Roll back structure change (spec 3.7): the inverse of the commit that applied the change set, as new statements, so
   * history is never rewritten. Refused when a value it would remove is held by an object.
   */
  private rollBackStructure(work: Graph, changeSet: string, changes: Change[]) {
    const applied = this.appliedChanges(changeSet);
    if (!applied.length) throw new GatewayError(400, ['No commit applied this change set']);
    for (const c of [...applied].reverse()) {
      if (c.new) this.removeStatement(work, c.subject, c.property, c.new, changes);
      if (c.old) this.addStatement(work, c.subject, c.property, c.old, changes);
    }
    // A value the change set added, if objects now hold it, cannot simply go.
    const removed = applied.filter((c) => c.property === RDF_TYPE && c.new?.value === `${NS.skos}Concept`).map((c) => c.subject);
    const problems: string[] = [];
    for (const value of removed) {
      const label = this.q(`SELECT ?l WHERE { <${value}> skos:prefLabel ?l }`)[0]?.l ?? value;
      const holders = this.q(`SELECT ?id WHERE { ?o ?dim <${value}> . ?dim a p:StateDimension . ?o ls:identifier ?id } ORDER BY ?id`, work).map((r) => r.id);
      if (holders.length) problems.push(`${holders.join(', ')} ${holders.length === 1 ? 'holds' : 'hold'} ${label}, which rolling back would remove. Move ${holders.length === 1 ? 'it' : 'them'} first.`);
    }
    if (problems.length) throw new GatewayError(400, problems);
    this.set(work, changeSet, `${NS.p}patch`, undefined, changes);
  }

  /**
   * The impact of a change set (spec 3.7, Impact before approval): its operations tried on a working copy, every object
   * validated against the changed structure, and everything that refers to what changes.
   */
  async structureImpact(changeSet: string, direction: 'apply' | 'rollBack'): Promise<StructureImpact> {
    const work: Graph = { store: this.workingCopy(), dataset: this.graph.dataset };
    const changes: Change[] = [];
    const refused: string[] = [];
    try {
      if (direction === 'apply') this.applyStructure(work, changeSet, changes);
      else this.rollBackStructure(work, changeSet, changes);
    } catch (error) {
      if (error instanceof GatewayError) refused.push(...error.reasons);
      else throw error;
    }
    work.dataset = defaultGraphDataset(work.store);
    // Structure is named as people read it; objects by their identifiers.
    const label = (iri: string, graph: Graph = work) =>
      this.q(`SELECT ?l WHERE { { <${iri}> skos:prefLabel ?l } UNION { <${iri}> rdfs:label ?l FILTER NOT EXISTS { <${iri}> skos:prefLabel ?x } } } LIMIT 1`, graph)[0]?.l ?? iri.split(/[#/]/).pop()!;
    const identifier = (iri: string) => this.q(`SELECT ?id WHERE { <${iri}> ls:identifier ?id }`, work)[0]?.id ?? iri;
    const lines: string[] = [];
    for (const op of this.operationsOf(changeSet)) {
      const kind = op.kind.slice(`${NS.p}OperationKind-`.length);
      const set = op.set ?? this.q(`SELECT ?s WHERE { <${op.value}> skos:inScheme ?s }`)[0]?.s;
      const verb = direction === 'apply' ? { addValue: 'adds', relabel: 'relabels', deprecate: 'deprecates' } : { addValue: 'removes', relabel: 'relabels back', deprecate: 'restores' };
      if (kind === 'addValue') lines.push(`${label(set, this.graph)}: ${verb.addValue} ${op.label}`);
      if (kind === 'relabel') lines.push(`${label(set, this.graph)}: ${verb.relabel} ${label(op.value, this.graph)} as ${direction === 'apply' ? op.label : label(op.value, this.graph)}`);
      if (kind === 'deprecate') lines.push(`${label(set, this.graph)}: ${verb.deprecate} ${label(op.value, this.graph)}${direction === 'apply' ? `, replaced by ${label(op.replacement, this.graph)}` : ''}`);
    }
    // Objects whose state moves: a change along a state dimension of an object with an identifier.
    const moves = changes
      .filter((c) => c.newValue && ask(work.store, `ASK { <${c.property}> a p:StateDimension }`) && ask(work.store, `ASK { <${c.subject}> ls:identifier ?i ; a ?t . ?t a p:ObjectType FILTER NOT EXISTS { ?t p:inDomain p:Structure } }`))
      .map((c) => {
        const removed = changes.find((o) => o.subject === c.subject && o.property === c.property && o.oldValue);
        return { identifier: identifier(c.subject), from: removed?.oldValue ? label(removed.oldValue.value, this.graph) : '', to: label(c.newValue!.value) };
      });
    const problems = refused.length ? [] : await validateData(work);
    const identifierOf = (problem: string) => {
      const [focus, ...rest] = problem.split(': ');
      return `${this.q(`SELECT ?id WHERE { <${focus}> ls:identifier ?id }`, work)[0]?.id ?? focus}: ${rest.join(': ')}`;
    };
    // What refers to the value sets touched, or their values: preconditions, effects, metrics and titles.
    const sets = this.valueSetsTouched(changeSet);
    const refersTo = new Set<string>();
    for (const set of sets) {
      const values = `{ ?v skos:inScheme <${set}> }`;
      for (const { m } of this.q(`SELECT DISTINCT ?m WHERE { ?m p:precondition ?pre . ?pre (sh:property|sh:node|sh:and/rdf:rest*/rdf:first)* ?ps .
          { ?ps sh:in/rdf:rest*/rdf:first ?v } UNION { ?ps sh:hasValue ?v } ${values} }`)) refersTo.add(`Method ${label(m, this.graph)}: its precondition allows only some of these values`);
      for (const { m } of this.q(`SELECT DISTINCT ?m WHERE { ?m p:effect ?e . ?e p:value ?v ${values} }`)) refersTo.add(`Method ${label(m, this.graph)}: sets one of these values`);
      for (const { m } of this.q(`SELECT DISTINCT ?m WHERE { ?m a p:Metric ; p:inState ?v ${values} }`)) refersTo.add(`Metric ${label(m, this.graph)}: counts one of these values`);
      for (const { d, t } of this.q(`SELECT ?d ?t WHERE { ?d p:valuesFrom <${set}> ; p:dimensionOf ?t }`)) {
        const prefixed = Object.entries(NS).find(([, ns]) => d.startsWith(ns));
        const name = prefixed ? `{${prefixed[0]}:${d.slice(prefixed[1].length)}` : undefined;
        if (name && this.q(`SELECT ?tt WHERE { <${t}> p:titleTemplate ?tt }`)[0]?.tt.includes(name)) refersTo.add(`Titles of ${label(t, this.graph)}`);
        refersTo.add(`State ${label(d, this.graph)} of ${label(t, this.graph)}: wherever its values are shown or chosen`);
      }
    }
    const versions = changes
      .filter((c) => c.property === `${NS.owl}versionInfo` && c.newValue)
      .map((c) => {
        const old = changes.find((o) => o.subject === c.subject && o.property === c.property && o.oldValue);
        const title = this.q(`SELECT ?t WHERE { <${c.subject}> dcterms:title ?t }`)[0]?.t ?? c.subject;
        return `${title} ${old?.oldValue?.value ?? ''} → ${c.newValue!.value}`;
      });
    const impact = { structure: lines, moves, notConforming: [...refused, ...problems.map(identifierOf)], refersTo: [...refersTo].sort(), versions };
    freeStore(work.store);
    return impact;
  }

  // ---------------------------------------------------------------- skills (spec 3.3, Skills)

  /** How many turns a skill's model may take, tool calls included. */
  static readonly SKILL_STEPS = 12;

  /**
   * Propose with skills (spec 3.3, Skills): runs the approved skills that serve a method on an object or a set, as the
   * principal, with the connected model or by each skill's reference procedure. Each proposal is recorded before it is
   * returned, and changes nothing.
   */
  async propose(principal: Principal, ids: string[], method: string): Promise<SkillProposals> {
    this.authorize(principal);
    if (!ids.length) throw new GatewayError(400, ['Give the object or the set']);
    const objects = ids.map((id) => this.resolve(id));
    const onSet = ask(this.graph.store, `ASK { <${method}> p:onSet true }`);
    if (onSet) {
      const blocks = await this.setBlocks(principal, objects, method);
      if (blocks.length) throw new GatewayError(400, blocks);
    } else {
      if (objects.length !== 1) throw new GatewayError(400, ['This method acts on one object']);
      const { type } = this.typeOf(objects[0]);
      if (!this.canRead(principal, type)) throw new GatewayError(403, ['Your role cannot read this object']);
      if (!ask(this.graph.store, `ASK { <${method}> a p:Method ; p:appliesTo <${type}> }`)) throw new GatewayError(400, ['This method does not apply to this object']);
      if (!ask(this.graph.store, `ASK { <${principal.role}> p:mayRun <${method}> }`)) throw new GatewayError(403, ['Your role cannot run this method']);
    }

    const result: SkillProposals = { proposals: [], notRun: [] };
    for (const skill of this.skillsFor(principal, method)) {
      const model = this.options.skillModel;
      let made: MadeProposal | undefined;
      let fellBack: string | undefined;
      if (model) {
        try {
          made = await this.proposeWithModel(principal, skill, method, objects, model);
        } catch (error) {
          console.warn(`The skill model could not run ${skill.label}.`, error instanceof Error ? error.message : error);
          fellBack = 'The model could not propose, so the reference procedure ran instead.';
        }
      }
      if (!made && skill.procedure) {
        const outcome = this.runProcedure(principal, skill, method, objects);
        if ('reason' in outcome) {
          result.notRun.push({ skill: skill.skill, label: skill.label, reason: outcome.reason });
          continue;
        }
        made = { ...outcome, ranBy: { procedure: skill.procedureLabel! }, ...(fellBack ? { fellBack } : {}) };
      }
      if (!made) {
        result.notRun.push({ skill: skill.skill, label: skill.label, reason: fellBack ? 'The model could not propose, and this skill has no reference procedure.' : 'No model is connected, and this skill has no reference procedure.' });
        continue;
      }
      result.proposals.push(await this.recordProposal(principal, skill, method, objects, made));
    }
    return result;
  }

  /** The skills a composition names, so the experience asks for proposals only when there are any. */
  private skillsOffered(principal: Principal, method: string): { skills?: { skill: string; label: string }[] } {
    const skills = this.skillsFor(principal, method).map((s) => ({ skill: s.skill, label: s.label }));
    return skills.length ? { skills } : {};
  }

  /** The approved skills that serve a method and that the principal's role may use. */
  private skillsFor(principal: Principal, method: string): SkillRow[] {
    const today = this.now().toISOString().slice(0, 10);
    return this.q(`SELECT ?skill ?label ?version ?instructions ?procedure ?procedureLabel ?recommends WHERE {
        ?skill a p:Skill ; p:serves <${method}> ; rdfs:label ?label ; p:skillVersion ?version ; p:approvedOn ?approved ; p:instructions ?instructions .
        FILTER(STR(?approved) <= "${today}")
        FILTER(NOT EXISTS { ?skill p:usableBy ?r } || EXISTS { ?skill p:usableBy <${principal.role}> })
        OPTIONAL { ?skill p:referenceProcedure ?procedure . ?procedure rdfs:label ?procedureLabel }
        OPTIONAL { ?skill p:recommends ?recommends } } ORDER BY ?label`)
      .filter((s) => this.options.skillModel || s.procedure)
      .map((s) => ({ skill: s.skill, label: s.label, version: s.version, instructions: s.instructions, procedure: s.procedure, procedureLabel: s.procedureLabel, recommends: s.recommends === 'true', inputs: this.proposedInputs(s.skill, method) }));
  }

  /** The method's inputs a skill proposes, in the method's order. */
  private proposedInputs(skill: string, method: string) {
    const proposed = new Set(this.q(`SELECT ?i WHERE { <${skill}> p:proposesInput ?i }`).map((r) => r.i));
    const among = new Set(this.q(`SELECT ?i WHERE { <${method}> p:input ?i . ?i p:amongSet true }`).map((r) => r.i));
    return this.inputs(method)
      .filter((i) => proposed.has(i.input))
      .map((i) => ({ input: i.input, name: i.name, label: i.label, datatype: i.datatype, among: among.has(i.input) }));
  }

  /** A reference procedure, run by the platform (spec 3.3, Skills): deterministic, and plain about what it does not judge. */
  private runProcedure(principal: Principal, skill: SkillRow, method: string, objects: string[]): Omit<MadeProposal, 'ranBy'> | { reason: string } {
    switch (skill.procedure) {
      case `${NS.p}ReuseRecordedInputs`:
        return this.reuseRecordedInputs(principal, skill, objects[0]);
      case `${NS.p}RankByComparison`:
        return this.rankByComparison(skill, method, objects);
      default:
        return { reason: 'This skill names a reference procedure the platform does not have.' };
    }
  }

  /** Reuse recorded inputs: the most recent result of the object, or else of its siblings, and the values recorded on it. */
  private reuseRecordedInputs(principal: Principal, skill: SkillRow, object: string): Omit<MadeProposal, 'ranBy'> | { reason: string } {
    const p = this.q(`SELECT ?along ?siblings ?latest WHERE { <${skill.skill}> p:resultsAlong ?along ; p:latestBy ?latest . OPTIONAL { <${skill.skill}> p:siblingsAlong ?siblings } }`)[0];
    if (!p) return { reason: 'This skill does not say where its earlier results are.' };
    const hidden = this.unreadable(principal.role);
    const sources = this.q(`SELECT ?input ?from WHERE { <${skill.skill}> p:inputSource ?s . ?s p:givesInput ?input ; p:readFrom ?from }`).filter((s) => !hidden.has(s.from));
    const wanted = skill.inputs.filter((i) => sources.some((s) => s.input === i.input));
    const known = sources.map((s) => `<${s.from}>`).join(' ');
    const latest = (of: string) =>
      this.q(`SELECT ?result ?of ?at WHERE { ?result <${p.along}> ?of ; <${p.latest}> ?at ; ls:identifier ?id . VALUES ?of { ${of} }
          FILTER EXISTS { ?result ?prop ?v VALUES ?prop { ${known} } } } ORDER BY DESC(?at) DESC(?id) LIMIT 1`)[0];
    const self = this.summary(object);
    let found = latest(`<${object}>`);
    let fromSibling = false;
    if (!found && p.siblings) {
      const siblings = this.q(`SELECT DISTINCT ?s WHERE { <${object}> <${p.siblings}> ?parent . ?s <${p.siblings}> ?parent ; a <${self.type}> FILTER(?s != <${object}>) }`).map((r) => `<${r.s}>`);
      if (siblings.length) found = latest(siblings.join(' '));
      fromSibling = Boolean(found);
    }
    const resultLabel = this.q(`SELECT ?l WHERE { <${p.along}> rdfs:domain ?t . ?t rdfs:label ?l }`)[0]?.l;
    if (!found || hidden.has(this.typeOf(found.result).type)) {
      return { reason: `Nothing earlier to reuse: no ${(resultLabel ?? 'result').toLowerCase()} of ${self.identifier}${p.siblings ? ' or of the others alongside it' : ''} has these values recorded.` };
    }
    const result = this.summary(found.result);
    const of = this.summary(found.of);
    const cite = [{ iri: result.iri, identifier: result.identifier }];
    const values = wanted.flatMap((i) => {
      const from = sources.find((s) => s.input === i.input)!.from;
      const v = this.q(`SELECT ?v WHERE { <${found.result}> <${from}> ?v }`)[0]?.v;
      if (v === undefined || !/^-?\d+(\.\d+)?$/.test(v)) return [];
      const value = String(Number(v));
      return [{ name: i.name, label: i.label, value, valueLabel: value, restsOn: cite }];
    });
    if (!values.length) return { reason: `${result.identifier} has none of these values recorded.` };
    const asOf = this.dateLabel(found.at);
    const what = `${result.identifier}, the most recent ${result.typeLabel.toLowerCase()} of ${of.identifier}`;
    const reasoning = fromSibling
      ? `${self.identifier} has none of its own yet, so these are carried over from ${what}, which sits alongside it${asOf ? `, as of ${asOf}` : ''}. The reference procedure does not judge what ${self.identifier} changes: check each value against it.`
      : `Carried over from ${what}${asOf ? `, as of ${asOf}` : ''}. The reference procedure does not judge what has changed since: check each value.`;
    return { values, reasoning, restsOn: cite };
  }

  /** Rank by comparison: the fewest urgent cells, then the fewest missing; none on a tie. */
  private rankByComparison(skill: SkillRow, method: string, objects: string[]): Omit<MadeProposal, 'ranBy'> | { reason: string } {
    const comparison = this.comparison(method, objects)?.comparison;
    const chosen = skill.inputs.find((i) => i.among);
    if (!comparison || !chosen) return { reason: 'This set method has no comparison to rank by.' };
    const summaries = objects.map((o) => this.summary(o));
    const ranked = summaries.map((s, column) => {
      const urgent = comparison.rows.filter((r) => r.cells[column]?.urgent);
      const missing = comparison.rows.filter((r) => !r.cells[column]);
      return { s, urgent, missing, cells: comparison.rows.flatMap((r) => (r.cells[column] ? [r.cells[column]!] : [])) };
    });
    const order = [...ranked].sort((a, b) => a.urgent.length - b.urgent.length || a.missing.length - b.missing.length);
    const describe = (r: (typeof ranked)[number]) => {
      const flagged = r.urgent.map((row) => `${row.label}${row.cells[ranked.indexOf(r)]?.status ? ` ${row.cells[ranked.indexOf(r)]!.status!.split(': ').pop()}` : ''}`);
      const parts = [flagged.length ? flagged.join(', ') : 'none flagged'];
      if (r.missing.length) parts.push(`${r.missing.length} missing`);
      return `${r.s.identifier}: ${parts.join('; ')}`;
    };
    const cite = (r: (typeof ranked)[number]) => r.urgent.map((row) => row.cells[ranked.indexOf(r)]!.identifier);
    const restsOn = [...new Set([...summaries.map((s) => s.identifier), ...ranked.flatMap(cite)])].map((identifier) => ({ iri: this.resolve(identifier), identifier }));
    const counted = `Counted from the comparison alone: it does not weigh by how much a value misses, nor the budget or other signals.`;
    const [first, second] = order;
    if (second && first.urgent.length === second.urgent.length && first.missing.length === second.missing.length) {
      const tied = order.filter((r) => r.urgent.length === first.urgent.length && r.missing.length === first.missing.length);
      return { values: [], reasoning: `No recommendation: ${tied.map((r) => r.s.identifier).join(' and ')} tie. ${ranked.map(describe).join('. ')}. ${counted}`, restsOn };
    }
    const others = order.slice(1);
    const lead = first.urgent.length
      ? `${first.s.identifier} has the fewest flagged in the comparison.`
      : `${first.s.identifier} is the only one with nothing flagged in the comparison.`;
    const reasoning = `${lead} ${[...(first.urgent.length || first.missing.length ? [first] : []), ...others].map(describe).join('. ')}. ${counted}`;
    const value = { name: chosen.name, label: chosen.label, value: first.s.iri, valueLabel: `${first.s.identifier} · ${first.s.title}`, restsOn: [{ iri: first.s.iri, identifier: first.s.identifier }, ...cite(first).map((identifier) => ({ iri: this.resolve(identifier), identifier }))] };
    return { values: [value], recommended: { iri: first.s.iri, identifier: first.s.identifier }, reasoning, restsOn };
  }

  /** A skill run by the connected model, through the gateway's read-only tools as the principal. Every value is checked. */
  private async proposeWithModel(principal: Principal, skill: SkillRow, method: string, objects: string[], model: SkillModel): Promise<MadeProposal> {
    const seen = new Map<string, string>();
    const toolbox = { tools: [...ASK_TOOLS, PROPOSAL_TOOL], run: (name: string, input: unknown) => this.runAskTool(principal, name, input, seen) };
    const records = [];
    for (const o of objects) records.push((await this.runAskTool(principal, 'read_object', { identifier: this.summary(o).identifier }, seen)).content);
    const methodLabel = this.q(`SELECT ?l ?c WHERE { <${method}> rdfs:label ?l OPTIONAL { <${method}> rdfs:comment ?c } }`)[0];
    const set = objects.map((o) => this.summary(o));
    const reply = await model.propose({
      instructions: skill.instructions,
      method: `${methodLabel.l}${methodLabel.c ? `: ${methodLabel.c}` : ''}`,
      inputs: skill.inputs.map((i) => ({ name: i.name, label: i.label, kind: i.among ? 'object' : 'number' })),
      ...(skill.recommends ? { recommendAmong: set.map((s) => s.identifier) } : {}),
      context: this.askContext(principal),
      records,
      toolbox,
      maxSteps: Gateway.SKILL_STEPS,
    });
    // Only objects read for this proposal may be cited; only values an input would take are kept.
    const cited = (ids: string[]) => [...new Set(ids.map(normalize))].flatMap((id) => (seen.has(id) ? [{ iri: seen.get(id)!, identifier: this.summary(seen.get(id)!).identifier }] : []));
    const ofSet = (id: string) => set.find((s) => normalize(s.identifier) === normalize(id));
    const values = skill.inputs.flatMap((i) => {
      const given = reply.values.find((v) => v.name === i.name);
      if (!given) return [];
      if (i.among) {
        const s = ofSet(given.value);
        return s ? [{ name: i.name, label: i.label, value: s.iri, valueLabel: `${s.identifier} · ${s.title}`, restsOn: cited(given.restsOn) }] : [];
      }
      if (!/^-?\d+(\.\d+)?$/.test(given.value)) return [];
      if (i.datatype === `${NS.xsd}integer` && !/^-?\d+$/.test(given.value)) return [];
      return [{ name: i.name, label: i.label, value: given.value, valueLabel: given.value, restsOn: cited(given.restsOn) }];
    });
    const recommendedSummary = skill.recommends && reply.recommended ? ofSet(reply.recommended) : undefined;
    // A recommendation and the choice it pre-fills are one and the same.
    const chosen = skill.inputs.find((i) => i.among);
    if (recommendedSummary && chosen && !values.some((v) => v.name === chosen.name)) {
      values.push({ name: chosen.name, label: chosen.label, value: recommendedSummary.iri, valueLabel: `${recommendedSummary.identifier} · ${recommendedSummary.title}`, restsOn: [] });
    }
    const recommended = recommendedSummary ?? (chosen ? set.find((s) => s.iri === values.find((v) => v.name === chosen.name)?.value) : undefined);
    if (!values.length && !recommended) throw new Error('The model proposed nothing that could be checked');
    return {
      values,
      ...(skill.recommends && recommended ? { recommended: { iri: recommended.iri, identifier: recommended.identifier } } : {}),
      reasoning: reply.reasoning,
      restsOn: cited(reply.restsOn),
      ranBy: { model: reply.model },
    };
  }

  /** Records a proposal before it is shown, through the queue like every write (spec 3.4, Skill proposals). */
  private recordProposal(principal: Principal, skill: SkillRow, method: string, objects: string[], made: MadeProposal): Promise<ProposalView> {
    return this.enqueue(async () => {
      const proposal = `${this.dataNamespace}proposal/${this.proposalCount + 1}`;
      const at = this.now();
      const g = namedNode(proposal);
      const add = (s: string, p: string, o: Term) => quad(namedNode(s), namedNode(p), o, g);
      const quads = [
        add(proposal, RDF_TYPE, namedNode(`${NS.p}Proposal`)),
        add(proposal, `${NS.p}proposedBy`, namedNode(skill.skill)),
        add(proposal, `${NS.p}skillVersion`, literal(skill.version)),
        add(proposal, `${NS.p}method`, namedNode(method)),
        ...objects.map((o) => add(proposal, `${NS.p}proposalFor`, namedNode(o))),
        add(proposal, `${NS.prov}wasAssociatedWith`, namedNode(principal.person)),
        add(proposal, `${NS.p}actedAs`, namedNode(principal.role)),
        ...(principal.account ? [add(proposal, `${NS.p}signedInAs`, literal(principal.account))] : []),
        add(proposal, `${NS.p}ranBy`, literal('model' in made.ranBy ? made.ranBy.model : made.ranBy.procedure)),
        ...(made.fellBack ? [add(proposal, `${NS.p}fellBack`, literal(made.fellBack))] : []),
        add(proposal, `${NS.p}reasoning`, literal(made.reasoning)),
        ...made.restsOn.map((r) => add(proposal, `${NS.p}restsOn`, namedNode(r.iri))),
        ...(made.recommended ? [add(proposal, `${NS.p}recommended`, namedNode(made.recommended.iri))] : []),
        add(proposal, `${NS.prov}generatedAtTime`, xsdDateTime(at)),
      ];
      for (const v of made.values) {
        const input = skill.inputs.find((i) => i.name === v.name)!;
        const node = `${proposal}/value/${v.name}`;
        quads.push(
          add(proposal, `${NS.p}proposedValue`, namedNode(node)),
          add(node, RDF_TYPE, namedNode(`${NS.p}ProposedValue`)),
          add(node, `${NS.p}valueOf`, namedNode(input.input)),
          add(node, `${NS.p}proposedAs`, input.among ? namedNode(v.value) : literal(v.value, namedNode(input.datatype ?? `${NS.xsd}string`))),
          ...v.restsOn.map((r) => add(node, `${NS.p}restsOn`, namedNode(r.iri))),
        );
      }
      this.options.journal?.append('proposal', at, [], quads);
      for (const q of quads) this.graph.store.add(q);
      this.proposalCount++;
      return {
        proposal,
        skill: skill.skill,
        label: skill.label,
        version: skill.version,
        method,
        ranBy: made.ranBy,
        ...(made.fellBack ? { fellBack: made.fellBack } : {}),
        reasoning: made.reasoning,
        values: made.values,
        ...(made.recommended ? { recommended: made.recommended } : {}),
        restsOn: made.restsOn,
        generatedAt: at.toISOString(),
      };
    });
  }

  /** What a commit records of the proposal it started from: each proposed input kept or changed, and the recommendation followed. */
  private proposalOutcome(proposalGiven: string, method: string, objects: string[], resolved: Map<string, Term>) {
    const proposal = proposalGiven.includes('://') ? proposalGiven : `${this.dataNamespace}proposal/${proposalGiven}`;
    const head = this.q(`SELECT ?method WHERE { GRAPH <${proposal}> { <${proposal}> a p:Proposal ; p:method ?method } }`)[0];
    if (!head) throw new GatewayError(400, [`No proposal ${proposalGiven}`]);
    if (head.method !== method) throw new GatewayError(400, ['This proposal was made for another method']);
    const forObjects = this.q(`SELECT ?o WHERE { GRAPH <${proposal}> { <${proposal}> p:proposalFor ?o } }`).map((r) => r.o);
    if (forObjects.length !== objects.length || objects.some((o) => !forObjects.includes(o))) throw new GatewayError(400, ['This proposal was made for other objects']);
    const proposed = this.q(`SELECT ?input ?name ?value WHERE { GRAPH <${proposal}> { <${proposal}> p:proposedValue ?v . ?v p:valueOf ?input ; p:proposedAs ?value } ?input p:inputName ?name } ORDER BY ?name`);
    const same = (a: string, b: string) => a === b || (/^-?\d+(\.\d+)?$/.test(a) && /^-?\d+(\.\d+)?$/.test(b) && Number(a) === Number(b));
    const kept = proposed.filter((p) => resolved.has(p.input) && same(resolved.get(p.input)!.value, p.value));
    const changed = proposed.filter((p) => !kept.includes(p));
    const recommended = this.q(`SELECT ?o WHERE { GRAPH <${proposal}> { <${proposal}> p:recommended ?o } }`)[0]?.o;
    return {
      proposal,
      kept: kept.map((p) => p.name),
      changed: changed.map((p) => p.name),
      keptInputs: kept.map((p) => p.input),
      changedInputs: changed.map((p) => p.input),
      ...(recommended ? { followedRecommendation: recommended === objects[0] } : {}),
    };
  }

  /** A date as people read it, such as Nov 19, 2026. */
  private dateLabel(value: string): string | undefined {
    const d = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? undefined : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }

  // ---------------------------------------------------------------- generated drafts (spec 3.4)

  /**
   * Drafts (spec 3.4, Generated drafts): the connected model writes the method's draft from what the principal may read
   * of the object and its declared links. The draft is recorded before it is returned, and changes nothing.
   */
  async draft(principal: Principal, idOrIri: string, method: string): Promise<DraftView> {
    this.authorize(principal);
    const object = this.resolve(idOrIri);
    const { type } = this.typeOf(object);
    if (!this.canRead(principal, type)) throw new GatewayError(403, ['Your role cannot read this object']);
    if (!ask(this.graph.store, `ASK { <${method}> a p:Method ; p:appliesTo <${type}> }`)) throw new GatewayError(400, ['This method does not apply to this object']);
    if (!ask(this.graph.store, `ASK { <${principal.role}> p:mayRun <${method}> }`)) throw new GatewayError(403, ['Your role cannot run this method']);
    if (!ask(this.graph.store, `ASK { <${method}> p:producesDraft true }`)) throw new GatewayError(400, ['This method does not produce a draft']);
    const blocks = this.draftBlocks(method, true);
    if (blocks.length) throw new GatewayError(400, blocks);
    const preconditions = this.q(`SELECT ?pre WHERE { <${method}> p:precondition ?pre }`).map((r) => r.pre);
    const problems = await conformanceProblems(this.graph, object, preconditions);
    if (problems.length) throw new GatewayError(400, problems);

    // The records, read as the principal: hidden properties stay hidden, and personal-data reads are audited as theirs.
    const drafting = this.draftingOf(method)!;
    const objects = [object];
    for (const rel of drafting.drawsOn) {
      for (const { o } of this.q(`SELECT DISTINCT ?o WHERE { <${object}> <${rel}> ?o } ORDER BY ?o`)) {
        const linkedType = this.q(`SELECT ?t WHERE { <${o}> a ?t . ?t a p:ObjectType }`)[0]?.t;
        if (linkedType && this.canRead(principal, linkedType) && !objects.includes(o)) objects.push(o);
      }
    }
    const records = JSON.stringify(objects.map((o) => this.recordFor(this.read(principal, o))), null, 2);
    let reply;
    try {
      reply = await this.options.drafter!.draft({ instructions: drafting.instructions, records });
    } catch (error) {
      if (error instanceof DraftingError) throw new GatewayError(502, error.reasons);
      throw error;
    }
    const text = reply.text.trim();
    if (!text) throw new GatewayError(502, ['The model returned no text. Nothing was recorded.']);
    const [instructionsDigest, recordsDigest] = await Promise.all([sha256(drafting.instructions), sha256(records)]);

    // Recorded before it is shown, through the queue like every write.
    return this.enqueue(async () => {
      const draft = `${this.dataNamespace}draft/${this.draftCount + 1}`;
      const at = this.now();
      const g = namedNode(draft);
      const add = (p: string, o: Term) => quad(g, namedNode(p), o, g);
      const quads = [
        add(RDF_TYPE, namedNode(`${NS.p}Draft`)),
        add(`${NS.p}method`, namedNode(method)),
        add(`${NS.p}draftOf`, namedNode(object)),
        add(`${NS.prov}wasAssociatedWith`, namedNode(principal.person)),
        add(`${NS.p}actedAs`, namedNode(principal.role)),
        ...(principal.account ? [add(`${NS.p}signedInAs`, literal(principal.account))] : []),
        add(`${NS.p}modelId`, literal(reply.model)),
        add(`${NS.p}instructionsDigest`, literal(instructionsDigest)),
        add(`${NS.p}recordsDigest`, literal(recordsDigest)),
        ...objects.map((o) => add(`${NS.p}given`, namedNode(o))),
        add(`${NS.prov}generatedAtTime`, xsdDateTime(at)),
        add(`${NS.p}text`, literal(text)),
        add(`${NS.p}draftStatus`, namedNode(`${NS.p}DraftStatus-undecided`)),
      ];
      this.options.journal?.append('draft', at, [], quads);
      for (const q of quads) this.graph.store.add(q);
      this.draftCount++;
      return this.draftView(draft);
    });
  }

  /** An object's record as the model is given it: identifiers and labels, no addresses. */
  private recordFor(view: ObjectView) {
    return {
      identifier: view.identifier,
      type: view.typeLabel,
      state: view.state,
      properties: view.properties,
      links: view.links.map((l) => ({ relationship: l.label, direction: l.direction === 'out' ? 'to' : 'from', objects: l.objects.map((o) => o.identifier) })),
    };
  }

  private draftView(draft: string): DraftView {
    const r = this.q(`SELECT ?method ?methodLabel ?object ?text ?model ?at ?status ?person ?name WHERE {
        GRAPH <${draft}> { <${draft}> a p:Draft ; p:method ?method ; p:draftOf ?object ; p:text ?text ; p:modelId ?model ; prov:generatedAtTime ?at ;
          p:draftStatus ?status ; prov:wasAssociatedWith ?person }
        ?method rdfs:label ?methodLabel . OPTIONAL { ?person rdfs:label ?name } }`)[0];
    if (!r) throw new GatewayError(404, [`No draft ${draft}`]);
    const identifier = (o: string) => this.q(`SELECT ?id WHERE { <${o}> ls:identifier ?id }`)[0]?.id ?? o;
    const given = this.q(`SELECT ?o WHERE { GRAPH <${draft}> { <${draft}> p:given ?o } }`).map((g) => ({ iri: g.o, identifier: identifier(g.o) }));
    return {
      draft,
      method: r.method,
      methodLabel: r.methodLabel,
      object: r.object,
      objectIdentifier: identifier(r.object),
      text: r.text,
      model: r.model,
      generatedAt: r.at,
      status: r.status.slice(`${NS.p}DraftStatus-`.length) as DraftStatus,
      given: given.sort((a, b) => (a.iri === r.object ? -1 : b.iri === r.object ? 1 : a.identifier.localeCompare(b.identifier))),
      requestedBy: r.person,
      requestedByName: r.name ?? r.person,
    };
  }

  /** Only a person decides on a draft, once, for the object and method it was written for (spec 3.4). */
  private checkDraft(principal: Principal, object: string, method: string, given: DraftGiven) {
    this.authorize(principal);
    if (ask(this.graph.store, `ASK { <${principal.person}> p:isAgent true }`)) throw new GatewayError(403, ['Only a person accepts or discards a draft. Agents may only ask for one.']);
    const view = this.draftView(given.draft);
    if (view.object !== object || view.method !== method) throw new GatewayError(400, ['This draft was written for another object or method']);
    if (view.status !== 'undecided') throw new GatewayError(400, [`This draft was already ${view.status}`]);
    const text = given.text.trim();
    if (!text) throw new GatewayError(400, ['The text is empty. Discard the draft instead.']);
    return { draft: given.draft, model: view.model, text, edited: text !== view.text };
  }

  /** The statements that decide a draft: its status, who decided and when. */
  private decideDraft(draft: string, principal: Principal, status: 'accepted' | 'discarded', at: Date) {
    const g = namedNode(draft);
    return {
      removed: [quad(g, namedNode(`${NS.p}draftStatus`), namedNode(`${NS.p}DraftStatus-undecided`), g)],
      added: [
        quad(g, namedNode(`${NS.p}draftStatus`), namedNode(`${NS.p}DraftStatus-${status}`), g),
        quad(g, namedNode(`${NS.p}decidedBy`), namedNode(principal.person), g),
        quad(g, namedNode(`${NS.p}decidedAt`), xsdDateTime(at), g),
      ],
    };
  }

  /** Reads a draft back, such as when a person returns to a process they set aside. Only for roles that may run its method. */
  getDraft(principal: Principal, draft: string): DraftView {
    this.authorize(principal);
    const view = this.draftView(draft.includes('://') ? draft : `${this.dataNamespace}draft/${draft}`);
    if (!this.canRead(principal, this.typeOf(view.object).type)) throw new GatewayError(403, ['Your role cannot read this object']);
    if (!ask(this.graph.store, `ASK { <${principal.role}> p:mayRun <${view.method}> }`)) throw new GatewayError(403, ['Your role cannot run this method']);
    return view;
  }

  /** Discards a draft: recorded, and nothing else changes. */
  discardDraft(principal: Principal, draft: string): Promise<DraftView> {
    return this.enqueue(async () => {
      const iri = draft.includes('://') ? draft : `${this.dataNamespace}draft/${draft}`;
      const view = this.draftView(iri);
      if (!ask(this.graph.store, `ASK { <${principal.role}> p:mayRun <${view.method}> }`)) throw new GatewayError(403, ['Your role cannot run this method']);
      this.checkDraft(principal, view.object, view.method, { draft: iri, text: view.text });
      const at = this.now();
      const { removed, added } = this.decideDraft(iri, principal, 'discarded', at);
      this.options.journal?.append('draft', at, removed, added);
      for (const q of removed) this.graph.store.delete(q);
      for (const q of added) this.graph.store.add(q);
      return this.draftView(iri);
    });
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
      // A coded value or a term by its label, a person by name, an object by its identifier.
      const r = this.q(`SELECT ?pref ?id ?l WHERE { OPTIONAL { <${term.value}> skos:prefLabel ?pref } OPTIONAL { <${term.value}> ls:identifier ?id } OPTIONAL { <${term.value}> rdfs:label ?l } } LIMIT 1`, graph)[0];
      return r?.pref ?? r?.l ?? r?.id ?? term.value;
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
    if (ask(this.graph.store, `ASK { <${method}> p:onSet true }`)) throw new GatewayError(400, ['This method acts on a set of objects chosen together']);

    const validator = validatorFor(this.graph);
    const signature = this.signatureRequest(principal, method);
    const inputs = await Promise.all(this.inputs(method).map(async (input): Promise<ComposedInput> => {
      const base = { name: input.name, label: input.label, ...(input.perObject === 'true' ? { perObject: true } : {}) };
      if (input.datatype === `${NS.xsd}anyURI`) return { ...base, kind: 'url' };
      if (input.datatype === `${NS.xsd}decimal` || input.datatype === `${NS.xsd}integer`) return { ...base, kind: 'number' };
      if (input.datatype) return { ...base, kind: 'text' };
      if (input.valuesFrom) {
        // The input's shape may narrow the scheme, such as causality without "unassessed".
        const narrowed = this.q(`SELECT ?value WHERE { <${input.input}> p:inputShape ?shape . ?shape sh:in/rdf:rest*/rdf:first ?value }`).map((r) => r.value);
        const choices = this.q(`SELECT ?value ?label WHERE { ?value skos:inScheme <${input.valuesFrom}> ; skos:prefLabel ?label ; p:order ?order FILTER NOT EXISTS { ?value p:valueStatus p:ValueStatus-deprecated } } ORDER BY ?order`)
          .filter((c) => !narrowed.length || narrowed.includes(c.value));
        return { ...base, kind: 'choice', choices: asChoices(choices), ...(input.manyValues === 'true' ? { many: true } : {}) };
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
      const candidates = (input.choicesAlong
        ? this.q(`SELECT ?value ?label WHERE { <${object}> <${input.choicesAlong}> ?value . ?value ls:identifier ?label } ORDER BY ?label`)
        : this.q(`SELECT ?value ?label WHERE { ?value a <${input.objectOf}> ; ls:identifier ?label FILTER(?value != <${object}>) } ORDER BY ?label`)
      ).map((c) => {
        // An object reads as its identifier, with its title where it says more, such as a value's label.
        const title = titleOf(this.graph.store, c.value);
        return title && title.toLowerCase() !== c.label.toLowerCase() ? { ...c, label: `${c.label} · ${title}` } : c;
      });
      // Only objects that meet the input's shape qualify, such as cases that are not closed.
      const shapes = this.q(`SELECT ?shape WHERE { <${input.input}> p:inputShape ?shape }`).map((r) => r.shape);
      const qualifying = [];
      for (const c of candidates) if (!(await conformanceProblems(this.graph, c.value, shapes, validator)).length) qualifying.push(c);
      return { ...base, kind: 'object', choices: asChoices(qualifying) };
    }));
    return { method, label: m.label, archetype: archetypeOf(this.graph.store, method), object: this.summary(object), inputs, ...(signature ? { signature } : {}), ...this.skillsOffered(principal, method) };
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
        const numeric = [`${NS.xsd}decimal`, `${NS.xsd}integer`].includes(input.datatype);
        if (numeric && !/^-?\d+(\.\d+)?$/.test(raw.trim())) problems.push(`${input.label} must be a number`);
        else if (input.datatype === `${NS.xsd}integer` && !/^-?\d+$/.test(raw.trim())) problems.push(`${input.label} must be a whole number`);
        value = literal(numeric ? raw.trim() : raw, namedNode(input.datatype));
      } else if (input.manyValues === 'true') {
        // Many values from a scheme, sent separated by spaces (spec 3.1, Input), each allowed by the scheme and the input's shape.
        const chosen = [...new Set(raw.split(/\s+/).filter(Boolean))];
        const narrowed = this.q(`SELECT ?value WHERE { <${input.input}> p:inputShape ?shape . ?shape sh:in/rdf:rest*/rdf:first ?value }`).map((r) => r.value);
        for (const iri of chosen) {
          if (!ask(this.graph.store, `ASK { <${iri}> skos:inScheme <${input.valuesFrom}> }`) || (narrowed.length && !narrowed.includes(iri))) problems.push(`${input.label}: ${iri.split(/[#/]/).pop()} is not an allowed value`);
        }
        resolved.set(input.input, literal(chosen.join(' ')));
        continue;
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
    const created = this.mint(work, e.type, changes);
    if (e.link) this.set(work, created, e.link, namedNode(object), changes, false);
    // A second link, to what the method's object links to, such as a decision on the scenario's parent.
    for (const { by, to } of this.q(`SELECT ?by ?to WHERE { <${effect}> p:alsoLinkedBy ?by ; p:alsoLinkedTo ?to }`)) {
      for (const { v } of this.q(`SELECT ?v WHERE { <${object}> <${to}> ?v }`, work)) this.set(work, created, by, namedNode(v), changes, false);
    }
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

  /** A new object of a type: its identifier, from the type's name and the next free number, and its type. */
  private mint(work: Graph, type: string, changes: Change[]): string {
    const prefix = this.q(`SELECT ?l WHERE { <${type}> rdfs:label ?l }`)[0].l.replace(/[^A-Za-z]+/g, '');
    let n = Number(this.q(`SELECT (COUNT(?o) AS ?n) WHERE { ?o a <${type}> }`, work)[0].n) + 1;
    while (ask(work.store, `ASK { ?o ls:identifier "${prefix}-${n}" }`)) n++;
    const identifier = `${prefix}-${n}`;
    const created = `${this.dataNamespace}${identifier}`;
    this.set(work, created, RDF_TYPE, namedNode(type), changes, false);
    this.set(work, created, `${NS.ls}identifier`, literal(identifier), changes, false);
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
    if (principal.account) add(id, `${NS.p}signedInAs`, literal(principal.account));
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
      ...(principal.account ? [add(`${NS.p}signedInAs`, literal(principal.account))] : []),
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
    if (analysis.kind === 'ModelRun') return this.runModel(run, object, analysis.model!);
    const plan = planDisproportionality(this.graph.store, analysis.effect, object);
    if (plan.cannotRun) throw new GatewayError(400, [plan.cannotRun]);

    const e = this.q(`SELECT ?outcomeAs ?aggregatesBy ?typeLabel ?plural ?countsPlural WHERE { <${analysis.effect}> p:recordsOutcomeAs ?outcomeAs ; p:aggregatesBy ?aggregatesBy ;
        p:createsType ?type ; p:counts ?counts . ?type rdfs:label ?typeLabel ; p:pluralLabel ?plural . ?counts p:pluralLabel ?countsPlural }`)[0];
    const work: Graph = { store: this.workingCopy(), dataset: this.graph.dataset };
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

  /**
   * A model run (spec 3.4, Model runs): the connected model reads the object and what it links to, with the inputs of the
   * run's starting commit, and returns what to create and set. Applied to a working copy and validated against every shape;
   * throws with the reasons when the model cannot run or its result breaks a shape.
   */
  private async runModel(run: string, object: string, name: string) {
    const model = CONNECTED_MODELS.get(name);
    if (!model) throw new GatewayError(400, [`${name} is not connected.`]);
    const inputs = Object.fromEntries(this.q(`SELECT ?name ?value WHERE { GRAPH <${run}> { <${run}> p:startCommit ?commit } GRAPH ?commit { ?commit p:inputValue ?iv . ?iv p:forInput ?input ; rdf:value ?value } ?input p:inputName ?name }`)
      .map((r) => [r.name, r.value]));
    const at = this.now();
    this.progress.set(run, 0.1);
    await yieldToReaders();
    let result;
    try {
      result = model.run({ store: this.graph.store, target: object, inputs, at });
    } catch (error) {
      throw new GatewayError(400, [error instanceof Error ? error.message : String(error)]);
    }
    this.progress.set(run, 0.8);
    const work: Graph = { store: this.workingCopy(), dataset: this.graph.dataset };
    const changes: Change[] = [];
    const created: string[] = [];
    const byKey = new Map<string, string>();
    for (const c of result.creates) {
      const iri = this.mint(work, c.type, changes);
      byKey.set(c.key, iri);
      created.push(iri);
    }
    for (const c of result.creates) {
      for (const { property, value } of c.values) {
        const term = 'key' in value ? namedNode(byKey.get(value.key) ?? '') : value;
        if ('key' in value && !byKey.has(value.key)) throw new GatewayError(400, [`${name} linked to an object it did not create.`]);
        this.set(work, byKey.get(c.key)!, property, term, changes, false);
      }
    }
    for (const { subject, property, value } of result.sets) this.set(work, subject, property, value, changes);
    this.progress.set(run, 1);
    work.dataset = defaultGraphDataset(work.store);
    const problems = await validateData(work);
    if (problems.length) throw new GatewayError(400, problems);
    return { message: result.message, changes, created, work, at };
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
  commits(): { commit: string; method: string; target: string; person: string; role: string; at: string; account?: string; alongWith?: string[] }[] {
    const rows = this.q(`SELECT ?commit ?method ?target ?person ?role ?at ?account WHERE { GRAPH ?commit {
        ?commit a p:Commit ; p:method ?method ; p:target ?target ; prov:wasAssociatedWith ?person ; p:actedAs ?role ; prov:startedAtTime ?at .
        OPTIONAL { ?commit p:signedInAs ?account } } }
        ORDER BY ?at STRLEN(STR(?commit)) ?commit`);
    // A set method's commit also names the set's other objects (spec 5.4, Acting on a set).
    const along = new Map<string, string[]>();
    for (const r of this.q(`SELECT ?commit ?o WHERE { GRAPH ?commit { ?commit p:alongWith ?o } } ORDER BY ?o`)) along.set(r.commit, [...(along.get(r.commit) ?? []), r.o]);
    return rows.map((r) => (along.has(r.commit) ? { ...r, alongWith: along.get(r.commit) } : r)) as never;
  }
}
