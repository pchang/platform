import type { ViewNode, ViewSpec } from '../design-system/catalog';
import type { CommitResult, MethodComposition, ObjectSummary } from '../data/client';
import type { ComposedInput } from '../gateway/gateway';
import { changeLines, fieldFor } from './composeView';

/**
 * A batch action (platform spec 5.4, Acting on many objects; design system spec 4.3): the method's archetype once for
 * every chosen object. The inputs are given once; each object is previewed and committed on its own.
 */

/** The archetypes that run for many objects. Others stay with one object at a time (platform spec 5.4). */
export const BATCH_ARCHETYPES = new Set(['Confirm', 'Fill in']);

/**
 * How a batch runs (platform spec 5.4): together when every input holds for all the objects, or one after another when
 * the ontology marks some input as about each object, such as a note.
 */
export type BatchMode = 'together' | 'one after another';
export const batchModeOf = (composition: MethodComposition): BatchMode => (composition.inputs.some((i) => i.perObject) ? 'one after another' : 'together');

/** The field an input is given in: one for all the objects, or one per object when the input is about each. */
export const fieldKey = (input: ComposedInput, object: ObjectSummary) =>
  input.perObject ? `${input.name}For${object.identifier.replace(/[^A-Za-z0-9]/g, '')}` : input.name;

/** The inputs one object is committed with: the shared values and its own. */
export const inputsFor = (composition: MethodComposition, values: Record<string, string>, object: ObjectSummary): Record<string, string> =>
  Object.fromEntries(composition.inputs.map((i) => [i.name, values[fieldKey(i, object)] ?? '']));

/** True when every input an object needs is given. */
export const isComplete = (composition: MethodComposition, values: Record<string, string>, object: ObjectSummary) =>
  composition.inputs.every((i) => values[fieldKey(i, object)]?.trim());

/** One object's preview, in a batch that runs one after another. */
export type ObjectPreview = { status: 'incomplete' } | { status: 'checking' } | { status: 'ready'; preview?: Omit<CommitResult, 'commit'>; reasons?: string[] };

export type BatchPreview =
  | { status: 'incomplete' }
  | { status: 'checking' }
  | { status: 'ready'; previews: { object: ObjectSummary; preview?: Omit<CommitResult, 'commit'>; reasons?: string[] }[] };

const text = (label: string, component?: 'p' | 'small'): ViewNode => ({ component: 'Content', props: component ? { label, component } : { label } });
const stack = (items: ViewNode[][]): ViewNode => ({ component: 'Stack', props: { hasGutter: true }, children: items.map((children) => ({ component: 'StackItem', children })) });

/** How many objects of a kind, in words: "3 safety cases", or "3 objects" when they are of several types. */
export function countOf(objects: ObjectSummary[]): string {
  const types = new Set(objects.map((o) => o.type));
  const one = objects.length === 1;
  if (types.size > 1) return `${objects.length} ${one ? 'object' : 'objects'}`;
  const name = one ? objects[0].typeLabel : objects[0].pluralLabel;
  return `${objects.length} ${name.split(' ').map((w) => (/^[A-Z]{2}/.test(w) ? w : w.toLowerCase())).join(' ')}`;
}

/** The method aimed at one of the objects, so its preview reads as that object's own changes. */
const forObject = (composition: MethodComposition, object: ObjectSummary): MethodComposition => ({ ...composition, object });

function previews(composition: MethodComposition, state: BatchPreview): ViewNode[] {
  const heading: ViewNode = { component: 'Title', props: { label: 'What will change', headingLevel: 'h2', size: 'md' } };
  if (state.status === 'incomplete') return [heading, text('Fill in every field to see what will change for each.', 'small')];
  if (state.status === 'checking') return [heading, { component: 'Spinner', props: { size: 'md', 'aria-valuetext': 'Checking what will change' } }];
  // Objects whose changes are the same are shown once, under all their identifiers.
  const groups = new Map<string, { objects: ObjectSummary[]; lines: { term: string; value: string }[] }>();
  for (const { object, preview } of state.previews) {
    if (!preview) continue;
    const lines = changeLines(forObject(composition, object), preview, { unnumbered: true });
    const key = JSON.stringify(lines);
    const group = groups.get(key) ?? { objects: [], lines };
    group.objects.push(object);
    groups.set(key, group);
  }
  return [
    heading,
    ...[...groups.values()].map(({ objects, lines }) =>
      stack([
        [{ component: 'Title', props: { label: objects.map((o) => o.identifier).join(', '), headingLevel: 'h3', size: 'md' } }],
        [
          {
            component: 'DescriptionList',
            props: { isCompact: true, isHorizontal: true, termWidth: '16ch' },
            children: lines.map((l) => ({
              component: 'DescriptionListGroup',
              children: [
                { component: 'DescriptionListTerm', props: { label: l.term } },
                { component: 'DescriptionListDescription', children: [text(l.value)] },
              ],
            })),
          },
        ],
      ]),
    ),
    ...state.previews
      .filter((p) => p.reasons)
      .map(
        ({ object, reasons }): ViewNode => ({
          component: 'Alert',
          props: { variant: 'warning', title: `${object.identifier} will be left out`, isInline: true, component: 'h3' },
          children: reasons!.map((r) => text(r)),
        }),
      ),
  ];
}

