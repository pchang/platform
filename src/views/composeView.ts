import type { ViewNode, ViewSpec } from '../design-system/catalog';
import type { CommitResult, MethodComposition, ObjectView } from '../data/client';
import type { ComposedInput } from '../gateway/gateway';

/**
 * The Confirm and Fill in patterns (design system spec 5.1), as view specs. The pattern is fixed by the
 * method's archetype; only the content comes from the method, the object and the gateway's preview.
 */

/** The archetypes built so far. Tasks of other archetypes are shown as text until their pattern exists. */
export const BUILT_ARCHETYPES = new Set(['Confirm', 'Fill in', 'Compare and decide']);

/** Archetypes whose pattern takes the place of the view, rather than opening over it (design system spec 5.1). */
export const PAGE_ARCHETYPES = new Set(['Compare and decide']);

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
      { component: 'Alert', props: { variant: 'danger', title: `${composition.label} cannot run`, isInline: true }, children: state.reasons.map((r) => text(r)) },
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

export function buildComposeView(composition: MethodComposition, state: PreviewState, submitting = false): ViewSpec {
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
        { component: 'ModalHeader', props: { title, description: composition.object.typeLabel } },
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
          { component: 'CardTitle', props: { label: view.identifier, component: 'h2' } },
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
): ViewSpec {
  const title = `${composition.label} ${composition.object.identifier}`;
  const pick = composition.inputs.find((i) => i.kind === 'object');
  const items: ViewNode[][] = [
    [{ component: 'Title', props: { label: title, headingLevel: 'h1' } }, text(composition.object.typeLabel, 'small')],
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
        { component: 'ModalBody', children: [{ component: 'Alert', props: { variant: 'danger', title: 'The gateway refused it', isInline: true }, children: reasons.map((r) => text(r)) }] },
        { component: 'ModalFooter', children: [{ component: 'Button', props: { label: 'Close', variant: 'primary' }, intent: 'cancel' }] },
      ],
    },
  };
}

/** The success message after a commit (design system spec 5.1, step 6). */
export function successNotice(composition: MethodComposition, result: CommitResult): ViewNode {
  const lines = changeLines(composition, result);
  return {
    component: 'Alert',
    props: { variant: 'success', title: `${composition.label} done on ${composition.object.identifier}`, isInline: true },
    children: lines.map((l) => text(`${l.term}: ${l.value}`)),
  };
}
