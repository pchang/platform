import type { ViewNode, ViewSpec } from '../design-system/catalog';
import type { MethodOption, ObjectSummary, RunView, SearchResult, ToDoItem } from '../data/client';
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
          // The identifier and type in small text, then the object's title as the card's heading (design system spec 4.3).
          {
            component: 'CardHeader',
            children: [text(`${object.identifier} · ${object.typeLabel}`, 'small'), { component: 'CardTitle', props: { label: object.title, component: 'h2' } }],
          },
          { component: 'CardBody', children: [stack(body)] },
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

// ---------------------------------------------------------------- the To do summary (design system spec 4.3)

/** The field the summary's count tiles set: which items the cards show. */
export const TODO_FILTER_FIELD = 'todoFilter';
export type TodoFilter = 'all' | 'urgent' | 'due' | 'overdue';
const DUE_WITHIN_DAYS = 7;

/** Days from today to an ISO date, by calendar date in UTC, as deadlines are stored. */
const daysUntil = (iso: string, today: Date) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86_400_000);

/** Whether an item is in a filter's set. Overdue items are not also counted as due. */
export function matchesFilter(item: ToDoItem, filter: TodoFilter, today: Date): boolean {
  if (filter === 'urgent') return item.urgency >= 3;
  if (!item.deadline) return filter === 'all';
  const days = daysUntil(item.deadline, today);
  if (filter === 'overdue') return days < 0;
  if (filter === 'due') return days >= 0 && days <= DUE_WITHIN_DAYS;
  return true;
}

function countTile(filter: TodoFilter, title: string, count: number): ViewNode {
  return {
    component: 'GridItem',
    props: { span: 6, md: 3 },
    children: [
      {
        component: 'Card',
        props: { isSelectable: true, value: filter, isFullHeight: true, isCompact: true },
        field: TODO_FILTER_FIELD,
        children: [
          { component: 'CardTitle', props: { label: title, component: 'h3' } },
          { component: 'CardBody', children: [{ component: 'Content', props: { label: String(count), isEditorial: true } }] },
        ],
      },
    ],
  };
}

/** The chart color token for a lifecycle stage: earliest to latest, five steps, from PatternFly's chart tokens. */
export const stageColor = (position: number) => `var(--pf-t--chart--color--blue--${Math.min(position + 1, 5)}00)`;
const GAP = 'var(--pf-t--global--background--color--primary--default)';

/** One row per object type: its name and count, then a thin segmented bar by lifecycle stage on a shared scale. */
function workByStage(items: ToDoItem[]): ViewNode[] {
  const byType = new Map<string, { singular: string; plural: string; stages: string[]; counts: number[]; total: number }>();
  for (const { object } of items) {
    if (!object.lifecycle) continue;
    const entry = byType.get(object.type) ?? { singular: object.typeLabel, plural: object.pluralLabel, stages: object.lifecycle.stages, counts: object.lifecycle.stages.map(() => 0), total: 0 };
    entry.counts[object.lifecycle.position]++;
    entry.total++;
    byType.set(object.type, entry);
  }
  const rows = [...byType.values()].sort((a, b) => b.total - a.total || a.plural.localeCompare(b.plural));
  if (!rows.length) return [];
  const max = Math.max(...rows.map((r) => r.total));
  return rows.map((row) => {
    const parts = row.counts.map((count, position) => ({ count, position, stage: row.stages[position] })).filter((p) => p.count > 0);
    const name = row.plural;
    const description = `${row.total} ${(row.total === 1 ? row.singular : name).toLowerCase()}: ${parts.map((p) => `${p.count} ${p.stage}`).join(', ')}.`;
    return {
      component: 'StackItem',
      children: [
        {
          component: 'Flex',
          props: { justifyContent: { default: 'justifyContentSpaceBetween' }, gap: { default: 'gapSm' } },
          children: [text(name), text(String(row.total))],
        },
        {
          component: 'Chart',
          props: {
            ariaTitle: `${name} by stage`,
            ariaDesc: description,
            horizontal: true,
            showAxis: false,
            // An 8px bar, then one row of legend; the renderer adds a row of height for each row the legend wraps onto.
            height: 52,
            padding: { top: 0, bottom: 44, left: 0, right: 0 },
            domain: { y: [0, max] },
            legendData: parts.map((p) => ({ name: `${p.stage} ${p.count}`, symbol: { fill: stageColor(p.position), type: 'square' } })),
            legendPosition: 'bottom-left',
            legendAllowWrap: true,
          },
          children: [
            {
              component: 'ChartStack',
              children: parts.map((p, i) => ({
                component: 'ChartBar',
                props: {
                  data: [{ x: name, y: p.count, name: p.stage }],
                  barWidth: 8,
                  // A thin segmented bar has fully rounded ends and a 2px surface gap between parts.
                  cornerRadius: { bottom: i === 0 ? 4 : 0, top: i === parts.length - 1 ? 4 : 0 },
                  style: { data: { fill: stageColor(p.position), stroke: GAP, strokeWidth: 2 } },
                },
              })),
            },
          ],
        },
      ],
    } as ViewNode;
  });
}

