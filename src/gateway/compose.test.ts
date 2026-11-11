// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { NS } from '../ontology/ontology';
import { GatewayError } from './gateway';
import { withSeed } from './node';

vi.setConfig({ testTimeout: 20_000 });

const ls = (n: string) => `${NS.ls}${n}`;
const lst = (n: string) => `${NS.lst}${n}`;
const chloe = { person: `${NS.d}person-chloe`, role: ls('DrugSafetyPhysician') };
const elena = { person: `${NS.d}person-elena`, role: ls('QualityLead') };

describe('Compose a method (spec 3.4 and 5.4)', () => {
  const gateway = withSeed();

  it('offers a scheme’s values for a choice, in the scheme’s order', () => {
    const triage = gateway.compose(chloe, 'SC-004', ls('Triage'));
    expect(triage).toMatchObject({ label: 'Triage', archetype: { label: 'Fill in' }, object: { identifier: 'SC-004' } });
    expect(triage.inputs.map((i) => [i.name, i.kind, i.choices?.map((c) => c.label).sort()])).toEqual([
      ['seriousness', 'choice', ['non-serious', 'serious']],
      ['expectedness', 'choice', ['expected', 'unexpected']],
    ]);
  });

  it('narrows a choice by the input’s shape: causality without unassessed', () => {
    const assess = gateway.compose(chloe, 'SC-002', ls('Assess'));
    expect(assess.inputs[0].choices?.map((c) => c.label)).toEqual(['unrelated', 'possible', 'probable']);
  });

  it('offers the people who may act, defaulting to the principal', () => {
    const review = gateway.compose(chloe, 'SUB-1', ls('SendForReview'));
    expect(review.inputs[0]).toMatchObject({ kind: 'person', default: chloe.person });
    expect(review.inputs[0].choices?.map((c) => c.label)).toEqual(['Chloé Martin', 'Dev Raman']);
  });

  it('describes a method with no inputs as Confirm', () => {
    expect(gateway.compose(chloe, 'SIG-1', ls('EvaluateSignal'))).toMatchObject({ archetype: { label: 'Confirm' }, inputs: [] });
  });

  it('refuses a method the role may not run', () => {
    expect(() => gateway.compose(elena, 'SC-004', ls('Triage'))).toThrow(GatewayError);
  });
});

describe('Preview a method (spec 3.4)', () => {
  it('returns what would change, and saves nothing', async () => {
    const gateway = withSeed();
    const preview = await gateway.preview(chloe, 'SC-004', ls('Triage'), {
      seriousness: lst('SafetyCaseSeriousness-serious'),
      expectedness: lst('SafetyCaseExpectedness-unexpected'),
    });
    expect(preview.changes).toContainEqual(expect.objectContaining({ subject: `${NS.d}SC-004`, property: ls('safetyCaseWorkflow'), oldValue: lst('SafetyCaseWorkflow-received'), newValue: lst('SafetyCaseWorkflow-triaged'), subjectLabel: 'SC-004', propertyLabel: 'Workflow', oldLabel: 'received', newLabel: 'triaged' }));
    expect(preview.changes).toContainEqual(expect.objectContaining({ subject: `${NS.d}SC-004`, propertyLabel: 'Seriousness', newLabel: 'serious' }));
    expect(gateway.read(chloe, 'SC-004').state.Workflow).toBe('received');
    expect(gateway.commits()).toEqual([]);
  });

  it('returns the reasons a commit would fail', async () => {
    const gateway = withSeed();
    await expect(gateway.preview(chloe, 'SC-004', ls('Triage'), {})).rejects.toMatchObject({ reasons: ['Seriousness is required', 'Expectedness is required'] });
  });

  it('shows new objects a commit would create', async () => {
    const preview = await withSeed().preview(elena, 'QE-1', ls('StartInvestigation'), { investigator: elena.person });
    expect(preview.created).toEqual([]);
    const ben = { person: `${NS.d}person-ben`, role: ls('ClinicalDataManager') };
    expect((await withSeed().preview(ben, 'AE-003', ls('ReportToSafety'))).created).toEqual([`${NS.d}SafetyCase-7`]);
  });
});
