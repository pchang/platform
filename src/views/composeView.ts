import type { ViewNode, ViewSpec } from '../design-system/catalog';
import type { CommitResult, DraftView, MethodComposition, ObjectView, RunView } from '../data/client';
import type { ComposedInput } from '../gateway/gateway';
import type { Progress } from '../processes/processes';

/**
 * The Confirm and Fill in patterns (design system spec 5.1), as view specs. The pattern is fixed by the
 * method's archetype; only the content comes from the method, the object and the gateway's preview.
 */

/** The archetypes built so far. Tasks of other archetypes are shown as text until their pattern exists. */
export const BUILT_ARCHETYPES = new Set(['Confirm', 'Fill in', 'Compare and decide', 'Review and sign', 'Start and track', 'Review a draft']);

/** The field the signer types their name into (design system spec 5.1, Review and sign). Not a method input. */
export const SIGNATURE_FIELD = 'signatureName';

/** Archetypes whose pattern takes the place of the view, rather than opening over it (design system spec 5.1). */
export const PAGE_ARCHETYPES = new Set(['Compare and decide', 'Review a draft']);

/** The field that holds a draft's text while the person edits it (design system spec 5.1, Review a draft). Not a method input. */
export const DRAFT_FIELD = 'draftText';

export type PreviewState =
  | { status: 'incomplete' }
  | { status: 'checking' }
  | { status: 'ready'; preview: Omit<CommitResult, 'commit'> }
  | { status: 'refused'; reasons: string[] };

const text = (label: string, component?: 'p' | 'small'): ViewNode => ({ component: 'Content', props: component ? { label, component } : { label } });
const stack = (items: ViewNode[][]): ViewNode => ({ component: 'Stack', props: { hasGutter: true }, children: items.map((children) => ({ component: 'StackItem', children })) });
/** Up to this many values show as radio buttons; more as a select (design system spec 5.1). */
const MAX_RADIOS = 5;

function fieldFor(input: ComposedInput): ViewNode {
  const group = (children: ViewNode[], role?: 'radiogroup'): ViewNode => ({
    component: 'FormGroup',
    // Radio buttons sit side by side, so each has room to be tapped (WCAG 2.2 target size).
    props: { label: input.label, isRequired: true, ...(role ? { role, isInline: true } : {}) },
    children,
  });
  if (input.kind === 'choice' && (input.choices?.length ?? 0) <= MAX_RADIOS) {
    return group(
      input.choices!.map((c) => ({ component: 'Radio', props: { label: c.label, name: input.name, value: c.value }, field: input.name })),
      'radiogroup',
    );
  }
  if (input.choices) {
    return group([
      {
        component: 'FormSelect',
        props: { 'aria-label': input.label, isRequired: true },
        field: input.name,
        children: [
          { component: 'FormSelectOption', props: { value: '', label: `Choose ${input.label.toLowerCase()}` } },
          ...input.choices.map((c) => ({ component: 'FormSelectOption', props: { value: c.value, label: c.label } })),
        ],
      },
    ]);
  }
  if (input.kind === 'url') return group([{ component: 'TextInput', props: { 'aria-label': input.label, type: 'url', isRequired: true }, field: input.name }]);
  return group([{ component: 'TextArea', props: { 'aria-label': input.label, isRequired: true }, field: input.name }]);
}

/** One line per change the person will recognize: the object's own values, related objects, and new objects. */
export function changeLines(composition: MethodComposition, preview: Omit<CommitResult, 'commit'>): { term: string; value: string }[] {
  const created = new Set(preview.created);
  const lines: { term: string; value: string }[] = [];
  for (const c of preview.changes) {
    if (created.has(c.subject)) continue;
    const term = c.subject === composition.object.iri ? c.propertyLabel : `${c.subjectLabel} ${c.propertyLabel}`;
    lines.push({ term, value: c.oldLabel && c.newLabel ? `${c.oldLabel} → ${c.newLabel}` : c.newLabel ? `set to ${c.newLabel}` : `${c.oldLabel} removed` });
  }
  for (const description of preview.pendingDescriptions) lines.push({ term: 'Recorded for later', value: description });
  for (const description of preview.background ?? []) lines.push({ term: 'In the background', value: description });
  for (const iri of preview.created) {
    const own = preview.changes.filter((c) => c.subject === iri);
    const identifier = own[0]?.subjectLabel ?? iri;
    const details = own.filter((c) => !['type', 'identifier'].includes(c.propertyLabel) && c.newLabel).map((c) => `${c.propertyLabel}: ${c.newLabel}`);
    lines.push({ term: 'Creates', value: [identifier, ...details].join(', ') });
  }
  return lines;
}

