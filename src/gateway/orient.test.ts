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
      ['SC-003', 'urgent: Flag duplicate, Generate narrative'],
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

  it('shows the Clinical Data Manager the serious event to report (J1 starts here)', async () => {
    expect(await list(dataManager)).toEqual([['AE-003', 'Report to safety']]);
  });

  it('shows the Computational Chemist compounds ready to register or promote, not every compound', async () => {
    expect(await list(chemist)).toEqual([
      ['C-102', 'Promote to candidate'],
      ['C-103', 'Register'],
    ]);
  });

  it('shows the CRO agent its open queries', async () => {
    expect((await list(agent)).map(([id]) => id)).toEqual(['Q-01', 'Q-02', 'Q-03', 'Q-04']);
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
