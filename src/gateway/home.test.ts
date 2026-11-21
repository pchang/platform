// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { NS } from '../ontology/ontology';
import { withSeed } from './node';

// Home (platform spec 5.1; domain spec section 6, Home metrics): metrics from the ontology, lifecycles from the types.
vi.setConfig({ testTimeout: 30_000 });

const ls = (n: string) => `${NS.ls}${n}`;
const as = (person: string, role: string) => ({ person: `${NS.d}${person}`, role: ls(role) });
const ben = as('person-ben', 'ClinicalDataManager');
const ada = as('person-ada', 'ComputationalChemist');
const marcus = as('person-marcus', 'ClinicalOperationsLead');
// The seed's week: two visits are overdue on November 12, 2026 (domain spec section 11).
const now = () => new Date('2026-11-12T12:00:00Z');

describe('Home', () => {
  it('counts each watched metric with its health, from the thresholds in the ontology', () => {
    const home = withSeed([], { now }).home(ben);
    const metrics = Object.fromEntries(home.metrics.map((m) => [m.label, `${m.count} of ${m.total}: ${m.health}`]));
    expect(metrics).toEqual({
      'Open data queries': '3 of 8: watch',
      'Data records awaiting verification': '14 of 40: watch',
      'Adverse events awaiting reconciliation': '2 of 5: watch',
      'Overdue visits': '2 of 30: watch',
    });
  });

  it('leaves a metric without thresholds as information only, and counts all of a metric’s dimensions together', () => {
    const chemist = withSeed([], { now }).home(ada);
    expect(chemist.metrics.find((m) => m.label === 'Candidates')).toMatchObject({ count: 1 });
    expect(chemist.metrics.find((m) => m.label === 'Candidates')!.health).toBeUndefined();
    // Forecasts missing their target must be current and missed: the seed's three are current, none missed.
    expect(withSeed([], { now }).home(marcus).metrics.find((m) => m.label === 'Forecasts missing their target')).toMatchObject({ count: 0, health: 'on track' });
  });

  it('shows where things stand for each type of the person’s work, stage by stage in lifecycle order', () => {
    const home = withSeed([], { now }).home(ben);
    const queries = home.lifecycles.find((l) => l.label === 'Data Query')!;
    expect(queries.dimension).toBe('Status');
    expect(queries.stages.map((s) => `${s.label} ${s.count}`)).toEqual(['open 3', 'answered 3', 'closed 2']);
    expect(home.lifecycles.map((l) => l.pluralLabel)).toEqual(expect.arrayContaining(['Patients', 'Protocols', 'Studies']));
  });

  it('shows what needs attention first, and lifecycles, never classifications', () => {
    const marcusHome = withSeed([], { now }).home(marcus);
    const order = marcusHome.metrics.map((m) => m.health ?? 'information');
    expect(order).toEqual([...order].sort((a, b) => ['at risk', 'watch', 'on track', 'information'].indexOf(a) - ['at risk', 'watch', 'on track', 'information'].indexOf(b)));
    // A study's phase classifies it; its status is its lifecycle.
    expect(withSeed([], { now }).home(ben).lifecycles.find((l) => l.label === 'Study')!.dimension).toBe('Status');
    // The types the person's metrics count stand beside their navigation's, such as a planner's budgets, design signals and forecasts.
    expect(marcusHome.lifecycles.map((l) => l.pluralLabel)).toEqual(expect.arrayContaining(['Study Budgets', 'Design Signals', 'Forecasts']));
    // A proposed site's only state classifies it, so it has no lifecycle to show.
    expect(marcusHome.lifecycles.map((l) => l.pluralLabel)).not.toContain('Proposed Sites');
  });

  it('opens a metric on exactly the objects it counts, as long as the role may read them', () => {
    const g = withSeed([], { now });
    const queries = g.metricObjects(ben, 'Metric-OpenDataQueries');
    expect(queries.metric).toMatchObject({ label: 'Open data queries', count: 3, health: 'watch' });
    expect(queries.objects.every((o) => Object.values(o.state).includes('open'))).toBe(true);
    // The count on Home and the list behind it agree.
    for (const m of g.home(ben).metrics) expect(g.metricObjects(ben, m.metric).objects, m.label).toHaveLength(m.count);
    expect(g.metricObjects(ben, 'Metric-OverdueVisits').objects).toHaveLength(2);
    expect(() => g.metricObjects(ada, 'Metric-OverdueVisits')).toThrow(/cannot read/);
  });

  it('counts what the person has done in the last 7 days', async () => {
    const g = withSeed([], { now });
    expect(g.home(ben).doneLast7Days).toBe(0);
    await g.commit(ben, 'Q-04', ls('CloseQuery'));
    expect(g.home(ben).doneLast7Days).toBe(1);
  });
});
