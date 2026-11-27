// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { NS, select } from '../ontology/ontology';
import { withSeed } from './node';
import { GatewayError, type Gateway } from './gateway';

// Measures and observations (platform spec 3.2; domain spec 3.10): the Phase II study's vital signs, checked against
// Blood Pressure, with the values read from a Dataset-JSON file and only the ones that need action made objects.
vi.setConfig({ testTimeout: 60_000 });

const p = (n: string) => `${NS.p}${n}`;
const ls = (n: string) => `${NS.ls}${n}`;
const ben = { person: `${NS.d}person-ben`, role: ls('ClinicalDataManager') };
const noor = { person: `${NS.d}person-noor`, role: p('StructureSteward') };
const CHECK = p('CheckObservations');

const storeOf = (g: Gateway) => (g as unknown as { graph: { store: Parameters<typeof select>[0] } }).graph.store;

async function reasons(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof GatewayError) return error.reasons.join(' ');
    throw error;
  }
  return '';
}

describe('a measure as shapes, browsable as structure', () => {
  it('defines Blood Pressure once, its components with their units and plausible ranges', () => {
    const g = withSeed();
    const bp = g.read(noor, 'BloodPressure');
    expect(bp).toMatchObject({ typeLabel: 'Measure', title: 'Blood Pressure' });
    const systolic = g.read(noor, 'BloodPressure-systolic');
    expect(systolic.properties).toMatchObject({ unit: 'mmHg', 'lowest plausible': '60', 'highest plausible': '250' });
  });
});

describe('checking a dataset version (platform spec 3.2)', () => {
  it('counts what was expected, received, missing and not allowed, and makes data points of only those that need action', async () => {
    const g = withSeed();
    const preview = await g.preview(ben, 'DSV-1', CHECK);
    // Twenty completed visits, two components each; the week 12 visits are not completed, so nothing is expected of them.
    const counts = Object.fromEntries(preview.changes.filter((c) => c.subjectLabel === 'DSV-1' && c.newValue).map((c) => [c.propertyLabel, c.newValue]));
    expect(counts).toMatchObject({ expected: '40', received: '39', missing: '1', 'not allowed': '1' });
    expect(preview.created).toHaveLength(2);

    const result = await g.commit(ben, 'DSV-1', CHECK);
    const points = result.created.map((iri) => g.read(ben, iri));
    expect(points.map((x) => [x.title, x.state.Kind])).toEqual([
      ['Missing: Diastolic blood pressure, Week 8 visit for PT-04', 'missing'],
      ['Not allowed: Systolic blood pressure, Week 4 visit for PT-07', 'not allowed'],
    ]);
    expect(points[1].properties).toMatchObject({ value: '310', unit: 'mmHg', why: '310 mmHg is above the plausible 250' });
    expect(g.read(ben, 'DSV-1').state.Status).toBe('checked');
    // The values themselves stay in the file: the graph holds two data points, not 39 rows.
    expect(select(storeOf(g), `SELECT ?x WHERE { ?x a p:DataPoint }`)).toHaveLength(2);
    // On the Clinical Data Manager's Home.
    const metrics = Object.fromEntries((await g.home(ben)).metrics.map((m) => [m.label, m.count]));
    expect(metrics).toMatchObject({ 'Missing observations': 1, 'Observations not allowed': 1 });
    // Checked once.
    expect(await reasons(g.commit(ben, 'DSV-1', CHECK))).toContain('already been checked');
  });

  it('expects only completed visits, and follows the protocol: an assessment that no longer measures blood pressure expects nothing', async () => {
    const g = withSeed();
    const store = storeOf(g) as unknown as { update(q: string): void };
    store.update(`DELETE WHERE { <${NS.d}AS-VS> <${NS.p}measures> ?m }`);
    const preview = await g.preview(ben, 'DSV-1', CHECK);
    expect(preview.created).toHaveLength(0);
    expect(preview.changes.find((c) => c.propertyLabel === 'expected')?.newValue).toBe('0');
  });

  it('says why when the file cannot be read, and changes nothing', async () => {
    const g = withSeed([], { datasets: () => undefined });
    expect(await reasons(g.commit(ben, 'DSV-1', CHECK))).toContain('cannot be read');
    expect(g.read(ben, 'DSV-1').state.Status).toBe('loaded');
  });

  it('is run by the Clinical Data Manager, not by every role', async () => {
    const g = withSeed();
    const chloe = { person: `${NS.d}person-chloe`, role: ls('DrugSafetyPhysician') };
    expect(await reasons(g.commit(chloe, 'DSV-1', CHECK))).toContain('cannot run');
  });
});
