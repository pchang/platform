import { describe, expect, it } from 'vitest';
import { validateView } from '../design-system/validateView';
import type { MethodComposition } from '../data/client';
import { buildCompareView, buildComposeView, buildRefusedView, buildSignView, changeLines, nameMatches, successNotice } from './composeView';

const object = { iri: 'https://example.org/lsh-data/SC-004', identifier: 'SC-004', type: 'urn:t', typeLabel: 'Safety Case', state: {} };
const triage: MethodComposition = {
  method: 'urn:Triage',
  label: 'Triage',
  archetype: { archetype: 'urn:FillIn', label: 'Fill in' },
  object,
  inputs: [
    { name: 'seriousness', label: 'Seriousness', kind: 'choice', choices: [{ value: 'urn:non', label: 'non-serious' }, { value: 'urn:ser', label: 'serious' }] },
    { name: 'reviewer', label: 'Reviewer', kind: 'person', choices: [{ value: 'urn:p1', label: 'Chloé Martin' }], default: 'urn:p1' },
    { name: 'rationale', label: 'Rationale', kind: 'text' },
  ],
};
const evaluate: MethodComposition = { method: 'urn:Evaluate', label: 'Evaluate signal', archetype: { archetype: 'urn:Confirm', label: 'Confirm' }, object, inputs: [] };
const preview = {
  changes: [
    { subject: object.iri, property: 'urn:wf', oldValue: 'urn:r', newValue: 'urn:t', subjectLabel: 'SC-004', propertyLabel: 'Workflow', oldLabel: 'received', newLabel: 'triaged' },
    { subject: 'urn:new', property: 'urn:type', newValue: 'urn:Sub', subjectLabel: 'Submission-2', propertyLabel: 'type', newLabel: 'Submission' },
    { subject: 'urn:new', property: 'urn:status', newValue: 'urn:d', subjectLabel: 'Submission-2', propertyLabel: 'Status', newLabel: 'draft' },
  ],
  created: ['urn:new'],
  pending: [],
  pendingDescriptions: [],
};

describe('Confirm and Fill in views (design system spec 5.1)', () => {
  it.each([
    ['Fill in, before every field has a value', buildComposeView(triage, { status: 'incomplete' })],
    ['Fill in, checking', buildComposeView(triage, { status: 'checking' })],
    ['Fill in, ready', buildComposeView(triage, { status: 'ready', preview })],
    ['Fill in, refused', buildComposeView(triage, { status: 'refused', reasons: ['Quality is not pending'] })],
    ['Confirm, ready', buildComposeView(evaluate, { status: 'ready', preview })],
    ['a refusal to compose', buildRefusedView(['Your role cannot run this method'])],
  ])('%s is a valid view spec', (_name, view) => {
    expect(validateView(view).errors).toEqual([]);
  });

  it('uses a small modal for Confirm and a medium one for Fill in', () => {
    expect(buildComposeView(evaluate, { status: 'incomplete' }).root.props).toMatchObject({ variant: 'small' });
    expect(buildComposeView(triage, { status: 'incomplete' }).root.props).toMatchObject({ variant: 'medium' });
  });

  it('turns choices of five or fewer into radio buttons, and people into a select', () => {
    const json = JSON.stringify(buildComposeView(triage, { status: 'incomplete' }));
    expect(json).toContain('"role":"radiogroup"');
    expect(json).toContain('"component":"FormSelect"');
    expect(json).toContain('"component":"TextArea"');
  });

  it('keeps the commit button disabled until the preview is ready', () => {
    const submit = (v: ReturnType<typeof buildComposeView>) => JSON.stringify(v).match(/"label":"Triage","variant":"primary","isDisabled":(true|false)/)?.[1];
    expect(submit(buildComposeView(triage, { status: 'incomplete' }))).toBe('true');
    expect(submit(buildComposeView(triage, { status: 'refused', reasons: ['x'] }))).toBe('true');
    expect(submit(buildComposeView(triage, { status: 'ready', preview }))).toBe('false');
    expect(submit(buildComposeView(triage, { status: 'ready', preview }, true))).toBe('true');
  });

  it('describes what will change in words the person recognizes', () => {
    expect(changeLines(triage, preview)).toEqual([
      { term: 'Workflow', value: 'received → triaged' },
      { term: 'Creates', value: 'Submission-2, Status: draft' },
    ]);
  });

  it('says what changed after the commit', () => {
    expect(validateView({ pattern: 'card-view', because: 't', root: successNotice(triage, { commit: 'urn:c', ...preview }) }).errors).toEqual([]);
  });
});

