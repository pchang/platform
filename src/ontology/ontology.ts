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
  return { store, dataset: defaultGraphDataset(store) };
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
