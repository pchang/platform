import type { ViewNode, ViewSpec } from '../design-system/catalog';
import type { ObjectSummary, ToDoItem } from '../data/client';

/**
 * To do and object lists as view specs (design system spec 4.3), composed from what the gateway returns.
 * Everything on these pages is drawn by the renderer from catalog components.
 */

const text = (label: string, component?: 'p' | 'small'): ViewNode => ({ component: 'Content', props: component ? { label, component } : { label } });
const flexOf = (children: ViewNode[]): ViewNode => ({
  component: 'Flex',
  props: { gap: { default: 'gapSm' }, flexWrap: { default: 'wrap' } },
  children,
});
const stack = (items: ViewNode[][]): ViewNode => ({ component: 'Stack', props: { hasGutter: true }, children: items.map((children) => ({ component: 'StackItem', children })) });
const gallery = (items: ViewNode[]): ViewNode => ({ component: 'Gallery', props: { hasGutter: true, minWidths: { default: '100%', md: '20rem' } }, children: items });

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function stateLabels(object: ObjectSummary): ViewNode[] {
  return Object.entries(object.state)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dimension, value]) => ({ component: 'Label', props: { label: `${dimension}: ${value}`, color: 'grey', variant: 'outline', isCompact: true } }));
}

function card(object: ObjectSummary, body: ViewNode[][]): ViewNode {
  return {
    component: 'GalleryItem',
    children: [
      {
        component: 'Card',
        props: { isFullHeight: true },
        children: [
          { component: 'CardTitle', props: { label: object.identifier, component: 'h2' } },
          { component: 'CardBody', children: [stack([[text(object.typeLabel, 'small')], ...body])] },
        ],
      },
    ],
  };
}

function header(title: string, summary: string): ViewNode[] {
  return [{ component: 'Title', props: { label: title, headingLevel: 'h1' } }, text(summary)];
}

export function buildTodoView(items: ToDoItem[], who: string): ViewSpec {
  const cards = items.map((item) => {
    const status: ViewNode[] = [];
    if (item.deadline) status.push({ component: 'Label', props: { label: `Due ${formatDate(item.deadline)}`, status: 'warning' } });
    if (item.urgency >= 3) status.push({ component: 'Label', props: { label: 'Urgent', status: 'danger' } });
    const body: ViewNode[][] = [];
    if (status.length) body.push([flexOf(status)]);
    body.push([flexOf(stateLabels(item.object))]);
    body.push([
      item.tasks.length
        ? text(`Waiting for you: ${item.tasks.map((t) => t.label).join(', ')}`)
        : text(`You can: ${item.actions.map((a) => a.label).join(', ')}`),
    ]);
    return card(item.object, body);
  });
  const summary = items.length
    ? `${items.length} ${items.length === 1 ? 'item needs' : 'items need'} ${who}. Nearest deadline first, then the most urgent.`
    : `Nothing needs ${who} right now.`;
  return {
    pattern: 'card-view',
    because: `To do for ${who}: objects with a task they can run now, or urgent objects they can act on`,
    root: stack([header('To do', summary), ...(cards.length ? [[gallery(cards)]] : [])]),
  };
}

export function buildTypeView(pluralLabel: string, objects: ObjectSummary[]): ViewSpec {
  return {
    pattern: 'card-view',
    because: `The ${pluralLabel.toLowerCase()} the person may read`,
    root: stack([
      header(pluralLabel, `${objects.length} ${objects.length === 1 ? 'object' : 'objects'}.`),
      ...(objects.length ? [[gallery(objects.map((o) => card(o, [[flexOf(stateLabels(o))]])))]] : []),
    ]),
  };
}

export const loadingView: ViewSpec = {
  pattern: 'card-view',
  because: 'Waiting for the gateway',
  root: { component: 'Bullseye', children: [{ component: 'Spinner', props: { size: 'lg', 'aria-valuetext': 'Loading' } }] },
};
