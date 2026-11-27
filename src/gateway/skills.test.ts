// @vitest-environment node
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { NS, select } from '../ontology/ontology';
import { openGateway, withSeed } from './node';
import { GatewayError, type Gateway } from './gateway';
import { parseProposal, type SkillModel, type SkillRequest } from './skills';

// Skills (platform spec 3.3, Skills; 3.4, Skill proposals) and the Design and Plan skills (domain spec 3.9).
vi.setConfig({ testTimeout: 60_000 });

const ls = (n: string) => `${NS.ls}${n}`;
const lst = (n: string) => `${NS.lst}${n}`;
const marcus = { person: `${NS.d}person-marcus`, role: ls('ClinicalOperationsLead') };
const ben = { person: `${NS.d}person-ben`, role: ls('ClinicalDataManager') };
const SIMULATE = ls('RunTrialSimulation');
const COMPARE = ls('CompareStudyScenarios');
const measures = ['lastPatientIn', 'totalCost', 'probabilityOfSuccess'].map((m) => lst(`OutcomeMeasure-${m}`)).join(' ');

async function reasons(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof GatewayError) return error.reasons.join(' ');
    throw error;
  }
  return '';
}

const graphOf = (g: Gateway) => (g as unknown as { graph: { store: Parameters<typeof select>[0] } }).graph.store;

describe('the Design and Plan skills, as declared (domain spec 3.9)', () => {
  it('match the table: what each serves, owns and proposes, its version, approval and reference procedure', () => {
    const spec = readFileSync(join(import.meta.dirname, '../../spec/domain-life-sciences.md'), 'utf8');
    const section = spec.slice(spec.indexOf('### 3.9'), spec.indexOf('\n### ', spec.indexOf('### 3.9') + 1));
    const rows = section
      .split('\n')
      .filter((l) => l.startsWith('| ') && !l.startsWith('| Skill') && !l.startsWith('|---'))
      .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
    const store = graphOf(withSeed());
    const declared = select(store, `SELECT ?label ?serves ?owner ?version ?approved WHERE { ?s a p:Skill ; rdfs:label ?label ; p:serves/rdfs:label ?serves ;
        p:owner/rdfs:label ?owner ; p:skillVersion ?version ; p:approvedOn ?approved } ORDER BY ?label`);
    expect(declared.map((d) => [d.label, d.serves, d.owner])).toEqual(rows.map((r) => [r[0], r[1], r[2]]).sort((a, b) => a[0].localeCompare(b[0])));
    // "Each is version 1.0, approved on November 23, 2026."
    expect(section).toContain('version 1.0, approved on November 23, 2026');
    for (const d of declared) expect([d.version, d.approved]).toEqual(['1.0', '2026-11-23']);
    // What each proposes, by the inputs' labels.
    const proposes = (label: string) =>
      select(store, `SELECT ?l WHERE { ?s a p:Skill ; rdfs:label "${label}" ; p:proposesInput/rdfs:label ?l }`).map((r) => r.l.replace(', percent', '').toLowerCase());
    expect(proposes('Simulation assumptions').sort()).toEqual(['dropout rate', 'response on control', 'response on treatment', 'screen failure rate', 'serious adverse events per 100 patient-years']);
    expect(proposes('Recommend a study scenario')).toEqual(['scenario to select']);
    // Neither proposes what must be the person's choice or words: the measures, the rationale.
    expect(select(store, `SELECT ?i WHERE { ?s a p:Skill ; p:proposesInput ?i . ?i p:inputName ?n FILTER(?n IN ("measures", "rationale")) }`)).toEqual([]);
  });
});

