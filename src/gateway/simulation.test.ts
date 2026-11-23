// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { NS } from '../ontology/ontology';
import { withSeed } from './node';
import { GatewayError } from './gateway';

// Trial simulation of a study scenario (domain spec 3.4.4) as a model run (platform spec 3.4, Model runs).
vi.setConfig({ testTimeout: 60_000 });

const ls = (n: string) => `${NS.ls}${n}`;
const lst = (n: string) => `${NS.lst}${n}`;
const marcus = { person: `${NS.d}person-marcus`, role: ls('ClinicalOperationsLead') };
const ben = { person: `${NS.d}person-ben`, role: ls('ClinicalDataManager') };
const STUDY_MEASURES = ['lastPatientIn', 'totalCost', 'probabilityOfSuccess', 'seriousAdverseEvents', 'patientBurden', 'siteBurden'];
const assumptions = (overrides: Record<string, string> = {}) => ({
  measures: STUDY_MEASURES.map((m) => lst(`OutcomeMeasure-${m}`)).join(' '),
  screenFailureRate: '48',
  dropoutRate: '15',
  controlResponse: '35',
  treatmentResponse: '46',
  saeRate: '6',
  ...overrides,
});

async function simulate(scenario: string, inputs = assumptions(), gateway = withSeed()) {
  await gateway.commit(marcus, scenario, ls('RunTrialSimulation'), inputs);
  await gateway.idle();
  const simulation = gateway.read(marcus, scenario).links.find((l) => l.relationship === ls('simulates'))!.objects.at(-1)!;
  const forecasts = gateway.read(marcus, simulation.identifier).links.find((l) => l.relationship === ls('forecastFrom'))!.objects;
  const value = (title: string) => forecasts.map((f) => gateway.read(marcus, f.identifier)).find((f) => f.title.startsWith(title))!;
  return { gateway, simulation, forecasts, value };
}

const median = (f: { properties: Record<string, string> }) => Number(f.properties.median);
const states = (f: { state: Record<string, string> }) => Object.values(f.state);

