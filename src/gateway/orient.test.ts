// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { NS } from '../ontology/ontology';
import { withSeed } from './node';

// To do checks every method a role may run on every object it could apply to.
vi.setConfig({ testTimeout: 20_000 });

const as = (person: string, role: string) => ({ person: `${NS.d}${person}`, role: `${NS.ls}${role}` });
const chemist = as('person-ada', 'ComputationalChemist');
const dataManager = as('person-ben', 'ClinicalDataManager');
const physician = as('person-chloe', 'DrugSafetyPhysician');
const quality = as('person-elena', 'QualityLead');
const agent = as('agent-northbridge', 'ExternalCROAgent');
const monitor = as('person-priya', 'ClinicalResearchAssociate');
const coordinator = as('person-sam', 'ClinicalResearchCoordinator');

describe('navigation shows each person the object world of their work (spec 5.1)', () => {
  const gateway = withSeed();
  const nav = (p: typeof chemist) => gateway.navigation(p).map((d) => [d.label, d.types.map((t) => t.pluralLabel)]);

  it('gives the Clinical Data Manager only Clinical Development', () => {
    expect(nav(dataManager)).toEqual([
      ['Clinical Development', ['Adverse Events', 'Data Queries', 'Data Records', 'Patients', 'Sites', 'Studies', 'Visits']],
    ]);
  });

  it('gives the Drug Safety Physician only Safety and Regulatory', () => {
    expect(nav(physician).map(([domain]) => domain)).toEqual(['Safety and Regulatory']);
  });

  it('gives the Quality Lead both of their work domains', () => {
    expect(nav(quality).map(([domain]) => domain)).toEqual(['Safety and Regulatory', 'Scientific Innovation']);
  });

  it('counts the objects of each type', () => {
    const batches = gateway.navigation(quality).flatMap((d) => d.types).find((t) => t.label === 'Batch');
    expect(batches?.count).toBe(3);
  });
});

describe('To do (spec 5.1)', () => {
  const gateway = withSeed();
  const list = async (p: typeof chemist) =>
    (await gateway.todo(p)).map((i) => [i.object.identifier, i.tasks.map((t) => t.label).join(', ') || `urgent: ${i.actions.map((a) => a.label).join(', ')}`]);

  it('puts the submission due first for the Drug Safety Physician, then the serious case, then the rest', async () => {
    expect(await list(physician)).toEqual([
      ['SUB-1', 'Send for review'],
      ['SC-003', 'urgent: Flag duplicate'],
      ['SC-001', 'Close case'],
      ['SC-002', 'Assess'],
      ['SC-004', 'Triage'],
      ['SC-005', 'Triage'],
      ['SC-006', 'Triage'],
      ['SIG-1', 'Evaluate signal'],
    ]);
    expect((await gateway.todo(physician))[0].deadline).toBe('2026-11-17');
  });

  it('shows the Quality Lead the high-risk batch and its quality event (J3 starts here)', async () => {
    expect(await list(quality)).toEqual([
      ['B-002', 'urgent: Open quality event, Quarantine batch'],
      ['QE-1', 'Start investigation'],
    ]);
  });

  it('shows the Clinical Data Manager events to report and reconcile, and answered queries to close (J1 starts here)', async () => {
    expect(await list(dataManager)).toEqual([
      ['AE-003', 'Report to safety'],
      ['AE-005', 'Report to safety'],
      ['AE-001', 'Reconcile adverse event'],
      ['AE-002', 'Reconcile adverse event'],
      ['AE-004', 'Report to safety'],
      ['Q-04', 'Close query, Re-query'],
      ['Q-05', 'Close query, Re-query'],
      ['Q-06', 'Close query, Re-query'],
    ]);
  });

  it('shows the Clinical Research Associate what awaits source data verification, the serious event first', async () => {
    const items = await list(monitor);
    expect(items.slice(0, 2)).toEqual([['AE-005', 'Verify adverse event'], ['AE-004', 'Verify adverse event']]);
    // Records with a query still open or answered wait until it is closed.
    expect(items.slice(2).map(([id]) => id)).toEqual(['DR-028', 'DR-030', 'DR-031', 'DR-032', 'DR-035', 'DR-036', 'DR-039', 'DR-040']);
    expect(new Set(items.slice(2).map(([, task]) => task))).toEqual(new Set(['Verify data record']));
  });

  it('shows the Clinical Research Coordinator visits by date, then patients to consent and randomize, then queries to answer', async () => {
    const todo = await gateway.todo(coordinator);
    expect(todo.slice(0, 10).map((i) => [i.object.identifier, i.deadline])).toEqual([
      ['V-01-3', '2026-11-03'], ['V-02-3', '2026-11-09'], ['V-03-3', '2026-11-12'], ['V-04-3', '2026-11-13'], ['V-05-3', '2026-11-14'],
      ['V-06-3', '2026-11-16'], ['V-07-3', '2026-11-18'], ['V-08-3', '2026-11-21'], ['V-09-3', '2026-11-25'], ['V-10-3', '2026-12-02'],
    ]);
    expect(todo[0].tasks.map((t) => [t.label, t.archetype.label])).toEqual([['Complete visit', 'Confirm'], ['Record missed visit', 'Fill in']]);
    expect((await list(coordinator)).slice(10)).toEqual([
      ['PT-11', 'Randomize'],
      ['PT-12', 'Consent'],
      ['Q-01', 'Answer query'],
      ['Q-02', 'Answer query'],
      ['Q-03', 'Answer query'],
    ]);
  });

  it('shows the Computational Chemist compounds ready to register or promote, not every compound', async () => {
    expect(await list(chemist)).toEqual([
      ['C-102', 'Promote to candidate'],
      ['C-103', 'Register'],
    ]);
  });

  it('shows the CRO agent its queries to answer and close', async () => {
    expect(await list(agent)).toEqual([
      ['Q-01', 'Answer query'], ['Q-02', 'Answer query'], ['Q-03', 'Answer query'],
      ['Q-04', 'Close query'], ['Q-05', 'Close query'], ['Q-06', 'Close query'],
    ]);
  });

  it('drops an object once its work is done', async () => {
    const fresh = withSeed();
    await fresh.commit(quality, 'QE-1', `${NS.ls}StartInvestigation`, { investigator: 'person-elena' });
    expect((await fresh.todo(quality)).map((i) => i.object.identifier)).toEqual(['B-002', 'QE-1']);
    expect((await fresh.todo(quality))[1].tasks.map((t) => t.label)).toEqual(['Assign CAPA']);
  });
});

it('does not offer a second expedited report for a case that already has one', async () => {
  const sc003 = (await withSeed().methods(physician, 'SC-003')).find((m) => m.label === 'Prepare expedited report');
  expect(sc003?.blocks).toEqual(['A submission already reports this case']);
});