describe('Simulation assumptions, by its reference procedure', () => {
  it('reuses the values recorded on the scenario’s most recent simulation, cites it, and is recorded', async () => {
    const g = withSeed();
    const { proposals, notRun } = await g.propose(marcus, ['SSC-1'], SIMULATE);
    expect(notRun).toEqual([]);
    expect(proposals).toHaveLength(1);
    const p = proposals[0];
    expect(p).toMatchObject({ label: 'Simulation assumptions', version: '1.0', ranBy: { procedure: 'reuse recorded inputs' } });
    expect(p.values.map((v) => [v.name, v.value])).toEqual([
      ['screenFailureRate', '48'],
      ['dropoutRate', '15'],
      ['controlResponse', '35'],
      ['treatmentResponse', '46'],
      ['saeRate', '6'],
    ]);
    expect(p.restsOn.map((r) => r.identifier)).toEqual(['TS-1']);
    expect(p.reasoning).toContain('TS-1, the most recent trial simulation of SSC-1, as of Nov 19, 2026');
    expect(p.reasoning).toContain('does not judge');
    // Recorded before it is shown, and nothing else changed.
    const store = graphOf(g);
    const recorded = select(store, `SELECT ?skill ?ran ?person ?role WHERE { GRAPH <${p.proposal}> { <${p.proposal}> a p:Proposal ; p:proposedBy ?skill ; p:ranBy ?ran ;
        prov:wasAssociatedWith ?person ; p:actedAs ?role ; p:proposalFor ${'<' + `${NS.d}SSC-1` + '>'} } }`);
    expect(recorded).toEqual([{ skill: ls('SimulationAssumptions'), ran: 'reuse recorded inputs', person: marcus.person, role: marcus.role }]);
    expect(select(store, `SELECT ?v WHERE { GRAPH <${p.proposal}> { ?x p:valueOf ${'<' + ls('RunTrialSimulation-saeRate') + '>'} ; p:proposedAs ?v } }`)[0].v).toBe('6');
  });

  it('uses the most recent simulation of another scenario of the same study concept when the scenario has none', async () => {
    // A fourth scenario of STC-1, never simulated.
    const g = withSeed([
      `@prefix ls: <${NS.ls}> . @prefix lst: <${NS.lst}> . @prefix d: <${NS.d}> .
       d:SSC-9 a ls:StudyScenario ; ls:identifier "SSC-9" ; ls:studyScenarioStatus lst:StudyScenarioStatus-draft ; ls:explores d:STC-1 ;
         ls:scenarioChange "Adds a second dose arm" .`,
    ]);
    const { proposals } = await g.propose(marcus, ['SSC-9'], SIMULATE);
    const p = proposals[0];
    // TS-1, TS-2 and TS-3 are all as of Nov 19; the latest by date, then by identifier, is TS-3.
    expect(p.restsOn.map((r) => r.identifier)).toEqual(['TS-3']);
    expect(p.reasoning).toMatch(/^SSC-9 has none of its own yet, so these are carried over from TS-3, the most recent trial simulation of SSC-3/);
    expect(p.values.find((v) => v.name === 'treatmentResponse')?.value).toBe('46');
  });

  it('says why when there is nothing to reuse, and records nothing', async () => {
    const g = withSeed();
    // SSC-4 explores the VELOCITY-2 study, whose scenarios have no simulations.
    const { proposals, notRun } = await g.propose(marcus, ['SSC-4'], SIMULATE);
    expect(proposals).toEqual([]);
    expect(notRun).toEqual([{ skill: ls('SimulationAssumptions'), label: 'Simulation assumptions', reason: expect.stringContaining('Nothing earlier to reuse') }]);
    expect(select(graphOf(g), `SELECT ?p WHERE { GRAPH ?p { ?p a p:Proposal } }`)).toEqual([]);
  });

  it('runs only for roles that may run the method, and not before its approval', async () => {
    expect(await reasons(withSeed().propose(ben, ['SSC-1'], SIMULATE))).toContain('cannot');
    const early = withSeed([], { now: () => new Date('2026-11-20T12:00:00Z') });
    expect(await early.propose(marcus, ['SSC-1'], SIMULATE)).toEqual({ proposals: [], notRun: [] });
  });

  it('a commit from the proposal records it and which values were kept or changed', async () => {
    const g = withSeed();
    const p = (await g.propose(marcus, ['SSC-1'], SIMULATE)).proposals[0];
    const inputs = { measures, ...Object.fromEntries(p.values.map((v) => [v.name, v.value])), dropoutRate: '18' };
    const result = await g.commit(marcus, 'SSC-1', SIMULATE, inputs, undefined, undefined, p.proposal);
    expect(result.fromProposal).toEqual({ proposal: p.proposal, kept: ['controlResponse', 'saeRate', 'screenFailureRate', 'treatmentResponse'], changed: ['dropoutRate'] });
    const store = graphOf(g);
    expect(select(store, `SELECT ?p WHERE { GRAPH <${result.commit}> { <${result.commit}> p:fromProposal ?p } }`)[0].p).toBe(p.proposal);
    expect(select(store, `SELECT ?i WHERE { GRAPH <${result.commit}> { <${result.commit}> p:changedInput ?i } }`).map((r) => r.i)).toEqual([ls('RunTrialSimulation-dropoutRate')]);
    // A proposal belongs to its method and objects.
    expect(await reasons(g.commit(marcus, 'SSC-2', SIMULATE, inputs, undefined, undefined, p.proposal))).toContain('other objects');
  });
});

