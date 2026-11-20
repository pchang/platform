// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { NS } from '../ontology/ontology';
import { withSeed } from './node';
import { GatewayError } from './gateway';

// Acting on a set (platform spec 5.4): Compare study scenarios, a set method (domain spec 3.7).
vi.setConfig({ testTimeout: 60_000 });

const ls = (n: string) => `${NS.ls}${n}`;
const lst = (n: string) => `${NS.lst}${n}`;
const marcus = { person: `${NS.d}person-marcus`, role: ls('ClinicalOperationsLead') };
const ben = { person: `${NS.d}person-ben`, role: ls('ClinicalDataManager') };
const COMPARE = ls('CompareStudyScenarios');
const assumptions = {
  measures: ['lastPatientIn', 'totalCost', 'probabilityOfSuccess'].map((m) => lst(`OutcomeMeasure-${m}`)).join(' '),
  screenFailureRate: '48',
  dropoutRate: '15',
  controlResponse: '35',
  treatmentResponse: '46',
  saeRate: '6',
};

async function reasons(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof GatewayError) return error.reasons.join(' ');
    throw error;
  }
  return '';
}

describe('set methods (platform spec 5.4, Acting on a set)', () => {
  it('are offered only when the selection qualifies: type, count, the same parent, the role', async () => {
    const g = withSeed();
    const labels = async (ids: string[], who = marcus) => (await g.setMethods(who, ids)).map((m) => m.label);
    expect(await labels(['SSC-1', 'SSC-2'])).toEqual(['Compare study scenarios']);
    expect(await labels(['SSC-1', 'SSC-2', 'SSC-3'])).toEqual(['Compare study scenarios']);
    expect(await labels(['SSC-1'])).toEqual([]);
    // SSC-4 explores VELOCITY-2, not the VELOCITY-3 study concept.
    expect(await labels(['SSC-1', 'SSC-4'])).toEqual([]);
    expect(await labels(['SSC-1', 'PROT-31'])).toEqual([]);
    expect(await labels(['SSC-1', 'SSC-2'], ben)).toEqual([]);
  });

  it('never appear among one object’s methods, or as work on To do', async () => {
    const g = withSeed();
    expect((await g.methods(marcus, 'SSC-1')).map((m) => m.label)).not.toContain('Compare study scenarios');
    expect(await reasons(g.compose(marcus, 'SSC-1', COMPARE))).toContain('acts on a set');
    expect(await reasons(g.preview(marcus, 'SSC-1', COMPARE, { chosen: 'SSC-1', rationale: 'Alone' }))).toContain('acts on a set');
  });

  it('compose with the set as the choices, Compare and decide, and a comparison of current forecasts by measure', async () => {
    const g = withSeed();
    for (const s of ['SSC-1', 'SSC-3']) await g.commit(marcus, s, ls('RunTrialSimulation'), assumptions);
    await g.idle();
    const c = await g.composeSet(marcus, ['SSC-1', 'SSC-2', 'SSC-3'], COMPARE);
    expect(c.archetype.label).toBe('Compare and decide');
    expect(c.objects!.map((o) => o.identifier)).toEqual(['SSC-1', 'SSC-2', 'SSC-3']);
    expect(c.inputs.find((i) => i.name === 'chosen')!.choices!.map((x) => x.label.split(' · ')[0])).toEqual(['SSC-1', 'SSC-2', 'SSC-3']);
    const rows = c.comparison!.rows;
    expect(rows.map((r) => r.label)).toEqual(['Last patient in', 'Probability of success', 'Total cost']);
    const lpi = rows[0].cells;
    expect(lpi[0]).toMatchObject({ status: 'Against target: missed', urgent: true });
    // SSC-2 has not been simulated: its cells are empty, never invented.
    expect(lpi[1]).toBeNull();
    expect(lpi[2]).toMatchObject({ status: 'Against target: met' });
    expect(lpi[2]!.urgent).toBeUndefined();
  });

  it('commit once, on the chosen scenario: it is selected, the others set aside, a decision on their parent', async () => {
    const g = withSeed();
    const preview = await g.previewSet(marcus, ['SSC-1', 'SSC-2', 'SSC-3'], COMPARE, { chosen: 'SSC-3', rationale: 'Meets every target, within budget' });
    expect(preview.changes.filter((c) => c.propertyLabel === 'Status').map((c) => `${c.subjectLabel} ${c.newLabel}`).sort()).toEqual(['SSC-1 set aside', 'SSC-2 set aside', 'SSC-3 selected']);
    const result = await g.commitSet(marcus, ['SSC-1', 'SSC-2', 'SSC-3'], COMPARE, { chosen: 'SSC-3', rationale: 'Meets every target, within budget' });
    expect(result.created).toHaveLength(1);
    const decision = g.read(marcus, result.created[0]);
    expect(decision.title).toBe('Meets every target, within budget');
    expect(Object.values(decision.state)).toContain('select');
    const linked = Object.fromEntries(decision.links.filter((l) => l.one).map((l) => [l.relationship.split('#')[1], l.objects.map((o) => o.identifier)]));
    expect(linked.chooses).toEqual(['SSC-3']);
    expect(linked.decidesOn).toEqual(['STC-1']);
    // One commit, on the chosen scenario, naming the others.
    const along = g.commits().find((c) => c.commit === result.commit)!.alongWith!.map((o) => o.split('/').pop()).sort();
    expect(along).toEqual(['SSC-1', 'SSC-2']);
    // A set aside scenario no longer qualifies.
    expect(await g.setMethods(marcus, ['SSC-1', 'SSC-3'])).toEqual([]);
  });

  it('refuse a choice outside the set', async () => {
    const g = withSeed();
    expect(await reasons(g.commitSet(marcus, ['SSC-1', 'SSC-2'], COMPARE, { chosen: 'SSC-3', rationale: 'x' }))).toContain('must be one of the set');
  });
});