/** The summary above To do's cards: counts that narrow the list, and work by type and stage. */
export function buildSummary(items: ToDoItem[], today: Date): ViewNode[] {
  const count = (f: TodoFilter) => items.filter((i) => matchesFilter(i, f, today)).length;
  const stages = workByStage(items);
  return [
    {
      component: 'Grid',
      props: { hasGutter: true },
      children: [
        countTile('all', 'Waiting', items.length),
        countTile('urgent', 'Urgent', count('urgent')),
        countTile('due', `Due within ${DUE_WITHIN_DAYS} days`, count('due')),
        countTile('overdue', 'Overdue', count('overdue')),
      ],
    },
    ...(stages.length
      ? [
          {
            component: 'Card',
            children: [
              { component: 'CardTitle', props: { label: 'Work by type and stage', component: 'h3' } },
              { component: 'CardBody', children: [{ component: 'Stack', props: { hasGutter: true }, children: stages }] },
            ],
          } as ViewNode,
        ]
      : []),
  ];
}

export function buildTodoView(
  allItems: ToDoItem[],
  who: string,
  notice?: ViewNode,
  runs: RunView[] = [],
  options: { filter?: TodoFilter; today?: Date } = {},
): ViewSpec {
  const today = options.today ?? new Date();
  const filter = options.filter ?? 'all';
  const items = allItems.filter((i) => matchesFilter(i, filter, today));
  const cards = items.map((item) => {
    const status: ViewNode[] = [];
    // A deadline already past says so, as a danger, not a warning.
    if (item.deadline) {
      const overdue = daysUntil(item.deadline, today) < 0;
      status.push({ component: 'Label', props: { label: `${overdue ? 'Overdue since' : 'Due'} ${formatDate(item.deadline)}`, status: overdue ? 'danger' : 'warning' } });
    }
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
  const summary = allItems.length
    ? `${allItems.length} ${allItems.length === 1 ? 'item needs' : 'items need'} ${who}. Nearest deadline first, then the most urgent.`
    : `Nothing needs ${who} right now.`;
  const narrowed = filter !== 'all' && allItems.length > 0;
  return {
    pattern: 'card-view',
    because: `To do for ${who}: objects with a task they can run now, or urgent objects they can act on`,
    root: stack([
      ...(notice ? [[notice]] : []),
      header('To do', summary),
      ...(allItems.length ? [[{ component: 'Title', props: { label: 'At a glance', headingLevel: 'h2', size: 'lg' } } as ViewNode, stack(buildSummary(allItems, today).map((n) => [n]))]] : []),
      ...(narrowed && !items.length ? [[text('Nothing matches. Choose Waiting to see every item.')]] : []),
      ...(cards.length ? [[gallery(cards)]] : []),
    ]),
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

/** What a search understood, as labels: the types, states, links and words it used (platform spec 5.2). */
function understood(result: SearchResult): ViewNode[] {
  const i = result.interpretation;
  const label = (text: string): ViewNode => ({ component: 'Label', props: { label: text, color: 'blue', isCompact: true } });
  return [
    ...i.types.map((t) => label(`Type: ${t.label}`)),
    ...i.states.map((s) => label(`${s.dimensionLabel}: ${s.label}`)),
    ...i.identifiers.map((o) => label(i.types.length ? `Linked to ${o.identifier}` : `Identifier: ${o.identifier}`)),
    ...(i.words.length ? [label(`Words: ${i.words.join(' ')}`)] : []),
    ...(i.mine ? [label('Yours')] : []),
  ];
}

/**
 * The search page (design system spec 4.1, Search): how the query was understood, then the results as cards like an
 * object list, each saying why it matched and offering the methods the person can run now.
 */
export function buildSearchView(result: SearchResult, options: { methods?: Map<string, MethodOption[]>; runs?: RunView[]; notice?: ViewNode } = {}): ViewSpec {
  const cards = result.results.map(({ object: o, matched }) => {
    const body: ViewNode[][] = [];
    const running = runLabels(o, options.runs ?? []);
    if (running.length) body.push([flexOf(running)]);
    body.push([flexOf(stateLabels(o))]);
    if (matched.length) body.push([text(`Matched: ${matched.join(' · ')}`, 'small')]);
    const available = (options.methods?.get(o.iri) ?? []).filter((m) => m.available);
    if (available.length) body.push([text('You can:', 'small')], ...runnable(available, o.iri, false));
    return card(o, body);
  });
  const chips = understood(result);
  const count = result.total === 0 ? 'Nothing matches' : `${result.total} ${result.total === 1 ? 'match' : 'matches'}`;
  const shown = result.total > result.results.length ? `, the best ${result.results.length} shown` : '';
  return {
    pattern: 'card-view',
    because: `Search for "${result.query}": the objects the person may read that it finds, best first`,
    root: stack([
      ...(options.notice ? [[options.notice]] : []),
      header('Search', `${count} for “${result.query}”${shown}.`),
      [text('model' in result.understoodBy ? `Understood by ${result.understoodBy.model}` : 'Understood from the ontology', 'small'), ...(chips.length ? [flexOf(chips)] : [])],
      ...(result.total === 0 ? [[text('Try fewer words, a type such as “queries”, a state such as “open”, or an identifier such as SC-003.')]] : []),
      ...(cards.length ? [[gallery(cards)]] : []),
    ]),
  };
}

export const loadingView: ViewSpec = {
  pattern: 'card-view',
  because: 'Waiting for the gateway',
  root: { component: 'Bullseye', children: [{ component: 'Spinner', props: { size: 'lg', 'aria-valuetext': 'Loading' } }] },
};