describe('Compare and decide (design system spec 5.1)', () => {
  const flag: MethodComposition = {
    method: 'urn:Flag',
    label: 'Flag duplicate',
    archetype: { archetype: 'urn:Compare', label: 'Compare and decide' },
    object,
    inputs: [{ name: 'candidateCase', label: 'Candidate case', kind: 'object', choices: [{ value: 'urn:sc6', label: 'SC-006' }] }],
  };
  const self = { ...object, state: { Workflow: 'received', Causality: 'unassessed' }, properties: { 'received on': '2026-11-05' }, links: [] };
  const other = { ...object, iri: 'urn:sc6', identifier: 'SC-006', state: { Workflow: 'received', Causality: 'unassessed' }, properties: { 'received on': '2026-11-07' }, links: [] };

  it.each([
    ['before a case is chosen', buildCompareView(flag, { status: 'incomplete' }, self, undefined)],
    ['side by side, ready', buildCompareView(flag, { status: 'ready', preview }, self, other)],
    ['refused', buildCompareView(flag, { status: 'refused', reasons: ['The candidate case is closed'] }, self, other)],
  ])('%s is a valid view spec', (_name, view) => {
    expect(validateView(view).errors).toEqual([]);
  });

  it('marks exactly the rows that differ, on both cards', () => {
    const json = JSON.stringify(buildCompareView(flag, { status: 'incomplete' }, self, other));
    expect(json.match(/"label":"Different"/g)).toHaveLength(2);
  });

  it('shows pending work as recorded for later', () => {
    expect(changeLines(flag, { ...preview, pendingDescriptions: ['Moves this case into the target.'] })).toContainEqual({ term: 'Recorded for later', value: 'Moves this case into the target.' });
  });
});

describe('Review and sign (design system spec 5.1)', () => {
  const submit: MethodComposition = {
    method: 'urn:Submit',
    label: 'Submit',
    archetype: { archetype: 'urn:Sign', label: 'Review and sign' },
    object: { ...object, identifier: 'SUB-1', typeLabel: 'Submission' },
    inputs: [{ name: 'approver', label: 'Approver', kind: 'person', choices: [{ value: 'urn:dev', label: 'Dev Raman' }], default: 'urn:dev' }],
    signature: { signer: 'urn:dev', signerName: 'Dev Raman', meaning: 'Approval: I approve this report.', development: true },
  };
  const finalStep = (v: ReturnType<typeof buildSignView>) => (v.root.children![0].children!.find((c) => c.props?.id === 'sign')!.props!.footer as { isNextDisabled: boolean });

  it.each([
    ['before the preview', buildSignView(submit, { status: 'incomplete' }, {})],
    ['ready to sign', buildSignView(submit, { status: 'ready', preview }, { signatureName: 'Dev Raman' })],
    ['refused', buildSignView(submit, { status: 'refused', reasons: ['Approver must be someone else (rule 5: separation of duties)'] }, {})],
  ])('%s is a valid view spec', (_name, view) => {
    expect(validateView(view).errors).toEqual([]);
  });

  it('enables signing only when the preview is ready and the typed name matches', () => {
    expect(finalStep(buildSignView(submit, { status: 'ready', preview }, {})).isNextDisabled).toBe(true);
    expect(finalStep(buildSignView(submit, { status: 'ready', preview }, { signatureName: 'Chloé Martin' })).isNextDisabled).toBe(true);
    expect(finalStep(buildSignView(submit, { status: 'ready', preview }, { signatureName: ' dev  RAMAN ' })).isNextDisabled).toBe(false);
    expect(finalStep(buildSignView(submit, { status: 'refused', reasons: ['x'] }, { signatureName: 'Dev Raman' })).isNextDisabled).toBe(true);
    expect(nameMatches(submit, 'Dev Raman')).toBe(true);
  });

  it('warns that a development signature is not a valid electronic signature', () => {
    expect(JSON.stringify(buildSignView(submit, { status: 'ready', preview }, {}))).toContain('This is not a valid electronic signature.');
    expect(JSON.stringify(buildSignView({ ...submit, signature: { ...submit.signature!, development: false } }, { status: 'ready', preview }, {}))).not.toContain('Development signature');
  });

  it('says who signed after the commit', () => {
    const json = JSON.stringify(successNotice(submit, { commit: 'urn:c', ...preview, signature: { signerName: 'Dev Raman', signedAt: 'x', meaning: 'm', development: true } }));
    expect(json).toContain('Signed by: Dev Raman (development signature, not valid)');
  });
});
