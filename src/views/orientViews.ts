import type { ViewNode, ViewSpec } from '../design-system/catalog';
import type { MethodOption, ObjectSummary, RunView, ToDoItem } from '../data/client';
import { BUILT_ARCHETYPES } from './composeView';

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

type Runnable = { method: string; label: string; archetype: { label: string } };

/** Methods as buttons named for them when their archetype's pattern is built; otherwise as text. */
function runnable(methods: Runnable[], object: string, firstIsPrimary: boolean): ViewNode[][] {
  const built = methods.filter((t) => BUILT_ARCHETYPES.has(t.archetype.label));
  const notYet = methods.filter((t) => !BUILT_ARCHETYPES.has(t.archetype.label));
  const rows: ViewNode[][] = [];
  if (built.length) {
    rows.push([
      flexOf(
        built.map((t, i) => ({
          component: 'Button',
          props: { label: t.label, variant: i === 0 && firstIsPrimary ? 'primary' : 'secondary', size: 'sm' },
          action: { method: t.method, target: object },
        })),
      ),
    ]);
  }
  if (notYet.length) rows.push([text(`${notYet.map((t) => `${t.label} (${t.archetype.label}, coming soon)`).join(', ')}`, 'small')]);
  return rows;
}

/** A status label for each run on the object that has not ended (design system spec 4.3). */
function runLabels(object: ObjectSummary, runs: RunView[]): ViewNode[] {
  return runs
    .filter((r) => r.object === object.iri && (r.status === 'queued' || r.status === 'running'))
    .map((r) => ({ component: 'Label', props: { label: `${r.methodLabel}: ${r.status === 'queued' ? 'waiting to start' : 'running'}`, status: 'info' } }));
}

function header(title: string, summary: string): ViewNode[] {
  return [{ component: 'Title', props: { label: title, headingLevel: 'h1' } }, text(summary)];
}

export function buildTodoView(items: ToDoItem[], who: string, notice?: ViewNode, runs: RunView[] = []): ViewSpec {
  const cards = items.map((item) => {
    const status: ViewNode[] = [];
    if (item.deadline) status.push({ component: 'Label', props: { label: `Due ${formatDate(item.deadline)}`, status: 'warning' } });
    if (item.urgency >= 3) status.push({ component: 'Label', props: { label: 'Urgent', status: 'danger' } });
    status.push(...runLabels(item.object, runs));
    const body: ViewNode[][] = [];
    if (status.length) body.push([flexOf(status)]);
    body.push([flexOf(stateLabels(item.object))]);
    // Each task is a button named for its method when its archetype's pattern is built; otherwise text.
    const waiting = item.tasks.length ? item.tasks : item.actions;
    body.push([text(item.tasks.length ? 'Waiting for you:' : 'You can:', 'small')]);
    body.push(...runnable(waiting, item.object.iri, item.tasks.length > 0));
    return card(item.object, body);
  });
  const summary = items.length
    ? `${items.length} ${items.length === 1 ? 'item needs' : 'items need'} ${who}. Nearest deadline first, then the most urgent.`
    : `Nothing needs ${who} right now.`;
  return {
    pattern: 'card-view',
    because: `To do for ${who}: objects with a task they can run now, or urgent objects they can act on`,
    root: stack([...(notice ? [[notice]] : []), header('To do', summary), ...(cards.length ? [[gallery(cards)]] : [])]),
  };
}

/**
 * A type's objects (design system spec 4.3). Each card offers the methods the person can run on it now, which is how
 * on-demand methods are reached, and shows runs in progress.
 */
export function buildTypeView(pluralLabel: string, objects: ObjectSummary[], options: { methods?: Map<string, MethodOption[]>; runs?: RunView[]; notice?: ViewNode } = {}): ViewSpec {
  const cards = objects.map((o) => {
    const body: ViewNode[][] = [];
    const running = runLabels(o, options.runs ?? []);
    if (running.length) body.push([flexOf(running)]);
    body.push([flexOf(stateLabels(o))]);
    const available = (options.methods?.get(o.iri) ?? []).filter((m) => m.available);
    if (available.length) body.push([text('You can:', 'small')], ...runnable(available, o.iri, false));
    return card(o, body);
  });
  return {
    pattern: 'card-view',
    because: `The ${pluralLabel.toLowerCase()} the person may read, with the methods they can run on each now`,
    root: stack([
      ...(options.notice ? [[options.notice]] : []),
      header(pluralLabel, `${objects.length} ${objects.length === 1 ? 'object' : 'objects'}.`),
      ...(cards.length ? [[gallery(cards)]] : []),
    ]),
  };
}

export const loadingView: ViewSpec = {
  pattern: 'card-view',
  because: 'Waiting for the gateway',
  root: { component: 'Bullseye', children: [{ component: 'Spinner', props: { size: 'lg', 'aria-valuetext': 'Loading' } }] },
};
