import rdf from 'rdf-ext';
import { Validator } from 'shacl-engine';
import { validations } from 'shacl-engine/sparql.js';
import { iri, select, type Graph } from './ontology';

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

  const validator = new Validator(graph.dataset, { factory: rdf, validations });
  const options: MethodOption[] = [];
  for (const [method, { label, preconditions }] of methods) {
    const blocks: string[] = [];
    if (allowed && !allowed.has(method)) blocks.push('Your role cannot run this method');
    for (const pre of preconditions) {
      const report = await validator.validate({ dataset: graph.dataset, terms: [iri(object)] }, [{ terms: [iri(pre)] }]);
      for (const result of report.results) blocks.push(...result.message.map((m) => m.value));
    }
    options.push({ method, label, available: blocks.length === 0, blocks: [...new Set(blocks)] });
  }
  return options;
}

/** Validates instance data against every shape that targets it. Returns the problems found. */
export async function validateData(graph: Graph): Promise<string[]> {
  const validator = new Validator(graph.dataset, { factory: rdf, validations });
  const report = await validator.validate({ dataset: graph.dataset });
  return report.results.map(
    (r) => `${r.focusNode.term.value}: ${r.message.map((m) => m.value).join('; ') || r.sourceShape?.term.value}`,
  );
}
