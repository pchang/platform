import rdf from 'rdf-ext';
import { Validator } from 'shacl-engine';
import { validations } from 'shacl-engine/sparql.js';
import { backgroundBlocks } from './analyses';
import { archetypeOf, type Archetype } from './archetypes';
import { ask, iri, select, type Graph } from './ontology';

/**
 * Which methods can run on an object, and why the others cannot (platform spec 4, steps 3 and 6).
 * A method is available when the object conforms to the method's precondition shape and the
 * role may run it. Precondition messages are the reasons shown to people.
 */

export interface MethodOption {
  method: string;
  label: string;
  available: boolean;
  /** Why the method is blocked, from its precondition shape and the role. Empty when available. */
  blocks: string[];
  /** How the person runs it (platform spec 5.4). */
  archetype: Archetype;
  /** True for an action a person chooses to take, not work waiting, such as running an analysis (platform spec 5.1). */
  onDemand?: boolean;
}

export async function methodsFor(graph: Graph, object: string, role?: string): Promise<MethodOption[]> {
  const rows = select(
    graph.store,
    `SELECT ?method ?label ?pre WHERE {
       <${object}> a ?type .
       ?method a p:Method ; p:appliesTo ?type ; rdfs:label ?label .
       OPTIONAL { ?method p:precondition ?pre }
     } ORDER BY ?label ?pre`,
  );
  // A method may have several precondition shapes; every one must hold.
  const methods = new Map<string, { label: string; preconditions: string[] }>();
  for (const { method, label, pre } of rows) {
    const entry = methods.get(method) ?? { label, preconditions: [] };
    if (pre) entry.preconditions.push(pre);
    methods.set(method, entry);
  }
  const allowed = role
    ? new Set(select(graph.store, `SELECT ?m WHERE { <${role}> p:mayRun ?m }`).map((r) => r.m))
    : undefined;

  const options: MethodOption[] = [];
  for (const [method, { label, preconditions }] of methods) {
    const blocks: string[] = [];
    if (allowed && !allowed.has(method)) blocks.push('Your role cannot run this method');
    blocks.push(...backgroundBlocks(graph.store, method));
    blocks.push(...(await conformanceProblems(graph, object, preconditions)));
    const onDemand = ask(graph.store, `ASK { <${method}> p:onDemand true }`);
    options.push({ method, label, available: blocks.length === 0, blocks: [...new Set(blocks)], archetype: archetypeOf(graph.store, method), ...(onDemand ? { onDemand } : {}) });
  }
  return options;
}

/** A validator for the graph's current state. Reuse it across checks of the same state; building one compiles every shape. */
export function validatorFor(graph: Graph): Validator {
  return new Validator(graph.dataset, { factory: rdf, validations });
}

/** The messages of every shape the focus node does not conform to. Empty when it conforms to all. */
export async function conformanceProblems(graph: Graph, focus: string, shapes: string[], validator = validatorFor(graph)): Promise<string[]> {
  const problems: string[] = [];
  for (const shape of shapes) {
    const report = await validator.validate({ dataset: graph.dataset, terms: [iri(focus)] }, [{ terms: [iri(shape)] }]);
    for (const result of report.results) problems.push(...result.message.map((m) => m.value));
    if (!report.conforms && report.results.every((r) => r.message.length === 0)) problems.push(`Does not conform to ${shape}`);
  }
  return [...new Set(problems)];
}

/** Validates instance data against every shape that targets it. Returns the problems found. */
export async function validateData(graph: Graph): Promise<string[]> {
  const validator = new Validator(graph.dataset, { factory: rdf, validations });
  const report = await validator.validate({ dataset: graph.dataset });
  return report.results.map(
    (r) => `${r.focusNode.term.value}: ${r.message.map((m) => m.value).join('; ') || r.sourceShape?.term.value}`,
  );
}
