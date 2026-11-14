import type { ViewNode, ViewSpec } from '../design-system/catalog';
import type { CommitResult, MethodComposition, ObjectSummary } from '../data/client';
import { changeLines, fieldFor } from './composeView';

/**
 * A batch action (platform spec 5.4, Acting on many objects; design system spec 4.3): the method's archetype once for
 * every chosen object. The inputs are given once; each object is previewed and committed on its own.
 */

/** The archetypes that run for many objects. Others stay with one object at a time (platform spec 5.4). */
export const BATCH_ARCHETYPES = new Set(['Confirm', 'Fill in']);

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
    const lines = changeLines(forObject(composition, object), preview);
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
