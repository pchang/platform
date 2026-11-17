import { describe, expect, it } from 'vitest';
import { NS } from '../ontology/ontology';
import { withSeed } from './node';

// At a glance (platform spec 5.1; domain spec section 6, At a glance), on the seed graph as of 15 November 2026.
const morgan = { person: `${NS.d}person-morgan`, role: `${NS.ls}ClinicalProgramLead` };
const ben = { person: `${NS.d}person-ben`, role: `${NS.ls}ClinicalDataManager` };
const ada = { person: `${NS.d}person-ada`, role: `${NS.ls}ComputationalChemist` };
const chloe = { person: `${NS.d}person-chloe`, role: `${NS.ls}DrugSafetyPhysician` };
const now = () => new Date('2026-11-15T09:00:00Z');

describe('At a glance', () => {
  it('lists the initiatives a person may read, and opens on them for a role that oversees them', () => {
    const gateway = withSeed([], { now });
    expect(gateway.glanceList(morgan)).toMatchObject({ initiatives: [{ identifier: 'ST-01' }], oversees: true });
    expect(gateway.glanceList(ben)).toMatchObject({ initiatives: [{ identifier: 'ST-01' }], oversees: false });
  });

  it('refuses an object that is not an initiative', () => {
    expect(() => withSeed([], { now }).glance(morgan, 'PT-03')).toThrow('not an initiative');
  });

  it('scopes a study to what it contains, its own links, and what is reached along the relationships it names', () => {
    const view = withSeed([], { now }).glance(morgan, 'ST-01');
    const counts = Object.fromEntries(view.progress.map((p) => [p.pluralLabel, p.count]));
    // Contained: patients, and within them visits, adverse events, data records and queries.
    expect(counts).toMatchObject({ Patients: 12, Visits: 30, 'Adverse Events': 5, 'Data Records': 40, 'Data Queries': 8 });
    // Its own links: sites, protocol versions and formulations.
    expect(counts).toMatchObject({ Sites: 3, Formulations: 1 });
    // Reached: the safety cases from its adverse events, and the batches its patients received.
    expect(counts['Safety Cases']).toBe(2);
    expect(counts.Batches).toBeGreaterThan(0);
    // Not reached: signals, products and the compounds of discovery.
    expect(Object.keys(counts)).not.toContain('Signals');
    expect(Object.keys(counts)).not.toContain('Compounds');
  });

  it('counts each type along its lifecycle, main path then exits, with how far along they are', () => {
    const patients = withSeed([], { now }).glance(morgan, 'ST-01').progress.find((p) => p.pluralLabel === 'Patients')!;
    expect(patients.dimension).toBe('Enrollment');
    expect(patients.stages).toEqual([
      { stage: 'screened', count: 1 },
      { stage: 'consented', count: 1 },
      { stage: 'randomized', count: 10 },
      { stage: 'completed', count: 0 },
      { stage: 'withdrawn', count: 0, exit: true },
    ]);
    // (0 + 1/3 + 10 × 2/3) / 12
    expect(patients.along).toBeCloseTo((0 + 1 / 3 + (10 * 2) / 3) / 12);
  });

  it('judges health by each rule, the worst deciding, with the numbers behind each', () => {
    const view = withSeed([], { now }).glance(morgan, 'ST-01');
    const rule = (label: string) => view.rules.find((r) => r.label === label)!;
    expect(rule('Data awaiting verification')).toMatchObject({ count: 14, total: 40, value: 0.35, atRiskAbove: 0.25, offTrackAbove: 0.5, health: 'atRisk' });
    expect(rule('Serious events not yet with safety')).toMatchObject({ measure: 'urgent', count: 2, health: 'atRisk' });
    expect(rule('Missed visits')).toMatchObject({ measure: 'share', stateLabel: 'missed', count: 0, health: 'onTrack' });
    expect(rule('Overdue visits')).toMatchObject({ measure: 'overdue', count: 5, health: 'offTrack' });
    expect(view.health).toBe('offTrack');
    // Worst first.
    expect(view.rules[0].health).toBe('offTrack');
  });

  it('does not count a deadline that has been met: a completed visit is not overdue', () => {
    const visits = withSeed([], { now }).glance(morgan, 'ST-01').progress.find((p) => p.pluralLabel === 'Visits')!;
    expect(visits.stages.find((s) => s.stage === 'completed')!.count).toBe(20);
    expect(visits.overdue).toBe(5);
  });

  it('moves with the work: completing an overdue visit takes it off the count', async () => {
    const gateway = withSeed([], { now });
    const sam = { person: `${NS.d}person-sam`, role: `${NS.ls}ClinicalResearchCoordinator` };
    await gateway.commit(sam, 'V-01-3', `${NS.ls}CompleteVisit`);
    expect(gateway.glance(morgan, 'ST-01').rules.find((r) => r.label === 'Overdue visits')!.count).toBe(4);
  });

  it('lists what needs attention, urgent or overdue, nearest deadline first', () => {
    const attention = withSeed([], { now }).glance(morgan, 'ST-01').attention.map((a) => a.object.identifier);
    expect(attention.slice(0, 5)).toEqual(['V-01-3', 'V-02-3', 'V-03-3', 'V-04-3', 'V-05-3']);
    expect(attention).toEqual(expect.arrayContaining(['AE-003', 'AE-005']));
  });

  it('counts only what the person may read, and leaves out the rules about what they may not', () => {
    const view = withSeed([], { now }).glance(ada, 'ST-01');
    const types = view.progress.map((p) => p.pluralLabel);
    expect(types).not.toContain('Patients');
    expect(types).not.toContain('Visits');
    expect(view.rules.find((r) => r.label === 'Missed visits')!.health).toBe('hidden');
    expect(view.attention.map((a) => a.object.type)).not.toContain(`${NS.ls}Visit`);
  });

  it('gives the same view to anyone who may read it, not only the overseeing role', () => {
    expect(withSeed([], { now }).glance(chloe, 'ST-01').health).toBe('offTrack');
  });
});