describe('Run trial simulation', () => {
  it('starts and tracks, offers the measures of one study as checkboxes, and asks for numbers', async () => {
    const gateway = withSeed();
    const composition = await gateway.compose(marcus, 'SSC-1', ls('RunTrialSimulation'));
    expect(composition.archetype.label).toBe('Start and track');
    const measures = composition.inputs.find((i) => i.name === 'measures')!;
    expect(measures.many).toBe(true);
    expect(measures.choices!.map((c) => c.label)).toEqual(['last patient in', 'probability of success', 'total cost', 'serious adverse events', 'patient burden', 'site burden']);
    expect(composition.inputs.filter((i) => i.kind === 'number').map((i) => i.name)).toEqual(['screenFailureRate', 'dropoutRate', 'controlResponse', 'treatmentResponse', 'saeRate']);
  });

  it('refuses a measure of a development option, a value that is not a number, and roles that do not plan', async () => {
    const gateway = withSeed();
    const refused = async (inputs: Record<string, string>, who = marcus) => {
      try {
        await gateway.preview(who, 'SSC-1', ls('RunTrialSimulation'), inputs);
      } catch (error) {
        if (error instanceof GatewayError) return error.reasons.join(' ');
      }
      return '';
    };
    expect(await refused(assumptions({ measures: lst('OutcomeMeasure-timeToSubmission') }))).toContain('not an allowed value');
    expect(await refused(assumptions({ dropoutRate: 'twelve' }))).toContain('must be a number');
    expect(await refused(assumptions(), ben)).toContain('cannot run');
  });

  it('forecasts each chosen measure from the scenario, against its targets, and says it is a reference model', async () => {
    const { simulation, forecasts, value, gateway } = await simulate('SSC-1');
    expect(forecasts).toHaveLength(6);
    expect(gateway.read(marcus, simulation.identifier).properties.model).toContain('not validated');
    const lpi = value('Last patient in');
    expect(lpi.links.find((l) => l.relationship === ls('measuredAgainst'))!.objects[0].identifier).toBe('OT-1');
    // Patient burden is the schedule's minutes on site: 20×6 + 10×6 + 15×5 + 10×6 + 45 + 90×3 minutes.
    expect(median(value('Patient burden'))).toBeCloseTo((120 + 60 + 75 + 60 + 45 + 270) / 60, 1);
    const notification = gateway.notifications(marcus).at(-1)!;
    expect(notification.message).toMatch(/^Reference trial model, not validated for decisions about real studies\./);
  });

  it('only forecasts the measures chosen', async () => {
    const { forecasts } = await simulate('SSC-1', assumptions({ measures: lst('OutcomeMeasure-lastPatientIn') }));
    expect(forecasts).toHaveLength(1);
  });

  it('gives the same forecasts for the same scenario and assumptions', async () => {
    const a = await simulate('SSC-1');
    const b = await simulate('SSC-1');
    expect(median(a.value('Last patient in'))).toBe(median(b.value('Last patient in')));
    expect(median(a.value('Total cost'))).toBe(median(b.value('Total cost')));
  });

  it('makes the scenario’s earlier forecasts out of date', async () => {
    const first = await simulate('SSC-1');
    const second = await simulate('SSC-1', assumptions(), first.gateway);
    const old = first.forecasts.map((f) => second.gateway.read(marcus, f.identifier));
    expect(old.every((f) => states(f).includes('out of date'))).toBe(true);
  });

  it('seeds VELOCITY-3’s scenarios with the model’s own output: running it again gives every seeded figure', async () => {
    // The seed's TS-1 to TS-3 were written by this model (domain spec section 11): never invented, and kept in step with it.
    const seeded = withSeed();
    const figures = (g: ReturnType<typeof withSeed>, simulation: string) =>
      g.read(marcus, simulation).links.find((l) => l.relationship === ls('forecastFrom'))!.objects
        .map((f) => g.read(marcus, f.identifier))
        .map((f) => `${f.title} (${f.properties.low} to ${f.properties.high}) ${f.state['Against target']}`)
        .sort();
    const recorded = (g: ReturnType<typeof withSeed>, simulation: string) => {
      const { properties } = g.read(marcus, simulation);
      return Object.fromEntries(Object.entries(properties).filter(([k]) => !/as of/i.test(k)));
    };
    for (const [scenario, simulation, overrides] of [
      ['SSC-1', 'TS-1', {}],
      ['SSC-2', 'TS-2', { screenFailureRate: '33', treatmentResponse: '43' }],
      ['SSC-3', 'TS-3', {}],
    ] as const) {
      expect(seeded.read(marcus, scenario).links.find((l) => l.relationship === ls('simulates'))!.objects.map((o) => o.identifier)).toEqual([simulation]);
      const again = await simulate(scenario, assumptions(overrides));
      expect(figures(again.gateway, again.simulation.identifier), scenario).toEqual(figures(seeded, simulation));
      expect(recorded(again.gateway, again.simulation.identifier), scenario).toEqual(recorded(seeded, simulation));
    }
  });

  describe('the three elements move each other', () => {
    it('protocol → sites: sites without MRI take no part while the protocol needs it, and a design signal says why', async () => {
      const { gateway } = await simulate('SSC-1');
      const ireland = gateway.read(marcus, 'PS-3');
      const signals = ireland.links.find((l) => l.relationship === ls('isAbout'))!.objects;
      expect(signals.map((s) => s.title)).toEqual([expect.stringContaining('Cannot perform MRI of both hands (MRI)')]);
      // Without hand MRI, sites in Poland and Brazil, which have no MRI, take part.
      const reduced = await simulate('SSC-3');
      expect(reduced.gateway.read(marcus, 'PS-5').links.find((l) => l.relationship === ls('isAbout'))!.objects).toEqual([]);
    });

    it('protocol and sites → budget: the budget takes the forecast total and its fit against the ceiling', async () => {
      const baseline = await simulate('SSC-1');
      const reduced = await simulate('SSC-3');
      const budget = (g: typeof baseline.gateway, id: string) => g.read(marcus, id);
      const total = (b: ReturnType<typeof budget>) => Number(b.properties.total);
      expect(total(budget(baseline.gateway, 'SB-1'))).toBe(median(baseline.value('Total cost')));
      // Dropping hand MRI and adding lower-cost countries costs less.
      expect(median(reduced.value('Total cost'))).toBeLessThan(median(baseline.value('Total cost')));
      expect(states(budget(baseline.gateway, 'SB-1'))).toContain('over ceiling');
      expect(states(budget(reduced.gateway, 'SB-3'))).toContain('within ceiling');
      expect(baseline.gateway.notifications(marcus).at(-1)!.message).toContain('The costliest assessments: MRI of both hands');
    });

    it('sites and eligibility → enrollment: more sites, faster screening or fewer screen failures finish sooner', async () => {
      const baseline = await simulate('SSC-1');
      const broader = await simulate('SSC-3');
      const relaxed = await simulate('SSC-2', assumptions({ screenFailureRate: '33', treatmentResponse: '43' }));
      expect(median(broader.value('Last patient in'))).toBeLessThan(median(baseline.value('Last patient in')));
      expect(median(relaxed.value('Last patient in'))).toBeLessThan(median(baseline.value('Last patient in')));
      // A broader population with a smaller assumed effect is less likely to succeed.
      expect(median(relaxed.value('Probability of success'))).toBeLessThan(median(baseline.value('Probability of success')));
    });
  });
});