describe('Recommend a study scenario, by its reference procedure', () => {
  it('recommends the scenario with the fewest forecasts that miss, says what each gives up, and pre-fills the choice only', async () => {
    const g = withSeed();
    const { proposals } = await g.propose(marcus, ['SSC-1', 'SSC-2', 'SSC-3'], COMPARE);
    const p = proposals[0];
    expect(p).toMatchObject({ label: 'Recommend a study scenario', ranBy: { procedure: 'rank by comparison' }, recommended: { identifier: 'SSC-3' } });
    expect(p.values).toEqual([expect.objectContaining({ name: 'chosen', value: `${NS.d}SSC-3`, valueLabel: expect.stringMatching(/^SSC-3 · /) })]);
    expect(p.reasoning).toMatch(/^SSC-3 is the only one with nothing flagged in the comparison\. SSC-1: /);
    expect(p.reasoning).toContain('SSC-1: Last patient in missed, Total cost missed');
    expect(p.reasoning).toContain('does not weigh');
    expect(p.restsOn.map((r) => r.identifier)).toEqual(expect.arrayContaining(['SSC-1', 'SSC-2', 'SSC-3', 'FC-11', 'FC-12']));
  });

  it('recommends none on a tie', async () => {
    const g = withSeed();
    // SSC-1 and SSC-2 each miss two targets.
    const p = (await g.propose(marcus, ['SSC-1', 'SSC-2'], COMPARE)).proposals[0];
    expect(p.recommended).toBeUndefined();
    expect(p.values).toEqual([]);
    expect(p.reasoning).toMatch(/^No recommendation: SSC-1 and SSC-2 tie\./);
  });

  it('a commit records whether the person followed the recommendation, and the rationale stays theirs', async () => {
    const g = withSeed();
    const p = (await g.propose(marcus, ['SSC-1', 'SSC-2', 'SSC-3'], COMPARE)).proposals[0];
    const result = await g.commitSet(marcus, ['SSC-1', 'SSC-2', 'SSC-3'], COMPARE, { chosen: 'SSC-2', rationale: 'Faster to first patient' }, p.proposal);
    expect(result.fromProposal).toEqual({ proposal: p.proposal, kept: [], changed: ['chosen'], followedRecommendation: false });
  });
});

