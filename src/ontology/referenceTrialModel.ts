import { literal, namedNode } from 'oxigraph';
import { NS, select } from './ontology';
import type { Model, ModelCreation, ModelRequest, ModelResult, ModelSetting } from './models';

/**
 * The reference trial model (domain spec 3.4.4, The reference trial model). It simulates a study scenario as it stands:
 * its protocol, study budget and site selection are the design variables, and the person's inputs are the assumptions.
 * It is transparent and reproducible, reads only the scenario's own objects, and is not validated for decisions about
 * real studies. Every result says so.
 */

const ls = (local: string) => `${NS.ls}${local}`;
const lst = (local: string) => `${NS.lst}${local}`;
const xsd = (local: string) => namedNode(`${NS.xsd}${local}`);
const decimal = (n: number) => literal(n.toFixed(1), xsd('decimal'));

/** Virtual trials per simulation, and the seed that makes a run reproducible. */
const TRIALS = 2000;
const SEED = 20261120;
/** The shape of the gamma distribution site rates are drawn from (Anisimov and Fedorov, 2007). */
const RATE_SHAPE = 2;
/** A trial that has not enrolled in this many weeks counts as 120 months. */
const MAX_WEEKS = 522;
const DAYS_PER_MONTH = 30.44;
/** The two-sided test at the 5 percent level. */
const Z_CRITICAL = 1.959964;

export const MEASURES = {
  lastPatientIn: { measure: lst('OutcomeMeasure-lastPatientIn'), unit: 'months' },
  totalCost: { measure: lst('OutcomeMeasure-totalCost'), unit: 'million USD' },
  probabilityOfSuccess: { measure: lst('OutcomeMeasure-probabilityOfSuccess'), unit: 'percent' },
  seriousAdverseEvents: { measure: lst('OutcomeMeasure-seriousAdverseEvents'), unit: 'events' },
  patientBurden: { measure: lst('OutcomeMeasure-patientBurden'), unit: 'hours per patient' },
  siteBurden: { measure: lst('OutcomeMeasure-siteBurden'), unit: 'hours per site per month' },
} as const;
type MeasureKey = keyof typeof MEASURES;

// ---------------------------------------------------------------- random numbers, reproducible

