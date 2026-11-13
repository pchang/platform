/**
 * Reading a search query against the ontology (platform spec 5.2): identifiers, object types, state values and the words
 * left over. Pure and browser-safe: the gateway gives it the vocabulary the principal may read, and applies the result.
 */

export interface SearchVocabulary {
  /** Object types the principal may read, with their names. */
  types: { type: string; label: string; pluralLabel: string }[];
  /** State values of those types, by the dimension they belong to. */
  states: { dimension: string; dimensionLabel: string; type: string; value: string; label: string }[];
  /** Resolves a word, in any case, to an object when it is the identifier of one the principal may read. */
  identifier: (word: string) => { iri: string; identifier: string } | undefined;
}

export interface Interpretation {
  types: { type: string; label: string }[];
  states: { dimension: string; dimensionLabel: string; type: string; value: string; label: string }[];
  /** Objects named by identifier: found themselves, or, with a type, the objects linked to them. */
  identifiers: { iri: string; identifier: string }[];
  /** Words that must each appear in what the principal may read of an object. */
  words: string[];
  /** Only the principal's own objects: work waiting for them, or objects that name them (spec 5.2). */
  mine: boolean;
}

/**
 * A search plan from a connected model (spec 5.2, Understanding with a connected model): the same parts as an
 * interpretation, by IRI for types and states and by identifier for objects. The gateway checks every part.
 */
export interface SearchPlan {
  types: string[];
  states: string[];
  identifiers: string[];
  words: string[];
  mine: boolean;
}

/** What a model is given to understand a query: the vocabulary the principal may read, and who they are. Never a record. */
export interface SearchPlanRequest {
  query: string;
  person: { name: string; role: string };
  types: { iri: string; name: string; plural: string }[];
  states: { iri: string; type: string; dimension: string; value: string }[];
  relationships: string[];
  /** Identifiers the principal may read that appear in the query. */
  identifiers: string[];
}

/** A connected model that understands search queries. Rejects when it fails or declines; the gateway then reads the query itself. */
export interface SearchModel {
  readonly model: string;
  plan(request: SearchPlanRequest): Promise<SearchPlan>;
}

/** Words that mean the principal's own objects. */
const MINE = new Set(['my', 'mine', 'me', 'i', "i'm", 'myself']);

export const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

/** Small words that carry no meaning in a search, such as "for" in "cases for P-101". */
const FILLER = new Set(['a', 'an', 'the', 'for', 'of', 'on', 'in', 'with', 'to', 'by', 'at', 'and', 'all', 'show', 'me', 'find', 'list']);

/** A word's plain forms, so "cases" finds "case" and "queries" finds "query". */
function forms(word: string): string[] {
  const w = word.toLowerCase();
  const out = new Set([w]);
  if (w.endsWith('ies') && w.length > 4) out.add(`${w.slice(0, -3)}y`);
  else if (w.endsWith('es') && /(s|x|ch|sh)es$/.test(w)) out.add(w.slice(0, -2));
  else if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) out.add(w.slice(0, -1));
  return [...out];
}

/**
 * Reads a query, longest phrases first, so "safety cases" is a type before "cases" is, and "non-serious" is a state
 * before "serious" is. What is left, apart from filler words, must appear in the object's text.
 */
export function interpret(query: string, vocabulary: SearchVocabulary): Interpretation {
  let rest = ` ${normalize(query)} `;
  const result: Interpretation = { types: [], states: [], identifiers: [], words: [], mine: false };
  const take = (phrase: string) => {
    const at = rest.indexOf(` ${phrase} `);
    if (at < 0) return false;
    rest = `${rest.slice(0, at)} ${rest.slice(at + phrase.length + 1)}`;
    return true;
  };

  // Identifiers, as they are written.
  for (const word of normalize(query).split(' ')) {
    const found = vocabulary.identifier(word);
    if (found && take(word) && !result.identifiers.some((i) => i.iri === found.iri)) result.identifiers.push(found);
  }

  // Types by full name, singular or plural, longest first.
  const names = vocabulary.types
    .flatMap((t) => [t.label, t.pluralLabel].map((name) => ({ t, name: normalize(name) })))
    .sort((a, b) => b.name.length - a.name.length);
  for (const { t, name } of names) {
    if (take(name) && !result.types.some((x) => x.type === t.type)) result.types.push({ type: t.type, label: t.label });
  }

  // State values, longest first, so "non-serious" is not read as "serious".
  // Values shorter than two letters, such as a study phase "I", are too easily typed by chance to be read as states.
  const values = vocabulary.states.filter((v) => v.label.length >= 2).sort((a, b) => b.label.length - a.label.length);
  for (const v of values) {
    const phrase = normalize(v.label);
    const present = ` ${rest} `.includes(` ${phrase} `);
    if (!present) continue;
    // A value names a state of the types already understood, or of any type when none is.
    if (result.types.length && !result.types.some((t) => t.type === v.type)) continue;
    if (!result.states.some((s) => s.value === v.value)) result.states.push({ dimension: v.dimension, dimensionLabel: v.dimensionLabel, type: v.type, value: v.value, label: v.label });
  }
  for (const s of result.states) take(normalize(s.label));

  // The last word of a type's name, such as "cases" or "events": every type it fits.
  for (const word of rest.split(' ').filter(Boolean)) {
    const fits = vocabulary.types.filter((t) => forms(word).some((f) => [t.label, t.pluralLabel].some((n) => forms(normalize(n).split(' ').pop()!).includes(f))));
    if (!fits.length) continue;
    take(word);
    for (const t of fits) if (!result.types.some((x) => x.type === t.type)) result.types.push({ type: t.type, label: t.label });
  }

  // A state read before its type was known, such as "open" in "open queries", keeps only the types the query names.
  if (result.types.length) result.states = result.states.filter((s) => result.types.some((t) => t.type === s.type));
  const left = rest.split(' ').filter((w) => w && !FILLER.has(w));
  result.mine = left.some((w) => MINE.has(w));
  result.words = left.filter((w) => !MINE.has(w));
  return result;
}

/** Whether every word appears at the start of a word in the text, so "pneu" finds "pneumonia" but "monia" does not. */
export function containsWords(text: string, words: string[]): boolean {
  const haystack = ` ${normalize(text).replace(/[^\p{L}\p{N}-]+/gu, ' ')} `;
  return words.every((w) => forms(w).some((f) => haystack.includes(` ${f}`)));
}