/** How many of the chosen objects would succeed, once every input is given. */
export const readyCount = (state: BatchPreview) => (state.status === 'ready' ? state.previews.filter((p) => p.preview).length : 0);

export function buildBatchView(composition: MethodComposition, objects: ObjectSummary[], state: BatchPreview, submitting = false): ViewSpec {
  const isConfirm = composition.archetype.label === 'Confirm';
  const title = `${composition.label} ${countOf(objects)}`;
  const ready = readyCount(state);
  const body: ViewNode[][] = [];
  if (composition.inputs.length) body.push([{ component: 'Form', children: composition.inputs.map(fieldFor) }]);
  body.push(previews(composition, state));
  const allReady = state.status === 'ready' && ready === objects.length;
  return {
    pattern: isConfirm ? 'confirm' : 'fill-in',
    because: `${composition.label} is a ${composition.archetype.label} method, run once for every chosen object (platform spec 5.4, Acting on many objects)`,
    root: {
      component: 'Modal',
      props: { variant: 'medium', 'aria-label': title },
      children: [
        { component: 'ModalHeader', props: { title, description: objects.map((o) => o.identifier).join(', ') } },
        { component: 'ModalBody', children: [stack(body)] },
        {
          component: 'ModalFooter',
          children: [
            {
              component: 'Button',
              props: { label: allReady || state.status !== 'ready' ? title : `${composition.label} ${ready} of ${objects.length}`, variant: 'primary', isDisabled: ready === 0 || submitting },
              intent: 'submit',
            },
            { component: 'Button', props: { label: 'Cancel', variant: 'link' }, intent: 'cancel' },
          ],
        },
      ],
    },
  };
}

const changeList = (lines: { term: string; value: string }[]): ViewNode => ({
  component: 'DescriptionList',
  props: { isCompact: true, isHorizontal: true, termWidth: '16ch' },
  children: lines.map((l) => ({
    component: 'DescriptionListGroup',
    children: [
      { component: 'DescriptionListTerm', props: { label: l.term } },
      { component: 'DescriptionListDescription', children: [text(l.value)] },
    ],
  })),
});

const leftOutAlert = (object: ObjectSummary, reasons: string[], headingLevel: 'h3' | 'h4'): ViewNode => ({
  component: 'Alert',
  props: { variant: 'warning', title: `${object.identifier} will be left out`, isInline: true, component: headingLevel },
  children: reasons.map((r) => text(r)),
});

/** One object's step: who it is, its own inputs, and what will change for it. */
function objectStep(composition: MethodComposition, object: ObjectSummary, state: ObjectPreview): ViewNode[][] {
  const own = composition.inputs.filter((i) => i.perObject).map((i) => fieldFor({ ...i, name: fieldKey(i, object) }));
  const heading: ViewNode = { component: 'Title', props: { label: 'What will change', headingLevel: 'h4', size: 'md' } };
  let change: ViewNode[];
  if (state.status === 'incomplete') change = [heading, text(`Fill in every field to see what will change for ${object.identifier}.`, 'small')];
  else if (state.status === 'checking') change = [heading, { component: 'Spinner', props: { size: 'md', 'aria-valuetext': 'Checking what will change' } }];
  else if (state.reasons) change = [leftOutAlert(object, state.reasons, 'h4')];
  else change = [heading, changeList(changeLines(forObject(composition, object), state.preview!, { unnumbered: true }))];
  return [
    [text(`${object.identifier} · ${object.typeLabel}`, 'small'), { component: 'Title', props: { label: object.title, headingLevel: 'h3', size: 'lg' } }],
    [{ component: 'Form', children: own }],
    change,
  ];
}

