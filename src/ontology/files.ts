import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadGraph, type Graph } from './ontology';

/** Loading the ontology and seed graph from disk. Server and tests only. */

export const ONTOLOGY_DIR = join(import.meta.dirname, '../../ontology');
export const SEED_FILE = join(import.meta.dirname, '../../data/life-sciences/seed.ttl');

/** Every Turtle file of the ontology: the platform vocabulary, then each domain. */
export function ontologyFiles(dir = ONTOLOGY_DIR): string[] {
  const walk = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.ttl') ? [join(d, e.name)] : [],
    );
  return walk(dir).sort((a, b) => (a.endsWith('platform.ttl') ? -1 : b.endsWith('platform.ttl') ? 1 : a.localeCompare(b)));
}

export function loadOntology(extraTurtle: string[] = [], dir = ONTOLOGY_DIR): Graph {
  return loadGraph([...ontologyFiles(dir).map((f) => readFileSync(f, 'utf8')), ...extraTurtle]);
}
