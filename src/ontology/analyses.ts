import type * as oxigraph from 'oxigraph';
import { ask, NS, select } from './ontology';

/**
 * Analyses: background work the platform computes (platform spec 3.1 and 3.4, Background runs).
 * A domain declares an analysis in the ontology, with its parameters; the platform implements each
 * kind once, here, for every domain. A background method whose work no analysis covers cannot run.
 */

/** The kinds of analysis the platform implements, by their local name in the platform vocabulary. */
export const IMPLEMENTED_ANALYSES = new Set(['DisproportionalityAnalysis']);

/** The method's background analysis effect, if the platform implements it. */
export function analysisOf(store: oxigraph.Store, method: string): { effect: string; kind: string } | undefined {
  const rows = select(store, `SELECT ?e ?kind WHERE { <${method}> p:effect ?e . ?e a ?kind . ?kind rdfs:subClassOf p:Analysis }`);
  const row = rows.find((r) => IMPLEMENTED_ANALYSES.has(r.kind.slice(NS.p.length)));
  return row && { effect: row.e, kind: row.kind.slice(NS.p.length) };
}

/** Why a background method cannot start: no worker can do its work. Empty when it can, or when it is not a background method. */
export function backgroundBlocks(store: oxigraph.Store, method: string): string[] {
  if (!ask(store, `ASK { <${method}> p:runsInBackground true }`)) return [];
  if (analysisOf(store, method)) return [];
  const described = select(store, `SELECT ?d WHERE { <${method}> p:effect ?e . ?e a p:DescribedEffect ; p:description ?d }`).map((r) => r.d);
  return [['No worker can do this method’s background work yet.', ...described].join(' ')];
}

/** What the person is told the method's analysis will do, in words. */
export function analysisDescriptions(store: oxigraph.Store, method: string): string[] {
  const analysis = analysisOf(store, method);
  if (!analysis) return [];
  return select(store, `SELECT ?d WHERE { <${analysis.effect}> p:description ?d }`).map((r) => r.d);
}

// ---------------------------------------------------------------- disproportionality

/**
 * The proportional reporting ratio and the chi-squared statistic with Yates' correction for one
 * exposure and outcome. a: target with the outcome; b: target without; c: others with; d: others without.
 * The ratio is Infinity when no other exposure has the outcome.
 */
export function disproportionality(a: number, b: number, c: number, d: number): { prr: number; chiSquare: number } {
  const n = a + b + c + d;
  const prr = c === 0 ? Infinity : a / (a + b) / (c / (c + d));
  const denominator = (a + b) * (c + d) * (a + c) * (b + d);
  const corrected = Math.max(0, Math.abs(a * d - b * c) - n / 2);
  const chiSquare = denominator === 0 ? 0 : (n * corrected * corrected) / denominator;
  return { prr, chiSquare };
}

export interface OutcomeFinding {
  outcome: string;
  outcomeLabel: string;
  /** The counted objects for the target with this outcome. */
  objects: string[];
  a: number;
  b: number;
  c: number;
  d: number;
  prr: number;
  chiSquare: number;
  meets: boolean;
  /** An object already created for this target and outcome, by identifier, when there is one. */
  existing?: string;
}

export interface DisproportionalityPlan {
  /** Why the analysis cannot run, such as nothing to compare with. */
  cannotRun?: string;
  /** One finding per outcome among the target's counted objects, in outcome order. */
  findings: OutcomeFinding[];
  thresholds: { count: number; ratio: number; chiSquare: number };
}

/** Reads what a disproportionality analysis needs from the graph and computes each outcome's statistics. */
export function planDisproportionality(store: oxigraph.Store, effect: string, target: string): DisproportionalityPlan {
  const e = select(store, `SELECT ?counts ?countsLabel ?exposure ?outcome ?excludes ?createsType ?linkedBy ?recordsOutcomeAs ?count ?ratio ?chi ?targetLabel WHERE {
      <${effect}> p:counts ?counts ; p:exposure ?exposure ; p:outcome ?outcome ; p:createsType ?createsType ; p:linkedBy ?linkedBy ; p:recordsOutcomeAs ?recordsOutcomeAs ;
        p:minimumCount/p:parameterValue ?count ; p:minimumRatio/p:parameterValue ?ratio ; p:minimumChiSquare/p:parameterValue ?chi .
      ?counts p:pluralLabel ?countsLabel .
      <${target}> a ?targetType . ?targetType a p:ObjectType ; rdfs:label ?targetLabel .
      OPTIONAL { <${effect}> p:excludes ?excludes } }`)[0];
  const thresholds = { count: Number(e.count), ratio: Number(e.ratio), chiSquare: Number(e.chi) };
  const exclusion = e.excludes ? `FILTER NOT EXISTS { ?x <${e.excludes}> ?any }` : '';
  const rows = select(store, `SELECT ?x ?exposure ?outcome WHERE { ?x a <${e.counts}> ${exclusion}
      OPTIONAL { ?x <${e.exposure}> ?exposure } OPTIONAL { ?x <${e.outcome}> ?outcome } }`);

  const targetObjects = new Set<string>();
  const otherObjects = new Set<string>();
  const outcomesOf = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.exposure === target) targetObjects.add(r.x);
    else if (r.exposure) otherObjects.add(r.x);
    if (r.outcome) outcomesOf.set(r.x, (outcomesOf.get(r.x) ?? new Set()).add(r.outcome));
  }
  // An object exposed to the target and to others counts for the target only.
  for (const x of targetObjects) otherObjects.delete(x);
  if (!otherObjects.size) {
    return { cannotRun: `No other ${e.targetLabel.toLowerCase()} has ${e.countsLabel.toLowerCase()} to compare with.`, findings: [], thresholds };
  }

  const outcomes = select(store, `SELECT ?o ?label WHERE { <${e.outcome}> p:valuesFrom ?scheme . ?o skos:inScheme ?scheme ; skos:prefLabel ?label ; p:order ?order } ORDER BY ?order`);
  const has = (x: string, o: string) => outcomesOf.get(x)?.has(o) ?? false;
  const findings: OutcomeFinding[] = [];
  for (const { o, label } of outcomes) {
    const objects = [...targetObjects].filter((x) => has(x, o)).sort();
    if (!objects.length) continue;
    const a = objects.length;
    const b = targetObjects.size - a;
    const c = [...otherObjects].filter((x) => has(x, o)).length;
    const d = otherObjects.size - c;
    const { prr, chiSquare } = disproportionality(a, b, c, d);
    const existing = select(store, `SELECT ?id WHERE { ?s a <${e.createsType}> ; <${e.linkedBy}> <${target}> ; <${e.recordsOutcomeAs}> <${o}> ; ls:identifier ?id } ORDER BY ?id LIMIT 1`)[0]?.id;
    const meets = a >= thresholds.count && prr >= thresholds.ratio && chiSquare >= thresholds.chiSquare;
    findings.push({ outcome: o, outcomeLabel: label, objects, a, b, c, d, prr, chiSquare, meets, ...(existing ? { existing } : {}) });
  }
  return { findings, thresholds };
}