function previewSection(composition: MethodComposition, state: PreviewState, prompt = 'Fill in every field to see what will change.'): ViewNode[] {
  const heading: ViewNode = { component: 'Title', props: { label: 'What will change', headingLevel: 'h2', size: 'md' } };
  if (state.status === 'incomplete') return [heading, text(prompt, 'small')];
  if (state.status === 'checking') return [heading, { component: 'Spinner', props: { size: 'md', 'aria-valuetext': 'Checking what will change' } }];
  if (state.status === 'refused') {
    return [
      heading,
      { component: 'Alert', props: { variant: 'danger', title: `${composition.label} cannot run`, isInline: true, component: 'h3' }, children: state.reasons.map((r) => text(r)) },
    ];
  }
  const lines = changeLines(composition, state.preview);
  return [
    heading,
    {
      component: 'DescriptionList',
      props: { isCompact: true },
      children: lines.map((l) => ({
        component: 'DescriptionListGroup',
        children: [
          { component: 'DescriptionListTerm', props: { label: l.term } },
          { component: 'DescriptionListDescription', children: [text(l.value)] },
        ],
      })),
    },
  ];
}

export function buildComposeView(composition: MethodComposition, state: PreviewState, submitting = false, minimizable = false): ViewSpec {
  const isConfirm = composition.archetype.label === 'Confirm';
  const title = `${composition.label} ${composition.object.identifier}`;
  const body: ViewNode[][] = [];
  if (composition.inputs.length) body.push([{ component: 'Form', children: composition.inputs.map(fieldFor) }]);
  body.push(previewSection(composition, state));
  return {
    pattern: isConfirm ? 'confirm' : 'fill-in',
    because: `${composition.label} is a ${composition.archetype.label} method (platform spec 5.4)`,
    root: {
      component: 'Modal',
      props: { variant: isConfirm ? 'small' : 'medium', 'aria-label': title },
      children: [
        modalHeader(title, composition.object.title, minimizable),
        { component: 'ModalBody', children: [stack(body)] },
        {
          component: 'ModalFooter',
          children: [
            { component: 'Button', props: { label: composition.label, variant: 'primary', isDisabled: state.status !== 'ready' || submitting }, intent: 'submit' },
            { component: 'Button', props: { label: 'Cancel', variant: 'link' }, intent: 'cancel' },
          ],
        },
      ],
    },
  };
}

const RUN_STATUS_WORDS: Record<RunView['status'], string> = { queued: 'waiting to start', running: 'running', succeeded: 'finished', failed: 'failed' };

/** The run's status for a person, such as "Run signal detection on P-101: running". */
export function runTitle(run: RunView): string {
  return `${run.methodLabel} on ${run.objectIdentifier}: ${RUN_STATUS_WORDS[run.status]}`;
}