/** Mulberry32: a small, fast generator with a fixed seed, so the same scenario gives the same forecasts. */
function generator(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(random: () => number): number {
  const u = Math.max(random(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

/** A gamma draw with the given shape and mean (Marsaglia and Tsang). */
function gamma(random: () => number, shape: number, mean: number): number {
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = normal(random);
    const v = (1 + c * x) ** 3;
    if (v <= 0) continue;
    const u = random();
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return (d * v * mean) / shape;
  }
}

/** A Poisson draw: by multiplication for small means, by the normal approximation for large ones. */
function poisson(random: () => number, mean: number): number {
  if (mean <= 0) return 0;
  if (mean > 30) return Math.max(0, Math.round(mean + Math.sqrt(mean) * normal(random)));
  const limit = Math.exp(-mean);
  let k = 0;
  let p = random();
  while (p > limit) {
    k++;
    p *= random();
  }
  return k;
}

function percentile(sorted: number[], q: number): number {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

// ---------------------------------------------------------------- reading the scenario

interface Site { iri: string; id: string; name: string; count: number; rate: number; activationDays: number; equipment: Set<string>; startup: number; monthly: number }

function readScenario(request: ModelRequest) {
  const q = (query: string) => select(request.store, query);
  const scenario = request.target;
  const head = q(`SELECT ?protocol ?budget ?selection ?parent ?enrollment WHERE { <${scenario}> ls:usesProtocol ?protocol .
      OPTIONAL { <${scenario}> ls:usesBudget ?budget } OPTIONAL { <${scenario}> ls:usesSiteSelection ?selection }
      OPTIONAL { <${scenario}> ls:explores ?parent } OPTIONAL { ?protocol ls:plannedEnrollment ?enrollment } }`)[0];
  if (!head) throw new Error('The study scenario uses no protocol.');
  if (!head.enrollment) throw new Error('The protocol has no planned enrollment.');
  const visits = q(`SELECT ?v ?day WHERE { ?v ls:specifiedIn <${head.protocol}> ; a ls:PlannedVisit ; ls:studyDay ?day } ORDER BY ?day`)
    .map((r) => ({ iri: r.v, day: Number(r.day) }));
  if (!visits.length) throw new Error('The protocol has no planned visits, so its schedule cannot be simulated.');
  const assessments = q(`SELECT ?a ?name ?cost ?minutes ?equipment (COUNT(DISTINCT ?v) AS ?visits) (GROUP_CONCAT(DISTINCT STR(?v)) AS ?at) WHERE {
      ?a ls:specifiedIn <${head.protocol}> ; a ls:Assessment ; ls:assessmentName ?name ; ls:performedAt ?v .
      OPTIONAL { ?a ls:costPerVisit ?cost } OPTIONAL { ?a ls:minutesOnSite ?minutes } OPTIONAL { ?a ls:needsEquipment ?equipment } }
      GROUP BY ?a ?name ?cost ?minutes ?equipment`)
    .map((r) => ({ iri: r.a, name: r.name, cost: Number(r.cost ?? 0), minutes: Number(r.minutes ?? 0), equipment: r.equipment, visits: Number(r.visits), at: r.at.split(' ') }));
  const arms = q(`SELECT ?role ?ratio WHERE { ?arm ls:specifiedIn <${head.protocol}> ; a ls:Arm ; ls:armRole ?role . OPTIONAL { ?arm ls:allocationRatio ?ratio } }`)
    .map((r) => ({ control: r.role !== lst('ArmRole-experimental'), ratio: Number(r.ratio ?? 1) }));
  const sites: Site[] = head.selection
    ? q(`SELECT ?ps ?id ?name ?count ?rate ?days ?startup ?monthly (GROUP_CONCAT(?equipment; separator="|") AS ?kit) WHERE {
        ?ps ls:proposedIn <${head.selection}> ; ls:identifier ?id ; ls:patientsPerMonth ?rate ; ls:activationDays ?days .
        FILTER NOT EXISTS { ?ps ls:proposedSiteStatus lst:ProposedSiteStatus-rejected }
        OPTIONAL { ?ps ls:candidateSite/ls:siteName ?site } OPTIONAL { ?ps ls:siteCountry ?country }
        BIND(COALESCE(CONCAT(?site, ", ", ?country), ?site, ?country, ?id) AS ?name)
        OPTIONAL { ?ps ls:siteCount ?count } OPTIONAL { ?ps ls:startupCost ?startup } OPTIONAL { ?ps ls:monthlyCost ?monthly }
        OPTIONAL { ?ps ls:equipment ?equipment } } GROUP BY ?ps ?id ?name ?count ?rate ?days ?startup ?monthly ORDER BY ?id`)
        .map((r) => ({ iri: r.ps, id: r.id, name: r.name, count: Number(r.count ?? 1), rate: Number(r.rate), activationDays: Number(r.days),
          equipment: new Set(r.kit ? r.kit.split('|') : []), startup: Number(r.startup ?? 0), monthly: Number(r.monthly ?? 0) }))
    : [];
  const budget = head.budget ? q(`SELECT ?ceiling WHERE { <${head.budget}> ls:budgetCeiling ?ceiling }`)[0]?.ceiling : undefined;
  const targets = head.parent
    ? q(`SELECT ?t ?measure ?comparison ?threshold WHERE { ?t ls:targetFor <${head.parent}> ; ls:targetMeasure ?measure ; ls:targetComparison ?comparison ; ls:targetThreshold ?threshold }`)
    : [];
  const earlier = q(`SELECT ?f WHERE { ?f ls:forecastFrom/ls:simulates <${scenario}> ; ls:forecastCurrency lst:ForecastCurrency-current }`).map((r) => r.f);
  const raised = q(`SELECT ?about ?text WHERE { ?s a ls:DesignSignal ; ls:isAbout ?about ; ls:designSignalText ?text ; ls:designSignalStatus lst:DesignSignalStatus-raised }`);
  return {
    scenario, protocol: head.protocol, budget: head.budget, ceiling: budget === undefined ? undefined : Number(budget),
    enrollment: Number(head.enrollment), visits, assessments, arms, sites, targets, earlier, raised,
    scenarioName: q(`SELECT ?n WHERE { <${scenario}> ls:scenarioName ?n }`)[0]?.n ?? 'the scenario',
  };
}

// ---------------------------------------------------------------- the model

function number(inputs: Record<string, string>, name: string, label: string, min: number, max: number): number {
  const value = Number(inputs[name]);
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return value;
}

function run(request: ModelRequest): ModelResult {
  const chosen = (request.inputs.measures ?? '').split(/\s+/).filter(Boolean);
  const keys = (Object.keys(MEASURES) as MeasureKey[]).filter((k) => chosen.includes(MEASURES[k].measure));
  if (!keys.length) throw new Error('Choose at least one measure the reference trial model forecasts.');
  const screenFailure = number(request.inputs, 'screenFailureRate', 'The screen failure rate', 0, 95) / 100;
  const dropout = number(request.inputs, 'dropoutRate', 'The dropout rate', 0, 90) / 100;
  const controlResponse = number(request.inputs, 'controlResponse', 'The control response rate', 0, 100) / 100;
  const treatmentResponse = number(request.inputs, 'treatmentResponse', 'The treatment response rate', 0, 100) / 100;
  const saeRate = number(request.inputs, 'saeRate', 'The serious adverse event rate', 0, 1000);

  const s = readScenario(request);
  const needs = new Map<string, string[]>();
  for (const a of s.assessments) if (a.equipment) needs.set(a.equipment, [...(needs.get(a.equipment) ?? []), a.name]);
  const excluded = s.sites.filter((site) => [...needs.keys()].some((kit) => !site.equipment.has(kit)));
  const taking = s.sites.filter((site) => !excluded.includes(site));
  if ((keys.includes('lastPatientIn') || keys.includes('totalCost') || keys.includes('siteBurden')) && !taking.length) {
    throw new Error(s.sites.length ? 'No proposed site can perform every assessment the protocol needs.' : 'The study scenario has no proposed sites.');
  }
  const control = s.arms.filter((a) => a.control);
  const experimental = s.arms.filter((a) => !a.control);
  if (keys.includes('probabilityOfSuccess') && (control.length !== 1 || experimental.length !== 1)) {
    throw new Error('The reference trial model forecasts the probability of success for one experimental arm against one control arm.');
  }

  const N = s.enrollment;
  const followUpMonths = s.visits[s.visits.length - 1].day / DAYS_PER_MONTH;
  const firstVisit = s.visits[0].iri;
  const perPatient = s.assessments.reduce((sum, a) => sum + a.cost * a.visits, 0) / 1000;
  const screening = s.assessments.filter((a) => a.at.includes(firstVisit)).reduce((sum, a) => sum + a.cost, 0) / 1000;
  const screeningMinutes = s.assessments.filter((a) => a.at.includes(firstVisit)).reduce((sum, a) => sum + a.minutes, 0);
  const patientHours = s.assessments.reduce((sum, a) => sum + a.minutes * a.visits, 0) / 60;
  const screened = N / (1 - screenFailure);
  const exposureYears = N * (s.visits[s.visits.length - 1].day / 365) * (1 - dropout / 2);

  const random = generator(SEED);
  const out: Record<MeasureKey, number[]> = { lastPatientIn: [], totalCost: [], probabilityOfSuccess: [], seriousAdverseEvents: [], patientBurden: [], siteBurden: [] };
  let successes = 0;
  const siteList = taking.flatMap((site) => Array.from({ length: site.count }, () => site));
  for (let t = 0; t < TRIALS; t++) {
    // Enrollment: each site's rate from a gamma around its expected rate, its activation within 20 percent.
    const sites = siteList.map((site) => ({
      start: (site.activationDays * (0.8 + 0.4 * random())) / 7,
      weekly: (gamma(random, RATE_SHAPE, site.rate) * (1 - screenFailure) * 12) / 52,
      monthly: site.monthly,
    }));
    if (sites.length) {
      const first = Math.min(...sites.map((x) => x.start));
      let enrolled = 0;
      let week = Math.floor(first);
      while (enrolled < N && week < first + MAX_WEEKS) {
        const rate = sites.reduce((sum, x) => sum + (x.start <= week ? x.weekly : 0), 0);
        enrolled += poisson(random, rate);
        week++;
      }
      const lpiMonths = Math.min(((week - first) * 7) / DAYS_PER_MONTH, 120);
      out.lastPatientIn.push(lpiMonths);
      const end = first + (lpiMonths * DAYS_PER_MONTH) / 7 + (followUpMonths * DAYS_PER_MONTH) / 7;
      const siteMonths = sites.map((x) => Math.max(0, ((end - x.start) * 7) / DAYS_PER_MONTH));
      const siteCost = siteList.reduce((sum, site) => sum + site.startup, 0) + sites.reduce((sum, x, i) => sum + x.monthly * siteMonths[i], 0);
      out.totalCost.push((N * perPatient + screened * screening + siteCost) / 1000);
      const allSiteMonths = siteMonths.reduce((a, b) => a + b, 0);
      out.siteBurden.push((N * patientHours + (screened - N) * (screeningMinutes / 60)) / allSiteMonths);
    }
    // Success: responders in each arm, with dropouts as non-responders, tested two-sided at 5 percent.
    if (keys.includes('probabilityOfSuccess')) {
      const total = control[0].ratio + experimental[0].ratio;
      const nT = Math.round((N * experimental[0].ratio) / total);
      const nC = N - nT;
      const responders = (n: number, p: number) => {
        let k = 0;
        for (let i = 0; i < n; i++) if (random() >= dropout && random() < p) k++;
        return k;
      };
      const rT = responders(nT, treatmentResponse);
      const rC = responders(nC, controlResponse);
      const pooled = (rT + rC) / N;
      const se = Math.sqrt(pooled * (1 - pooled) * (1 / nT + 1 / nC));
      if (se > 0 && (rT / nT - rC / nC) / se > Z_CRITICAL) successes++;
    }
    out.seriousAdverseEvents.push(poisson(random, (exposureYears * saeRate) / 100));
  }
  out.patientBurden = [patientHours];
  const share = successes / TRIALS;
  out.probabilityOfSuccess = [share * 100];
  // A share's range: its 80 percent Wilson interval over the virtual trials.
  const wilson = (z: number) => {
    const centre = (share + (z * z) / (2 * TRIALS)) / (1 + (z * z) / TRIALS);
    const half = (z * Math.sqrt((share * (1 - share)) / TRIALS + (z * z) / (4 * TRIALS * TRIALS))) / (1 + (z * z) / TRIALS);
    return [Math.max(0, centre - half) * 100, Math.min(1, centre + half) * 100];
  };

  // ---------------------------------------------------------------- the result
  const creates: ModelCreation[] = [];
  const sets: ModelSetting[] = [];
  const lines: string[] = ['Reference trial model, not validated for decisions about real studies.'];
  const at = request.at.toISOString().slice(0, 10);
  creates.push({
    key: 'simulation',
    type: ls('TrialSimulation'),
    values: [
      { property: ls('simulates'), value: namedNode(s.scenario) },
      { property: ls('trialSimulationRun'), value: namedNode(lst('TrialSimulationRun-complete')) },
      { property: ls('scenarioAsOf'), value: literal(at, xsd('date')) },
      { property: ls('simulatedTrials'), value: literal(String(TRIALS), xsd('integer')) },
      { property: ls('recruitmentRate'), value: decimal(taking.length ? (taking.reduce((sum, x) => sum + x.rate * x.count, 0) / siteList.length) * (1 - screenFailure) : 0) },
      { property: ls('screenFailureRate'), value: decimal(screenFailure * 100) },
      { property: ls('dropoutRate'), value: decimal(dropout * 100) },
      // Every assumption as a number, so a skill can reuse them (domain spec 3.9).
      { property: ls('controlResponse'), value: decimal(controlResponse * 100) },
      { property: ls('treatmentResponse'), value: decimal(treatmentResponse * 100) },
      { property: ls('saeRate'), value: decimal(saeRate) },
      { property: ls('assumedEffect'), value: literal(`Response of ${(treatmentResponse * 100).toFixed(0)} percent on treatment against ${(controlResponse * 100).toFixed(0)} percent on control; ${saeRate} serious adverse events per 100 patient-years`) },
      { property: ls('simulationModel'), value: literal(`${referenceTrialModel.name} ${referenceTrialModel.version}: a reference model, not validated for decisions about real studies`) },
    ],
  });
  const labels: Record<MeasureKey, string> = {
    lastPatientIn: 'Last patient in', totalCost: 'Total cost', probabilityOfSuccess: 'Probability of success',
    seriousAdverseEvents: 'Serious adverse events', patientBurden: 'Patient burden', siteBurden: 'Site burden',
  };
  for (const key of keys) {
    const values = [...out[key]].sort((a, b) => a - b);
    const [median, low, high] = key === 'probabilityOfSuccess' ? [values[0], ...wilson(1.2816)] : [percentile(values, 0.5), percentile(values, 0.1), percentile(values, 0.9)];
    const { measure, unit } = MEASURES[key];
    const target = s.targets.find((x) => x.measure === measure);
    const met = target && (target.comparison === 'at most' ? median <= Number(target.threshold) : median >= Number(target.threshold));
    const against = !target ? 'noTarget' : met ? 'met' : 'missed';
    creates.push({
      key: `forecast-${key}`,
      type: ls('Forecast'),
      values: [
        { property: ls('forecastFrom'), value: { key: 'simulation' } },
        { property: ls('forecastCurrency'), value: namedNode(lst('ForecastCurrency-current')) },
        { property: ls('forecastMeasure'), value: namedNode(measure) },
        { property: ls('forecastAgainstTarget'), value: namedNode(lst(`ForecastAgainstTarget-${against}`)) },
        { property: ls('forecastMedian'), value: decimal(median) },
        { property: ls('forecastLow'), value: decimal(low) },
        { property: ls('forecastHigh'), value: decimal(high) },
        { property: ls('forecastUnit'), value: literal(unit) },
        ...(target ? [{ property: ls('measuredAgainst'), value: namedNode(target.t) }] : []),
      ],
    });
    const verdict = target ? `, ${met ? 'meeting' : 'missing'} the target of ${target.comparison} ${Number(target.threshold)}` : '';
    lines.push(`${labels[key]} ${median.toFixed(1)} ${unit} (${low.toFixed(1)} to ${high.toFixed(1)})${verdict}.`);
    if (key === 'totalCost' && s.budget) {
      sets.push({ subject: s.budget, property: ls('budgetTotal'), value: decimal(median) });
      if (s.ceiling !== undefined) {
        const over = median > s.ceiling;
        sets.push({ subject: s.budget, property: ls('studyBudgetFit'), value: namedNode(lst(`StudyBudgetFit-${over ? 'overCeiling' : 'withinCeiling'}`)) });
        if (over) {
          // Rule D8: name what drives the cost, so the person sees which levers to pull.
          const drivers = s.assessments.map((a) => ({ name: a.name, cost: (a.cost * a.visits * N) / 1e6 })).sort((a, b) => b.cost - a.cost).slice(0, 2);
          lines.push(`Over the budget's ceiling of ${s.ceiling} million USD by ${(median - s.ceiling).toFixed(1)}. The costliest assessments: ${drivers.map((d) => `${d.name}, ${d.cost.toFixed(1)} million`).join('; ')}.`);
        }
      }
    }
  }
  for (const f of s.earlier) sets.push({ subject: f, property: ls('forecastCurrency'), value: namedNode(lst('ForecastCurrency-outOfDate')) });
  // Protocol and sites: a site without the equipment an assessment needs takes no part, and a design signal says why.
  for (const site of excluded) {
    const missing = [...needs.entries()].filter(([kit]) => !site.equipment.has(kit)).flatMap(([kit, names]) => names.map((n) => `${n} (${kit})`));
    const text = `Cannot perform ${missing.join(', ')}, which the protocol needs, so its ${site.count === 1 ? 'site takes' : `${site.count} sites take`} no part in enrollment`;
    if (!s.raised.some((r) => r.about === site.iri && r.text === text)) {
      creates.push({
        key: `signal-${site.id}`,
        type: ls('DesignSignal'),
        values: [
          { property: ls('isAbout'), value: namedNode(site.iri) },
          { property: ls('designSignalStatus'), value: namedNode(lst('DesignSignalStatus-raised')) },
          { property: ls('designSignalText'), value: literal(text) },
        ],
      });
    }
    lines.push(`${site.name} cannot perform ${missing.join(', ')}, so ${site.count === 1 ? 'it takes' : `its ${site.count} sites take`} no part.`);
  }
  return { message: lines.join(' '), creates, sets };
}

export const referenceTrialModel: Model = { name: 'Reference trial model', version: '1.0', reference: true, run };

