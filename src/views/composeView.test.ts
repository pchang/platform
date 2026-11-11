import { describe, expect, it } from 'vitest';
import { validateView } from '../design-system/validateView';
import type { MethodComposition } from '../data/client';
import { buildCompareView, buildComposeView, buildRefusedView, changeLines, successNotice } from './composeView';

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