/** The run as a Progress bar, then its outcome once it ends (design system spec 5.1, Start and track, steps 4 and 5). */
function runSection(run: RunView): ViewNode[] {
  const ended = run.status === 'succeeded' || run.status === 'failed';
  const percent = ended ? 100 : Math.round((run.progress ?? 0) * 100);
  const nodes: ViewNode[] = [
    { component: 'Title', props: { label: 'Progress', headingLevel: 'h2', size: 'md' } },
    {
      component: 'Progress',
      props: {
        value: percent,
        title: runTitle(run),
        measureLocation: ended ? 'none' : 'top',
        valueText: ended ? RUN_STATUS_WORDS[run.status] : `${percent} percent done`,
        ...(ended ? { variant: run.status === 'succeeded' ? 'success' : 'danger' } : {}),
      },
    },
  ];
  if (!ended) {
    nodes.push(text('You can close this and keep working. Notifications will tell you when it ends.', 'small'));
  } else {
    nodes.push({
      component: 'Alert',
      props: { variant: run.status === 'succeeded' ? 'success' : 'danger', title: run.status === 'succeeded' ? `${run.methodLabel} finished` : `${run.methodLabel} failed`, isInline: true, component: 'h3' },
      children: [text(run.message ?? '')],
    });
  }
  return nodes;
}

/**
 * Start and track (design system spec 5.1): a small modal that starts a background run, then follows it.
 * Before the start: any inputs and the preview, with what the run will do. After: the run's progress and outcome.
 */
export function buildStartView(composition: MethodComposition, state: PreviewState, run?: RunView, submitting = false, minimizable = false): ViewSpec {
  const title = `${composition.label} ${composition.object.identifier}`;
  const body: ViewNode[][] = [];
  if (run) body.push(runSection(run));
  else {
    if (composition.inputs.length) body.push([{ component: 'Form', children: composition.inputs.map(fieldFor) }]);
    body.push(previewSection(composition, state));
  }
  // Closing never stops the run. While it runs, the button says the person can go on; once it ends, that they are done.
  const ended = run?.status === 'succeeded' || run?.status === 'failed';
  const footer: ViewNode[] = run
    ? [{ component: 'Button', props: { label: ended ? 'Done' : 'Keep working', variant: 'primary' }, intent: 'cancel' }]
    : [
        { component: 'Button', props: { label: composition.label, variant: 'primary', isDisabled: state.status !== 'ready' || submitting }, intent: 'submit' },
        { component: 'Button', props: { label: 'Cancel', variant: 'link' }, intent: 'cancel' },
      ];
  return {
    pattern: 'start-and-track',
    because: `${composition.label} runs in the background: a Start and track method (platform spec 5.4)`,
    root: {
      component: 'Modal',
      props: { variant: 'small', 'aria-label': title },
      children: [
        modalHeader(title, composition.object.title, minimizable),
        { component: 'ModalBody', children: [stack(body)] },
        { component: 'ModalFooter', children: footer },
      ],
    },
  };
}

/** The message after a run's modal closes: that it started, or how it ended (design system spec 5.1, Start and track, step 6). */
export function runNotice(run: RunView): ViewNode {
  const ended = run.status === 'succeeded' || run.status === 'failed';
  return {
    component: 'Alert',
    props: {
      variant: !ended ? 'info' : run.status === 'succeeded' ? 'success' : 'danger',
      title: ended ? `${run.methodLabel} ${RUN_STATUS_WORDS[run.status]} on ${run.objectIdentifier}` : `${run.methodLabel} started on ${run.objectIdentifier}`,
      isInline: true,
      component: 'p',
    },
    children: [text(ended ? (run.message ?? '') : 'It runs in the background. Notifications will tell you when it ends.')],
  };
}

export type DraftState =
  | { status: 'drafting' }
  | { status: 'ready'; draft: DraftView }
  | { status: 'refused'; reasons: string[] };

const formatTime = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Review a draft (design system spec 5.1): the generated draft, marked as such until a person decides, with the model
 * that wrote it and what it was given; then Accept, Edit, Discard or Back. Takes the place of the view it was opened from.
 */
