import { describe, expect, it } from 'vitest';
import { NS } from '../ontology/ontology';
import { withSeed } from './node';

// An object's journey along its lifecycle (platform spec 5.1, Journey; 3.1, exits).
const ben = { person: `${NS.d}person-ben`, role: `${NS.ls}ClinicalDataManager` };
const chloe = { person: `${NS.d}person-chloe`, role: `${NS.ls}DrugSafetyPhysician` };

const PREFIXES = `@prefix d: <${NS.d}> . @prefix ls: <${NS.ls}> . @prefix lst: <${NS.lst}> .`;
/** A missed visit and a withdrawn patient, which the seed graph does not have, with no history behind them. */
const EXITS = `${PREFIXES}
d:V-EXIT a ls:Visit ; ls:identifier "V-EXIT" ; ls:visitStatus lst:VisitStatus-missed .
d:PT-EXIT a ls:Patient ; ls:identifier "PT-EXIT" ; ls:patientEnrollment lst:PatientEnrollment-withdrawn .`;

const steps = (view: { journey?: { steps: { stage: string; status: string; exit?: boolean }[] } }) =>
  view.journey?.steps.map((s) => `${s.stage}: ${s.status}${s.exit ? ' (exit)' : ''}`);

describe('An object’s journey', () => {
  it('takes the stages before a seeded object’s state as passed, and those after it as to come', () => {
    const view = withSeed().read(chloe, 'SC-003');
    expect(view.journey?.dimension).toBe('Workflow');
    expect(steps(view)).toEqual(['received: passed', 'triaged: passed', 'assessed: current', 'reported: upcoming', 'closed: upcoming']);
  });

  it('moves along as methods commit', async () => {
    const gateway = withSeed();
    expect(steps(gateway.read(chloe, 'SC-004'))?.slice(0, 2)).toEqual(['received: current', 'triaged: upcoming']);
    await gateway.commit(chloe, 'SC-004', `${NS.ls}Triage`, {
      seriousness: `${NS.lst}SafetyCaseSeriousness-serious`,
      expectedness: `${NS.lst}SafetyCaseExpectedness-unexpected`,
    });
    expect(steps(gateway.read(chloe, 'SC-004'))?.slice(0, 3)).toEqual(['received: passed', 'triaged: current', 'assessed: upcoming']);
  });

  it('shows a stage the object went past without entering as skipped', async () => {
    const gateway = withSeed();
    // SC-001 is assessed and non-serious: it closes without being reported.
    await gateway.commit(chloe, 'SC-001', `${NS.ls}CloseCase`);
    expect(steps(gateway.read(chloe, 'SC-001'))).toEqual(['received: passed', 'triaged: passed', 'assessed: passed', 'reported: skipped', 'closed: current']);
  });

  it('ends at an exit after the stage the object left from, by its history, without the other ending', async () => {
    const gateway = withSeed();
    await gateway.commit(chloe, 'SIG-1', `${NS.ls}EvaluateSignal`);
    await gateway.commit(chloe, 'SIG-1', `${NS.ls}RefuteSignal`, { rationale: 'The cases have a likelier cause.' });
    expect(steps(gateway.read(chloe, 'SIG-1'))).toEqual(['detected: passed', 'under evaluation: passed', 'refuted: current (exit)']);
  });

  it('takes where an exit left from from the ontology when the object has no history', () => {
    expect(steps(withSeed([EXITS]).read(ben, 'V-EXIT'))).toEqual(['scheduled: passed', 'missed: current (exit)']);
  });

  it('marks the stages not known when neither the history nor the ontology says where an exit left from', () => {
    expect(steps(withSeed([EXITS]).read(ben, 'PT-EXIT'))).toEqual([
      'screened: unknown',
      'consented: unknown',
      'randomized: unknown',
      'completed: unknown',
      'withdrawn: current (exit)',
    ]);
  });

  it('has no journey when the main path has one stage', () => {
    expect(withSeed().read(ben, 'AR-1').journey).toBeUndefined();
  });

  it('follows a study’s status, its lifecycle, rather than its phase', () => {
    const view = withSeed().read(ben, 'ST-01');
    expect(view.journey?.dimension).toBe('Status');
    expect(steps(view)?.slice(0, 3)).toEqual(['planned: passed', 'enrolling: current', 'active: upcoming']);
  });
});
