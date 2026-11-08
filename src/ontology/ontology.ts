import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import oxigraph from 'oxigraph';
import rdf from 'rdf-ext';
import type { DatasetCore, NamedNode, Quad } from '@rdfjs/types';

/**
 * Loads the ontology (platform spec section 3.1) into Oxigraph for queries and an RDF/JS
 * dataset for SHACL validation. Server-side only: the gateway uses this, never the browser.
 */

export const NS = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  owl: 'http://www.w3.org/2002/07/owl#',
  sh: 'http://www.w3.org/ns/shacl#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  p: 'https://w3id.org/lsh/platform#',
  ls: 'https://w3id.org/lsh/life-sciences#',
  lst: 'https://w3id.org/lsh/life-sciences/term#',
  lsh: 'https://w3id.org/lsh/life-sciences/shape#',
} as const;

export const PREFIXES = Object.entries(NS)
  .map(([prefix, iri]) => `PREFIX ${prefix}: <${iri}>`)
  .join('\n');

export const ONTOLOGY_DIR = join(import.meta.dirname, '../../ontology');

/** Every Turtle file of the ontology: the platform vocabulary, then each domain. */
export function ontologyFiles(dir = ONTOLOGY_DIR): string[] {
  const walk = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.ttl') ? [join(d, e.name)] : [],
    );
  return walk(dir).sort((a, b) => (a.endsWith('platform.ttl') ? -1 : b.endsWith('platform.ttl') ? 1 : a.localeCompare(b)));
}

export interface Graph {
  store: oxigraph.Store;
  dataset: DatasetCore;
}

/** Loads Turtle into one store. Later sources (such as instance data) are added to the same graph. */
export function loadGraph(turtle: string[]): Graph {
  const store = new oxigraph.Store();
  for (const source of turtle) store.load(source, { format: 'text/turtle' });
  const dataset = rdf.dataset(store.match(null, null, null, null) as unknown as Quad[]);
  return { store, dataset };
}

export function loadOntology(extraTurtle: string[] = [], dir = ONTOLOGY_DIR): Graph {
  return loadGraph([...ontologyFiles(dir).map((f) => readFileSync(f, 'utf8')), ...extraTurtle]);
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