export function buildDraftView(
  composition: MethodComposition,
  state: DraftState,
  options: { editing?: boolean; editedText?: string; submitting?: boolean; problems?: string[]; minimizable?: boolean } = {},
): ViewSpec {
  const title = `${composition.label} ${composition.object.identifier}`;
  const back: ViewNode = { component: 'Button', props: { label: 'Back', variant: 'link' }, intent: 'cancel' };
  const items: ViewNode[][] = [pageTitle(title, composition.object.title, Boolean(options.minimizable))];

  if (state.status === 'drafting') {
    items.push([
      { component: 'Spinner', props: { size: 'lg', 'aria-valuetext': 'The connected model is writing the draft' } },
      text('The connected model is writing the draft. This can take a minute.'),
    ]);
    items.push([back]);
  } else if (state.status === 'refused') {
    items.push([
      { component: 'Alert', props: { variant: 'danger', title: `${composition.label} cannot be drafted`, isInline: true, component: 'h2' }, children: state.reasons.map((r) => text(r)) },
    ]);
    items.push([back]);
  } else {
    const { draft } = state;
    const { editing = false, submitting = false } = options;
    if (options.problems?.length) {
      items.push([{ component: 'Alert', props: { variant: 'danger', title: 'The gateway refused it', isInline: true, component: 'h2' }, children: options.problems.map((r) => text(r)) }]);
    }
    items.push([
      // Generated content is marked as such until a person accepts it (rule 5).
      { component: 'Label', props: { label: 'Generated draft, not reviewed', status: 'warning' } },
      { component: 'Title', props: { label: 'Draft', headingLevel: 'h2', size: 'lg' } },
      editing
        ? {
            component: 'Form',
            children: [
              {
                component: 'FormGroup',
                props: { label: 'Edit the draft', isRequired: true },
                children: [{ component: 'TextArea', props: { 'aria-label': 'Edit the draft', isRequired: true, autoResize: true }, field: DRAFT_FIELD }],
              },
            ],
          }
        : stack(draft.text.split(/\n\s*\n/).map((paragraph) => [text(paragraph.trim(), 'p')])),
    ]);
    items.push([
      {
        component: 'DescriptionList',
        props: { isCompact: true },
        children: [
          ['Written by', draft.model],
          ['Written', formatTime(draft.generatedAt)],
          ['Drawn from', draft.given.map((g) => g.identifier).join(', ')],
          ['Asked for by', draft.requestedByName],
        ].map(([term, value]) => ({
          component: 'DescriptionListGroup',
          children: [
            { component: 'DescriptionListTerm', props: { label: term } },
            { component: 'DescriptionListDescription', children: [text(value)] },
          ],
        })),
      },
    ]);
    const emptyEdit = editing && !options.editedText?.trim();
    items.push([
      {
        component: 'Flex',
        props: { gap: { default: 'gapMd' }, flexWrap: { default: 'wrap' } },
        children: [
          { component: 'Button', props: { label: editing ? 'Accept edited draft' : 'Accept', variant: 'primary', isDisabled: submitting || emptyEdit }, intent: 'submit' },
          ...(editing ? [] : [{ component: 'Button', props: { label: 'Edit', variant: 'secondary', isDisabled: submitting }, intent: 'edit' } as ViewNode]),
          { component: 'Button', props: { label: 'Discard', variant: 'tertiary', isDisabled: submitting }, intent: 'discard' },
          back,
        ],
      },
    ]);
  }
  return {
    pattern: 'review-a-draft',
    because: `${composition.label} produces a draft: a Review a draft method (platform spec 5.4)`,
    root: stack(items),
  };
}

/** After a draft is discarded (design system spec 5.1, Review a draft, step 5). */
export function discardedNotice(draft: DraftView): ViewNode {
  return {
    component: 'Alert',
    props: { variant: 'info', title: `${draft.methodLabel} draft discarded for ${draft.objectIdentifier}`, isInline: true, component: 'p' },
    children: [text('Nothing on the object changed. The discarded draft stays in the record.')],
  };
}

/** Rows of an object for comparison: state, then properties, then outgoing links, each by label. */
function compareRows(view: ObjectView): Map<string, string> {
  const rows = new Map<string, string>();
  for (const [k, v] of Object.entries(view.state).sort(([a], [b]) => a.localeCompare(b))) rows.set(k, v);
  for (const [k, v] of Object.entries(view.properties).sort(([a], [b]) => a.localeCompare(b))) rows.set(k, v);
  for (const l of view.links.filter((l) => l.direction === 'out')) rows.set(l.label, l.objects.map((o) => o.identifier).join(', '));
  return rows;
}

