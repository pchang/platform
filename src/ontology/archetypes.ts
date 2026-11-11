import type { Store } from 'oxigraph';
import { ask, NS, select } from './ontology';

/**
 * Interaction archetypes (platform spec 5.4). Every method has exactly one, derived from what the ontology
 * says about it by rules checked in order; the first that matches decides. A method may override its rule
 * with p:archetype. The same archetype always gets the same pattern (design system spec 5.1).
 */

export interface Archetype {
  archetype: string;
  label: string;
}

type Rule = (method: string, store: Store) => boolean;

/** Each archetype's rule, keyed by its local name in the platform vocabulary. Order comes from p:ruleOrder. */
const RULES: Record<string, Rule> = {
  ReviewAndSign: (m, s) => ask(s, `ASK { <${m}> p:requiresSignature true }`),
  StartAndTrack: (m, s) => ask(s, `ASK { <${m}> p:runsInBackground true }`),
  CompareAndDecide: (m, s) => ask(s, `ASK { <${m}> p:appliesTo ?t ; p:input/p:objectOf ?t }`),
  ReviewADraft: (m, s) => ask(s, `ASK { <${m}> p:producesDraft true }`),
  ChooseAnObject: (m, s) => ask(s, `ASK { <${m}> p:appliesTo ?t ; p:input/p:objectOf ?o FILTER(?o != ?t) }`),
  StepByStep: (m, s) => Number(select(s, `SELECT (COUNT(?i) AS ?n) WHERE { <${m}> p:input ?i }`)[0].n) >= 5,
  FillIn: (m, s) => ask(s, `ASK { <${m}> p:input ?i }`),
  Confirm: () => true,
};

export function archetypes(store: Store): (Archetype & { order: number })[] {
  return select(store, `SELECT ?archetype ?label ?order WHERE { ?archetype a p:Archetype ; rdfs:label ?label ; p:ruleOrder ?order } ORDER BY ?order`).map(
    (r) => ({ archetype: r.archetype, label: r.label, order: Number(r.order) }),
  );
}

export function archetypeOf(store: Store, method: string): Archetype {
  const override = select(store, `SELECT ?archetype ?label WHERE { <${method}> p:archetype ?archetype . ?archetype rdfs:label ?label }`)[0];
  if (override) return override as unknown as Archetype;
  for (const a of archetypes(store)) {
    const rule = RULES[a.archetype.slice(NS.p.length)];
    if (!rule) throw new Error(`No rule for archetype ${a.archetype}`);
    if (rule(method, store)) return { archetype: a.archetype, label: a.label };
  }
  throw new Error(`No archetype matched ${method}`);
}

export const ruleNames = Object.keys(RULES);
