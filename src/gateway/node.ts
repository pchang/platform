import { readFileSync } from 'node:fs';
import { defaultGraphDataset } from '../ontology/ontology';
import { loadOntology, SEED_FILE } from '../ontology/files';
import { Gateway, type GatewayOptions } from './gateway';
import { fromNQuads, Journal, seedFingerprint } from './journal';

/** Starting a gateway on the server: from the seed graph on disk, with or without a journal. */

/** The ontology with the seed graph, in memory only: the starting point for tests. */
export function withSeed(extraTurtle: string[] = [], options: GatewayOptions = {}): Gateway {
  return new Gateway(loadOntology([readFileSync(SEED_FILE, 'utf8'), ...extraTurtle]), options);
}

/**
 * The ontology with the seed graph and everything in the journal at journalPath (platform spec
 * section 3.4, Persistence). Creates the journal if it does not exist. Refuses to start if the
 * journal's chain is broken or it was written on a different seed.
 */
export function openGateway(journalPath: string, options: Omit<GatewayOptions, 'journal'> & { extraTurtle?: string[] } = {}): Gateway {
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
