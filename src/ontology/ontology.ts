import * as oxigraph from 'oxigraph';
import rdf from 'rdf-ext';
import type { DatasetCore, NamedNode, Quad } from '@rdfjs/types';

/**
 * Loads the ontology (platform spec section 3.1) into Oxigraph for queries and an RDF/JS
 * dataset for SHACL validation. Runs on the server and, for previews, in the browser; file loading is in files.ts.
 */

export const NS = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  owl: 'http://www.w3.org/2002/07/owl#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  prov: 'http://www.w3.org/ns/prov#',
  sh: 'http://www.w3.org/ns/shacl#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  dcterms: 'http://purl.org/dc/terms/',
  p: 'https://w3id.org/lsh-platform/platform#',
  ls: 'https://w3id.org/lsh-platform/life-sciences#',
  lst: 'https://w3id.org/lsh-platform/life-sciences/term#',
  lsh: 'https://w3id.org/lsh-platform/life-sciences/shape#',
  d: 'https://example.org/lsh-data/',
} as const;

export const PREFIXES = Object.entries(NS)
  .map(([prefix, iri]) => `PREFIX ${prefix}: <${iri}>`)
  .join('\n');

export interface Graph {
  store: oxigraph.Store;
  dataset: DatasetCore;
}

/** Loads Turtle into one store. Later sources (such as instance data) are added to the same graph. */
export function loadGraph(turtle: string[]): Graph {
  const store = new oxigraph.Store();
  for (const source of turtle) store.load(source, { format: 'text/turtle' });
  nameBlankNodes(store);
  return { store, dataset: defaultGraphDataset(store) };
}

/**
 * Names the blank nodes the files leave, which are RDF lists only (platform spec 3.1, Named, not anonymous), after what
 * holds them, such as a shape's sh:in list as "<shape>-in", "<shape>-in-rest" and so on. A parser gives blank nodes new
 * labels on every load, so only named nodes can be changed by a commit and replayed from the journal (spec 3.7).
 */
export function nameBlankNodes(store: oxigraph.Store): void {
  const local = (iri: string) => iri.slice(Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/')) + 1);
  const quads = store.match(null, null, null, oxigraph.defaultGraph()).filter((q) => q.subject.termType === 'BlankNode' || q.object.termType === 'BlankNode');
  if (!quads.length) return;
  // Each blank node is named from what holds it, nearest a named node first, so a list is named down its length.
  const bySubject = new Map<string, oxigraph.Quad[]>();
  for (const q of quads) if (q.subject.termType === 'BlankNode' && q.object.termType === 'BlankNode') bySubject.set(q.subject.value, [...(bySubject.get(q.subject.value) ?? []), q]);
  const names = new Map<string, string>();
  const taken = new Set<string>();
  let frontier = quads.filter((q) => q.object.termType === 'BlankNode' && q.subject.termType === 'NamedNode');
  while (frontier.length) {
    const next: oxigraph.Quad[] = [];
    for (const q of frontier) {
      const blank = q.object.value;
      if (names.has(blank)) continue;
      const holder = q.subject.termType === 'NamedNode' ? q.subject.value : names.get(q.subject.value)!;
      const base = `${holder}-${local(q.predicate.value)}`;
      let name = base;
      for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
      taken.add(name);
      names.set(blank, name);
      next.push(...(bySubject.get(blank) ?? []));
    }
    frontier = next;
  }
  const term = <T extends oxigraph.Quad['subject'] | oxigraph.Quad['object']>(t: T) => (t.termType === 'BlankNode' && names.has(t.value) ? oxigraph.namedNode(names.get(t.value)!) : t);
  for (const q of quads) {
    store.delete(q);
    store.add(oxigraph.quad(term(q.subject) as oxigraph.Quad['subject'], q.predicate, term(q.object), q.graph));
  }
}

/**
 * The default graph as an RDF/JS dataset, for SHACL validation. Named graphs hold the
 * commit and audit records, which are not validated against the domain shapes.
 */
export function defaultGraphDataset(store: oxigraph.Store): DatasetCore {
  return rdf.dataset(store.match(null, null, null, oxigraph.defaultGraph()) as unknown as Quad[]);
}

/** Runs a SELECT query with the ontology prefixes and returns rows of plain strings. */
export function select(store: oxigraph.Store, query: string): Record<string, string>[] {
  const results = store.query(`${PREFIXES}\n${query}`) as Map<string, { value: string }>[];
  return results.map((row) => Object.fromEntries([...row].map(([k, v]) => [k, v.value])));
}

export function ask(store: oxigraph.Store, query: string): boolean {
  return store.query(`${PREFIXES}\n${query}`) as boolean;
}

export const iri = (value: string): NamedNode => rdf.namedNode(value);
