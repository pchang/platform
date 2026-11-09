import { createHash } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';
import oxigraph from 'oxigraph';

/**
 * The gateway's append-only journal (platform spec section 3.4, Persistence).
 *
 * One JSON entry per line. Each entry holds the statements a commit or a recorded read removed
 * and added, as N-Quads, and a SHA-256 fingerprint chained to the entry before it. Entries are
 * flushed to disk before the gateway answers. Opening a journal verifies the whole chain.
 */

export interface JournalEntry {
  seq: number;
  kind: 'genesis' | 'commit' | 'read';
  at: string;
  /** Fingerprint of the seed graph this journal builds on. Genesis entry only. */
  seed?: string;
  removed: string;
  added: string;
  prev: string;
  hash: string;
}

export class JournalError extends Error {}

const GENESIS_PREV = '0'.repeat(64);

function fingerprint(entry: Omit<JournalEntry, 'hash'>): string {
  const { seq, kind, at, seed, removed, added, prev } = entry;
  return createHash('sha256').update(JSON.stringify({ seq, kind, at, seed, removed, added, prev })).digest('hex');
}

export function toNQuads(quads: oxigraph.Quad[]): string {
  if (!quads.length) return '';
  return new oxigraph.Store(quads).dump({ format: 'application/n-quads' });
}

export function fromNQuads(text: string): oxigraph.Quad[] {
  if (!text) return [];
  const store = new oxigraph.Store();
  store.load(text, { format: 'application/n-quads' });
  return store.match(null, null, null, null) as oxigraph.Quad[];
}

export function seedFingerprint(sources: string[]): string {
  const hash = createHash('sha256');
  for (const source of sources) hash.update(source).update('\u0000');
  return hash.digest('hex');
}

export class Journal {
  private constructor(
    private readonly path: string,
    private last: JournalEntry,
  ) {}

  /**
   * Opens or creates a journal for a seed. Returns the journal and its entries after genesis,
   * in order, once the chain and the seed fingerprint have been checked.
   */
  static open(path: string, seed: string, now: Date): { journal: Journal; entries: JournalEntry[] } {
    if (!existsSync(path)) {
      mkdirSync(dirname(path), { recursive: true });
      const body = { seq: 0, kind: 'genesis' as const, at: now.toISOString(), seed, removed: '', added: '', prev: GENESIS_PREV };
      const genesis = { ...body, hash: fingerprint(body) };
      const journal = new Journal(path, genesis);
      journal.write(genesis);
      return { journal, entries: [] };
    }

    const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
    const entries: JournalEntry[] = [];
    let prev = GENESIS_PREV;
    lines.forEach((line, i) => {
      let entry: JournalEntry;
      try {
        entry = JSON.parse(line);
      } catch {
        throw new JournalError(`Journal entry ${i} is not readable. The journal may have been changed or cut short.`);
      }
      if (entry.seq !== i) throw new JournalError(`Journal entry ${i} is out of order. The journal may have been changed.`);
      if (entry.prev !== prev || fingerprint(entry) !== entry.hash) {
        throw new JournalError(`Journal entry ${i} does not match its fingerprint. The journal may have been changed.`);
      }
      prev = entry.hash;
      entries.push(entry);
    });
    if (!entries.length || entries[0].kind !== 'genesis') throw new JournalError('The journal has no genesis entry.');
    if (entries[0].seed !== seed) {
      throw new JournalError('The journal was written on a different seed graph. Replaying it would give a wrong state.');
    }
    return { journal: new Journal(path, entries.at(-1)!), entries: entries.slice(1) };
  }

  /** Appends an entry and flushes it to disk. Throws if it cannot, so the caller changes nothing. */
  append(kind: 'commit' | 'read', at: Date, removed: oxigraph.Quad[], added: oxigraph.Quad[]): JournalEntry {
    const body = { seq: this.last.seq + 1, kind, at: at.toISOString(), removed: toNQuads(removed), added: toNQuads(added), prev: this.last.hash };
    const entry = { ...body, hash: fingerprint(body) };
    this.write(entry);
    this.last = entry;
    return entry;
  }

  private write(entry: JournalEntry) {
    const fd = openSync(this.path, 'a');
    try {
      writeSync(fd, `${JSON.stringify(entry)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }
}