describe('a skill run by a connected model', () => {
  const fakeModel = (answer: (r: SkillRequest) => Promise<unknown>, calls: SkillRequest[] = []): SkillModel => ({
    model: 'test-model',
    async propose(request) {
      calls.push(request);
      return { ...parseProposal(await answer(request)), model: 'test-model-1' };
    },
  });

  it('follows the instructions, reads as the person, and keeps only values that check and sources it read', async () => {
    const calls: SkillRequest[] = [];
    const model = fakeModel(async (r) => {
      await r.toolbox.run('read_object', { identifier: 'TS-1' });
      return {
        values: [
          { name: 'screenFailureRate', value: '52', rests_on: ['TS-1', 'PROT-99'] },
          { name: 'dropoutRate', value: 'about 15', rests_on: [] },
          { name: 'measures', value: '3', rests_on: [] },
        ],
        recommended: '',
        reasoning: 'Wider eligibility in SSC-2 raises screen failures.',
        rests_on: ['TS-1', 'SSC-2', 'AE-999'],
      };
    }, calls);
    const g = withSeed([], { skillModel: model });
    const p = (await g.propose(marcus, ['SSC-2'], SIMULATE)).proposals[0];
    expect(calls[0].instructions).toContain('as a biostatistician at this sponsor would');
    expect(calls[0].inputs.map((i) => i.name)).toEqual(['screenFailureRate', 'dropoutRate', 'controlResponse', 'treatmentResponse', 'saeRate']);
    expect(calls[0].records[0]).toContain('SSC-2');
    expect(p.ranBy).toEqual({ model: 'test-model-1' });
    // Not a number, and not an input the skill proposes: dropped. Unread objects: never cited.
    expect(p.values.map((v) => [v.name, v.value, v.restsOn.map((r) => r.identifier)])).toEqual([['screenFailureRate', '52', ['TS-1']]]);
    expect(p.restsOn.map((r) => r.identifier)).toEqual(['TS-1', 'SSC-2']);
  });

  it('recommends only one of the set', async () => {
    const g = withSeed([], { skillModel: fakeModel(async () => ({ values: [], recommended: 'SSC-2', reasoning: 'Fastest.', rests_on: [] })) });
    const p = (await g.propose(marcus, ['SSC-1', 'SSC-2', 'SSC-3'], COMPARE)).proposals[0];
    expect(p.recommended?.identifier).toBe('SSC-2');
    expect(p.values).toEqual([expect.objectContaining({ name: 'chosen', value: `${NS.d}SSC-2` })]);
    const outside = withSeed([], { skillModel: fakeModel(async () => ({ values: [], recommended: 'SSC-4', reasoning: 'Elsewhere.', rests_on: [] })) });
    const fell = (await outside.propose(marcus, ['SSC-1', 'SSC-2', 'SSC-3'], COMPARE)).proposals[0];
    expect(fell).toMatchObject({ ranBy: { procedure: 'rank by comparison' }, fellBack: expect.stringContaining('reference procedure ran instead'), recommended: { identifier: 'SSC-3' } });
  });

  it('falls back to the reference procedure when the model fails, and says so in the record', async () => {
    const g = withSeed([], { skillModel: fakeModel(async () => Promise.reject(new Error('overloaded'))) });
    const p = (await g.propose(marcus, ['SSC-1'], SIMULATE)).proposals[0];
    expect(p).toMatchObject({ ranBy: { procedure: 'reuse recorded inputs' }, fellBack: expect.stringContaining('could not propose') });
    expect(select(graphOf(g), `SELECT ?f WHERE { GRAPH <${p.proposal}> { <${p.proposal}> p:fellBack ?f } }`)).toHaveLength(1);
  });
});

describe('proposals in the journal', () => {
  it('are journaled and survive a restart', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'skills-')), 'journal.jsonl');
    const g = openGateway(path);
    const p = (await g.propose(marcus, ['SSC-1'], SIMULATE)).proposals[0];
    expect(readFileSync(path, 'utf8').trim().split('\n').map((l) => JSON.parse(l).kind)).toContain('proposal');
    const again = openGateway(path);
    const next = (await again.propose(marcus, ['SSC-1'], SIMULATE)).proposals[0];
    expect(next.proposal).not.toBe(p.proposal);
    expect(select(graphOf(again), `SELECT ?p WHERE { GRAPH ?p { ?p a p:Proposal } }`)).toHaveLength(2);
  });
});
