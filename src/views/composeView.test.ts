import { describe, expect, it } from 'vitest';
import { validateView } from '../design-system/validateView';
import type { MethodComposition } from '../data/client';
import type { DraftView, RunView } from '../data/client';
import { buildCompareView, buildComposeView, buildDraftView, buildRefusedView, buildSignView, buildStartView, changeLines, discardedNotice, nameMatches, runNotice, successNotice } from './composeView';

const object = { iri: 'https://example.org/lsh-data/SC-004', identifier: 'SC-004', type: 'urn:t', typeLabel: 'Safety Case', pluralLabel: 'Safety Cases', state: {} };
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
  background: [],
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

describe('Start and track (design system spec 5.1)', () => {
  const product = { ...object, iri: 'urn:p', identifier: 'P-101', typeLabel: 'Product' };
  const detect: MethodComposition = { method: 'urn:detect', label: 'Run signal detection', archetype: { archetype: 'urn:StartAndTrack', label: 'Start and track' }, object: product, inputs: [] };
  const background = { changes: [], created: [], pending: [], pendingDescriptions: [], background: ['Looks for reactions reported disproportionately often.'] };
  const run: RunView = {
    run: 'urn:run/1', method: 'urn:detect', methodLabel: 'Run signal detection', object: 'urn:p', objectIdentifier: 'P-101', status: 'running', progress: 0.4,
    startedBy: 'urn:c', startedByName: 'Chloé Martin', startedAt: '2026-11-11T10:00:00Z', created: [],
  };
  const ended: RunView = { ...run, status: 'succeeded', progress: undefined, message: 'Found 1 new signal: Signal-2 for skin rash.', created: [{ iri: 'urn:s2', identifier: 'Signal-2' }] };

  it.each([
    ['before the start', buildStartView(detect, { status: 'ready', preview: background })],
    ['refused', buildStartView(detect, { status: 'refused', reasons: ['No worker can do this method’s background work yet.'] })],
    ['running', buildStartView(detect, { status: 'ready', preview: background }, run)],
    ['finished', buildStartView(detect, { status: 'ready', preview: background }, ended)],
    ['failed', buildStartView(detect, { status: 'ready', preview: background }, { ...ended, status: 'failed', message: 'No other product has safety cases to compare with.' })],
  ])('%s is a valid view spec', (_name, view) => {
    expect(validateView(view).errors).toEqual([]);
  });

  it('says what will run in the background, and starts with a button named for the method', () => {
    const json = JSON.stringify(buildStartView(detect, { status: 'ready', preview: background }));
    expect(json).toContain('"label":"In the background"');
    expect(json).toContain('{"component":"Button","props":{"label":"Run signal detection","variant":"primary","isDisabled":false},"intent":"submit"}');
  });

  it('follows the run with a progress bar, then shows how it ended', () => {
    const running = JSON.stringify(buildStartView(detect, { status: 'ready', preview: background }, run));
    expect(running).toContain('"component":"Progress","props":{"value":40,"title":"Run signal detection on P-101: running","measureLocation":"top","valueText":"40 percent done"}');
    expect(running).toContain('Notifications will tell you when it ends.');
    expect(running).toContain('{"component":"Button","props":{"label":"Keep working","variant":"primary"},"intent":"cancel"}');
    const done = JSON.stringify(buildStartView(detect, { status: 'ready', preview: background }, ended));
    expect(done).toContain('"variant":"success"');
    expect(done).toContain('Found 1 new signal: Signal-2 for skin rash.');
    expect(done).toContain('{"component":"Button","props":{"label":"Done","variant":"primary"},"intent":"cancel"}');
  });

  it('reports a run that started, or how it ended, when the modal closes', () => {
    expect(runNotice(run).props).toMatchObject({ variant: 'info', title: 'Run signal detection started on P-101' });
    expect(runNotice(ended).props).toMatchObject({ variant: 'success', title: 'Run signal detection finished on P-101' });
    expect(successNotice(detect, { commit: 'urn:c1', ...background, run: ended }).props).toMatchObject({ title: 'Run signal detection finished on P-101' });
  });
});

describe('Review a draft (design system spec 5.1)', () => {
  const narrative: MethodComposition = { method: 'urn:GenerateNarrative', label: 'Generate narrative', archetype: { archetype: 'urn:ReviewADraft', label: 'Review a draft' }, object, inputs: [] };
  const draft: DraftView = {
    draft: 'urn:draft/1', method: 'urn:GenerateNarrative', methodLabel: 'Generate narrative', object: object.iri, objectIdentifier: 'SC-004',
    text: 'First paragraph.\n\nSecond paragraph.', model: 'claude-opus-5-5', generatedAt: '2026-11-12T10:00:00Z', status: 'undecided',
    given: [{ iri: object.iri, identifier: 'SC-004' }], requestedBy: 'urn:c', requestedByName: 'Chloé Martin',
  };

  it.each([
    ['drafting', buildDraftView(narrative, { status: 'drafting' })],
    ['refused', buildDraftView(narrative, { status: 'refused', reasons: ['No model is connected to draft this.'] })],
    ['ready', buildDraftView(narrative, { status: 'ready', draft })],
    ['editing', buildDraftView(narrative, { status: 'ready', draft }, { editing: true, editedText: 'x' })],
    ['refused on accept', buildDraftView(narrative, { status: 'ready', draft }, { problems: ['This draft was already accepted'] })],
  ])('%s is a valid view spec', (_name, view) => {
    expect(validateView(view).errors).toEqual([]);
    expect(view.pattern).toBe('review-a-draft');
  });

  it('marks the draft as generated, shows its paragraphs, and offers Accept, Edit, Discard and Back', () => {
    const json = JSON.stringify(buildDraftView(narrative, { status: 'ready', draft }));
    expect(json).toContain('{"component":"Label","props":{"label":"Generated draft, not reviewed","status":"warning"}}');
    expect(json).toContain('"label":"First paragraph."');
    expect(json).toContain('"label":"Second paragraph."');
    for (const [label, intent] of [['Accept', 'submit'], ['Edit', 'edit'], ['Discard', 'discard'], ['Back', 'cancel']]) {
      expect(json).toMatch(new RegExp(`"label":"${label}"[^}]*}[^}]*"intent":"${intent}"|"label":"${label}","variant":"[a-z]+"(,"isDisabled":false)?},"intent":"${intent}"`));
    }
  });

  it('while editing, binds the text to a field and cannot accept it empty', () => {
    const json = JSON.stringify(buildDraftView(narrative, { status: 'ready', draft }, { editing: true, editedText: '  ' }));
    expect(json).toContain('"field":"draftText"');
    expect(json).toContain('{"label":"Accept edited draft","variant":"primary","isDisabled":true}');
    expect(json).not.toContain('"intent":"edit"');
  });

  it('says where an accepted narrative came from, and shortens long text in the notice', () => {
    const long = 'A'.repeat(400);
    const result = {
      commit: 'urn:c1', created: [], pending: [], pendingDescriptions: [], background: [],
      changes: [{ subject: object.iri, property: 'urn:narrative', newValue: long, subjectLabel: 'SC-004', propertyLabel: 'narrative', newLabel: long }],
      fromDraft: { draft: draft.draft, model: 'claude-opus-5-5', edited: true },
    };
    const json = JSON.stringify(successNotice(narrative, result));
    expect(json).toContain('From a generated draft: written by claude-opus-5-5, edited before it was accepted');
    expect(json).not.toContain(long);
    expect(discardedNotice(draft).props).toMatchObject({ variant: 'info', title: 'Generate narrative draft discarded for SC-004' });
  });
});