function compareCard(view: ObjectView, rows: string[], other?: Map<string, string>): ViewNode {
  const own = compareRows(view);
  return {
    component: 'GridItem',
    props: { span: 12, md: 6 },
    children: [
      {
        component: 'Card',
        props: { isFullHeight: true },
        children: [
          {
            component: 'CardHeader',
            children: [text(`${view.identifier} · ${view.typeLabel}`, 'small'), { component: 'CardTitle', props: { label: view.title, component: 'h2' } }],
          },
          {
            component: 'CardBody',
            children: [
              {
                component: 'DescriptionList',
                props: { isCompact: true },
                children: rows.map((row) => {
                  const value = own.get(row) ?? '—';
                  const differs = other !== undefined && (other.get(row) ?? '—') !== value;
                  return {
                    component: 'DescriptionListGroup',
                    children: [
                      { component: 'DescriptionListTerm', props: { label: row } },
                      {
                        component: 'DescriptionListDescription',
                        children: [
                          {
                            component: 'Flex',
                            props: { gap: { default: 'gapSm' }, flexWrap: { default: 'wrap' } },
                            children: [text(value), ...(differs ? [{ component: 'Label', props: { label: 'Different', color: 'orange', isCompact: true } }] : [])],
                          },
                        ],
                      },
                    ],
                  };
                }),
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Compare and decide (design system spec 5.1): the object and the chosen one side by side, differences
 * marked, then the preview and the decision. Takes the place of the view it was opened from.
 */
export function buildCompareView(
  composition: MethodComposition,
  state: PreviewState,
  self: ObjectView,
  other: ObjectView | undefined,
  submitting = false,
  minimizable = false,
): ViewSpec {
  const title = `${composition.label} ${composition.object.identifier}`;
  const pick = composition.inputs.find((i) => i.kind === 'object');
  const items: ViewNode[][] = [
    pageTitle(title, composition.object.title, minimizable),
    [{ component: 'Form', children: composition.inputs.map(fieldFor) }],
  ];
  if (other) {
    const selfRows = compareRows(self);
    const otherRows = compareRows(other);
    const rows = [...new Set([...selfRows.keys(), ...otherRows.keys()])];
    items.push([{ component: 'Grid', props: { hasGutter: true }, children: [compareCard(self, rows, otherRows), compareCard(other, rows, selfRows)] }]);
  }
  items.push(previewSection(composition, state, `Choose ${pick ? pick.label.toLowerCase() : 'every field'} to compare and see what will change.`));
  items.push([
    {
      component: 'Flex',
      props: { gap: { default: 'gapMd' }, flexWrap: { default: 'wrap' } },
      children: [
        { component: 'Button', props: { label: composition.label, variant: 'primary', isDisabled: state.status !== 'ready' || submitting }, intent: 'submit' },
        { component: 'Button', props: { label: 'Cancel', variant: 'link' }, intent: 'cancel' },
      ],
    },
  ]);
  return {
    pattern: 'compare-and-decide',
    because: `${composition.label} is a Compare and decide method (platform spec 5.4)`,
    root: stack(items),
  };
}

const normalName = (n: string) => n.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

/** Whether the typed name matches the signer's. The gateway checks again on commit. */
export function nameMatches(composition: MethodComposition, typed: string | undefined): boolean {
  return Boolean(composition.signature && typed && normalName(typed) === normalName(composition.signature.signerName));
}

/**
 * Review and sign (design system spec 5.1): a Wizard in a modal. Review shows the inputs and the preview;
 * Sign shows who signs, what the signature means and when it is recorded, then takes the typed name.
 */
export function buildSignView(composition: MethodComposition, state: PreviewState, values: Record<string, string>, submitting = false, minimizable = false): ViewSpec {
  const title = `${composition.label} ${composition.object.identifier}`;
  const signature = composition.signature!;
  const review: ViewNode[][] = [];
  if (composition.inputs.length) review.push([{ component: 'Form', children: composition.inputs.map(fieldFor) }]);
  review.push(previewSection(composition, state));
  const sign: ViewNode[][] = [
    [
      {
        component: 'DescriptionList',
        props: { isCompact: true },
        children: [
          ['Signer', signature.signerName],
          ['Meaning of this signature', signature.meaning],
          ['Date and time', 'Recorded when you sign'],
        ].map(([term, value]) => ({
          component: 'DescriptionListGroup',
          children: [
            { component: 'DescriptionListTerm', props: { label: term } },
            { component: 'DescriptionListDescription', children: [text(value)] },
          ],
        })),
      },
    ],
  ];
  if (signature.development) {
    sign.push([
      {
        component: 'Alert',
        props: { variant: 'warning', title: 'Development signature', isInline: true, component: 'h3' },
        children: [text('This is not a valid electronic signature. Signing for real needs the identity provider, which is not connected yet.')],
      },
    ]);
  }
  sign.push([
    {
      component: 'Form',
      children: [
        {
          component: 'FormGroup',
          props: { label: 'Type your full name to sign', isRequired: true },
          children: [{ component: 'TextInput', props: { 'aria-label': 'Type your full name to sign', isRequired: true }, field: SIGNATURE_FIELD }],
        },
      ],
    },
  ]);
  return {
    pattern: 'review-and-sign',
    because: `${composition.label} is a Review and sign method (platform spec 5.4)`,
    root: {
      component: 'Modal',
      props: { variant: 'medium', 'aria-label': title },
      children: [
        // With Minimize, the modal's own header carries the title, Minimize and close; otherwise the wizard's does.
        ...(minimizable ? [modalHeader(title, composition.object.title, true)] : []),
        {
          component: 'Wizard',
          props: { navAriaLabel: `${title} steps` },
          children: [
            ...(minimizable ? [] : [{ component: 'WizardHeader', props: { title, description: composition.object.title, closeButtonAriaLabel: 'Close' } } as ViewNode]),
            { component: 'WizardStep', props: { name: 'Review', id: 'review', footer: { isNextDisabled: state.status !== 'ready' } }, children: [stack(review)] },
            {
              component: 'WizardStep',
              props: {
                name: 'Sign',
                id: 'sign',
                footer: { nextButtonText: composition.label, isNextDisabled: state.status !== 'ready' || !nameMatches(composition, values[SIGNATURE_FIELD]) || submitting },
              },
              children: [stack(sign)],
            },
          ],
        },
      ],
    },
  };
}

/** When a method cannot even be composed, such as when the role may not run it: the reasons, in a modal, with Cancel. */
export function buildRefusedView(reasons: string[]): ViewSpec {
  return {
    pattern: 'confirm',
    because: 'The gateway refused to compose the method',
    root: {
      component: 'Modal',
      props: { variant: 'small', 'aria-label': 'This cannot run' },
      children: [
        { component: 'ModalHeader', props: { title: 'This cannot run' } },
        { component: 'ModalBody', children: [{ component: 'Alert', props: { variant: 'danger', title: 'The gateway refused it', isInline: true, component: 'h2' }, children: reasons.map((r) => text(r)) }] },
        { component: 'ModalFooter', children: [{ component: 'Button', props: { label: 'Close', variant: 'primary' }, intent: 'cancel' }] },
      ],
    },
  };
}

/** The success message after a commit (design system spec 5.1, step 6). */
export function successNotice(composition: MethodComposition, result: CommitResult): ViewNode {
  if (result.run) return runNotice(result.run);
  // Long text, such as an accepted narrative, is shortened here: the object holds it whole.
  const lines = changeLines(composition, result).map((l) => (l.value.length > 160 ? { ...l, value: `${l.value.slice(0, 157).trimEnd()}…` } : l));
  if (result.fromDraft) {
    lines.push({ term: 'From a generated draft', value: `written by ${result.fromDraft.model}, ${result.fromDraft.edited ? 'edited before it was accepted' : 'accepted as written'}` });
  }
  if (result.signature) {
    lines.push({ term: 'Signed by', value: `${result.signature.signerName}${result.signature.development ? ' (development signature, not valid)' : ''}` });
  }
  return {
    component: 'Alert',
    // Above the page's main heading, so its title is a paragraph, not a heading.
    props: { variant: 'success', title: `${composition.label} done on ${composition.object.identifier}`, isInline: true, component: 'p' },
    children: lines.map((l) => text(`${l.term}: ${l.value}`)),
  };
}

// ---------------------------------------------------------------- progress in the dock (design system spec 5.1)

/** How far along a process is, in its archetype's terms, for the dock. The same measure for every method of an archetype. */
export function processProgress(
  composition: MethodComposition,
  state: PreviewState,
  values: Record<string, string>,
  extra: { run?: RunView; draft?: DraftState; editing?: boolean } = {},
): Progress {
  const archetype = composition.archetype.label;
  if (archetype === 'Review a draft') {
    const draft = extra.draft;
    if (!draft || draft.status === 'drafting') return { fraction: null, words: 'Drafting' };
    if (draft.status === 'refused') return { fraction: 0, words: 'Cannot be drafted', status: 'danger' };
    return { fraction: 1, words: extra.editing ? 'Editing' : 'Draft ready' };
  }
  if (archetype === 'Start and track' && extra.run) {
    const run = extra.run;
    if (run.status === 'succeeded') return { fraction: 1, words: 'Finished', status: 'success' };
    if (run.status === 'failed') return { fraction: 1, words: 'Failed', status: 'danger' };
    if (run.status === 'queued') return { fraction: 0, words: 'Waiting to start' };
    const percent = Math.round((run.progress ?? 0) * 100);
    return { fraction: run.progress ?? 0, words: `Running, ${percent}%` };
  }
  if (state.status === 'refused') return { fraction: 0, words: 'Cannot run', status: 'danger' };
  const ready = state.status === 'ready';
  const readyWords: Record<string, string> = { Confirm: 'Ready to confirm', 'Review and sign': 'Ready to sign', 'Start and track': 'Ready to start' };
  if (ready) return { fraction: 1, words: readyWords[archetype] ?? 'Ready to commit' };
  const needed = composition.inputs.length;
  if (!needed) return { fraction: 0, words: 'Checking' };
  const given = composition.inputs.filter((i) => values[i.name]?.trim()).length;
  return { fraction: given / (needed + 1), words: `${given} of ${needed} ${needed === 1 ? 'field' : 'fields'}` };
}

/** Minimize (design system spec 5.1): a minus icon with a tooltip, left of the close button, or at the right of a page's title. */
export const minimizeButton: ViewNode = {
  component: 'Tooltip',
  props: { content: 'Minimize' },
  children: [{ component: 'Button', props: { variant: 'plain', icon: 'minus', 'aria-label': 'Minimize' }, intent: 'minimize' }],
};

/** A modal's header: the process's title and its object's type, and Minimize beside the close button when it can be set aside. */
function modalHeader(title: string, description: string, minimizable: boolean): ViewNode {
  return { component: 'ModalHeader', props: { title, description }, ...(minimizable ? { children: [minimizeButton] } : {}) };
}

/** A page pattern's title row: the title and its object's type, and Minimize at the right when it can be set aside. */
function pageTitle(title: string, description: string, minimizable: boolean): ViewNode[] {
  const heading: ViewNode[] = [{ component: 'Title', props: { label: title, headingLevel: 'h1' } }, text(description, 'small')];
  if (!minimizable) return heading;
  return [
    {
      component: 'Flex',
      props: { justifyContent: { default: 'justifyContentSpaceBetween' }, alignItems: { default: 'alignItemsFlexStart' }, flexWrap: { default: 'nowrap' } },
      children: [{ component: 'FlexItem', children: heading }, { component: 'FlexItem', children: [minimizeButton] }],
    },
  ];
}