/**
 * A batch that runs one after another (platform spec 5.4; design system spec 4.3): a Wizard with the shared inputs
 * first, when there are any, then one step per object for its own inputs and preview, then Review, whose button
 * commits them in order.
 */
export function buildSequentialBatchView(
  composition: MethodComposition,
  objects: ObjectSummary[],
  states: Map<string, ObjectPreview>,
  values: Record<string, string>,
  submitting = false,
): ViewSpec {
  const title = `${composition.label} ${countOf(objects)}`;
  const shared = composition.inputs.filter((i) => !i.perObject);
  const stateOf = (o: ObjectSummary): ObjectPreview => states.get(o.iri) ?? { status: 'incomplete' };
  const ready = objects.filter((o) => { const s = stateOf(o); return s.status === 'ready' && s.preview; }).length;
  const allChecked = objects.every((o) => stateOf(o).status === 'ready');

  const steps: ViewNode[] = [];
  if (shared.length) {
    steps.push({
      component: 'WizardStep',
      props: { name: 'For all of them', id: 'shared', footer: { isNextDisabled: !shared.every((i) => values[i.name]?.trim()) } },
      children: [stack([[text(`These hold for ${objects.map((o) => o.identifier).join(', ')}.`)], [{ component: 'Form', children: shared.map(fieldFor) }]])],
    });
  }
  for (const object of objects) {
    steps.push({
      component: 'WizardStep',
      // Next waits for the object's own preview: what will change, or why it will be left out.
      props: { name: object.identifier, id: `object-${object.identifier}`, footer: { isNextDisabled: stateOf(object).status !== 'ready' } },
      children: [stack(objectStep(composition, object, stateOf(object)))],
    });
  }
  const review: ViewNode[][] = [];
  for (const object of objects) {
    const state = stateOf(object);
    if (state.status !== 'ready') review.push([leftOutAlert(object, ['Its inputs are not all given yet.'], 'h4')]);
    else if (state.reasons) review.push([leftOutAlert(object, state.reasons, 'h4')]);
    else review.push([{ component: 'Title', props: { label: `${object.identifier} · ${object.title}`, headingLevel: 'h4', size: 'md' } }, changeList(changeLines(forObject(composition, object), state.preview!, { unnumbered: true }))]);
  }
  steps.push({
    component: 'WizardStep',
    props: {
      name: 'Review',
      id: 'review',
      footer: { nextButtonText: ready === objects.length ? title : `${composition.label} ${ready} of ${objects.length}`, isNextDisabled: !allChecked || ready === 0 || submitting },
    },
    children: [stack([[{ component: 'Title', props: { label: 'What will change', headingLevel: 'h3', size: 'md' } }], ...review])],
  });

  return {
    pattern: composition.archetype.label === 'Confirm' ? 'confirm' : 'fill-in',
    because: `${composition.label} has an input about each object, so it runs one object after another (platform spec 5.4, Acting on many objects)`,
    root: {
      component: 'Modal',
      props: { variant: 'medium', 'aria-label': title },
      children: [
        {
          component: 'Wizard',
          props: { navAriaLabel: `${title} steps`, isVisitRequired: true },
          children: [{ component: 'WizardHeader', props: { title, description: objects.map((o) => o.identifier).join(', '), closeButtonAriaLabel: 'Close' } }, ...steps],
        },
      ],
    },
  };
}

/** The outcome of a batch: every object named, those changed and those left out with why (platform spec 5.4). */
export function batchNotice(composition: MethodComposition, done: ObjectSummary[], leftOut: { object: ObjectSummary; reasons: string[] }[]): ViewNode {
  const lines: ViewNode[] = [];
  if (done.length) lines.push(text(`Done on ${done.map((o) => o.identifier).join(', ')}.`));
  for (const { object, reasons } of leftOut) lines.push(text(`Left out ${object.identifier}: ${reasons.join(' ')}`));
  const title = done.length ? `${composition.label} done on ${countOf(done)}${leftOut.length ? `, ${leftOut.length} left out` : ''}` : `${composition.label} ran on none of them`;
  return {
    component: 'Alert',
    // Above the page's main heading, so its title is a paragraph, not a heading.
    props: { variant: leftOut.length ? 'warning' : 'success', title, isInline: true, component: 'p' },
    children: lines,
  };
}
