import type { ViewNode, ViewSpec } from '../design-system/catalog';
import type { MethodOption, ObjectSummary, RunView, SearchResult, ToDoItem } from '../data/client';
import { BATCH_ARCHETYPES } from './batchView';
import { BUILT_ARCHETYPES } from './composeView';

/**
 * To do and object lists as view specs (design system spec 4.3), composed from what the gateway returns.
 * Everything on these pages is drawn by the renderer from catalog components.
 */

export const text = (label: string, component?: 'p' | 'small'): ViewNode => ({ component: 'Content', props: component ? { label, component } : { label } });
export const flexOf = (children: ViewNode[]): ViewNode => ({
  component: 'Flex',
  props: { gap: { default: 'gapSm' }, flexWrap: { default: 'wrap' } },
  children,
});
export const stack = (items: ViewNode[][]): ViewNode => ({ component: 'Stack', props: { hasGutter: true }, children: items.map((children) => ({ component: 'StackItem', children })) });
export const gallery = (items: ViewNode[]): ViewNode => ({ component: 'Gallery', props: { hasGutter: true, minWidths: { default: '100%', md: '20rem' } }, children: items });

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function stateLabels(object: ObjectSummary): ViewNode[] {
  return Object.entries(object.state)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dimension, value]) => ({ component: 'Label', props: { label: `${dimension}: ${value}`, color: 'grey', variant: 'outline', isCompact: true } }));
}

/** An object's card. Choosing it anywhere but its buttons opens the object in the object panel (design system spec 4.4). */
export function card(object: ObjectSummary, body: ViewNode[][], heading: 'h2' | 'h3' = 'h2'): ViewNode {
  return {
    component: 'GalleryItem',
    children: [
      {
        component: 'Card',
        props: { isFullHeight: true },
        opens: object.iri,
        selects: object.iri,
        children: [
          // The identifier and type in small text, then the object's title as the card's heading (design system spec 4.3).
          {
            component: 'CardHeader',
            children: [text(`${object.identifier} · ${object.typeLabel}`, 'small'), { component: 'CardTitle', props: { label: object.title, component: heading } }],
          },
          { component: 'CardBody', children: [stack(body)] },
        ],
      },
    ],
  };
}

type Runnable = { method: string; label: string; archetype: { label: string } };

/** Methods as buttons named for them when their archetype's pattern is built; otherwise as text. */
export function runnable(methods: Runnable[], object: string, firstIsPrimary: boolean): ViewNode[][] {
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
export function runLabels(object: ObjectSummary, runs: RunView[]): ViewNode[] {
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
export const daysUntil = (iso: string, today: Date) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86_400_000);

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

/** The summary above To do's list: count tiles that narrow it (design system spec 4.3). */
export function buildSummary(items: ToDoItem[], today: Date): ViewNode[] {
  const count = (f: TodoFilter) => items.filter((i) => matchesFilter(i, f, today)).length;
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
  ];
}

// ---------------------------------------------------------------- object lists (design system spec 4.3)

/** The field the list bar's view toggle sets: cards or a list. */
export const LIST_MODE_FIELD = 'listMode';
export type ListMode = 'cards' | 'list';

/** How a list is shown and what is chosen in it, as the view keeps it. */
export interface ListControls {
  mode: ListMode;
  /** Cards show their select control; list rows always have their checkbox. */
  selecting: boolean;
  selected: ReadonlySet<string>;
}
export const NO_CONTROLS: ListControls = { mode: 'cards', selecting: false, selected: new Set() };

/** One object in a list: its status labels, what it offers and what else to say about it. */
export interface ListEntry {
  object: ObjectSummary;
  status: ViewNode[];
  /** Said before its methods on a card, such as "Waiting for you:". */
  intro?: string;
  /** The methods available now, the one to raise first. */
  methods: Runnable[];
  firstIsPrimary: boolean;
  /** More about the object, such as why a search matched it. */
  detail?: string;
}

/** The methods every chosen object has available that run for many (platform spec 5.4, Acting on many objects). */
export function commonMethods(entries: ListEntry[], selected: ReadonlySet<string>): Runnable[] {
  const chosen = entries.filter((e) => selected.has(e.object.iri));
  if (!chosen.length) return [];
  return chosen[0].methods.filter(
    (m) => BATCH_ARCHETYPES.has(m.archetype.label) && BUILT_ARCHETYPES.has(m.archetype.label) && chosen.every((e) => e.methods.some((x) => x.method === m.method)),
  );
}

const barItem = (child: ViewNode): ViewNode => ({ component: 'ToolbarItem', children: [child] });
const separator: ViewNode = { component: 'ToolbarItem', props: { variant: 'separator' } };
/** A plain icon button with a tooltip, named for what it does. */
const iconButton = (icon: string, label: string, intent: 'select'): ViewNode => ({
  component: 'Tooltip',
  props: { content: label },
  children: [{ component: 'Button', props: { variant: 'plain', icon, 'aria-label': label }, intent }],
});
/** Batch actions shown as buttons; the rest go in a … menu. */
const SHOWN_BATCH_ACTIONS = 3;

/**
 * The list bar (design system spec 4.3), after Gmail's: the selection control at its start, the chosen objects' actions
 * beside it while any are chosen, and the view toggle at its end.
 */
function listBar(entries: ListEntry[], controls: ListControls): ViewNode {
  const total = entries.length;
  const chosen = entries.filter((e) => controls.selected.has(e.object.iri)).length;
  const start: ViewNode[] = [];
  if (controls.mode === 'cards' && !controls.selecting) {
    start.push(barItem(iconButton('outlined-check-square', 'Select', 'select')));
  } else {
    if (controls.mode === 'cards') start.push(barItem(iconButton('times', 'Done selecting', 'select')));
    start.push(
      barItem({
        component: 'Dropdown',
        props: { 'aria-label': 'Choose which to select', toggle: 'bulk-select', checked: chosen === 0 ? 'none' : chosen === total ? 'all' : 'some', count: chosen },
        children: [
          { component: 'DropdownItem', props: { label: `Select all (${total})` }, intent: 'select-all' },
          { component: 'DropdownItem', props: { label: 'Select none' }, intent: 'clear-selection' },
        ],
      }),
    );
  }
  if (chosen) {
    const batch = commonMethods(entries, controls.selected);
    start.push(separator);
    if (!batch.length) start.push(barItem(text(`No action applies to all ${chosen === 1 ? 'of it' : 'of them'}.`, 'small')));
    for (const m of batch.slice(0, SHOWN_BATCH_ACTIONS)) start.push(barItem({ component: 'Button', props: { label: m.label, variant: 'plain' }, batch: m.method }));
    const more = batch.slice(SHOWN_BATCH_ACTIONS);
    if (more.length) {
      start.push(
        barItem({
          component: 'Dropdown',
          props: { 'aria-label': 'More actions for the selected' },
          children: more.map((m) => ({ component: 'DropdownItem', props: { label: m.label }, batch: m.method })),
        }),
      );
    }
  }
  const groups: ViewNode[] = [
    { component: 'ToolbarGroup', props: { variant: 'action-group-plain' }, children: start },
    {
      component: 'ToolbarGroup',
      props: { align: { default: 'alignEnd' } },
      children: [
        barItem({
          component: 'ToggleGroup',
          props: { 'aria-label': 'Show objects as', isCompact: true },
          children: [
            { component: 'ToggleGroupItem', props: { value: 'cards', icon: 'th-large', 'aria-label': 'Cards' }, field: LIST_MODE_FIELD },
            { component: 'ToggleGroupItem', props: { value: 'list', icon: 'list', 'aria-label': 'List' }, field: LIST_MODE_FIELD },
          ],
        }),
      ],
    },
  ];
  // Sticky, so what is chosen and the batch actions stay in view while the person scrolls to choose more.
  return { component: 'Toolbar', props: { isSticky: true }, children: [{ component: 'ToolbarContent', children: groups }] };
}

function entryCard(entry: ListEntry, heading: 'h2' | 'h3'): ViewNode {
  const body: ViewNode[][] = [];
  if (entry.status.length) body.push([flexOf(entry.status)]);
  body.push([flexOf(stateLabels(entry.object))]);
  if (entry.detail) body.push([text(entry.detail, 'small')]);
  if (entry.methods.length) body.push([text(entry.intro ?? 'You can:', 'small')], ...runnable(entry.methods, entry.object.iri, entry.firstIsPrimary));
  return card(entry.object, body, heading);
}

/** The state dimensions of the listed objects, as table columns: each object's lifecycle first, then the rest by name. */
function stateColumns(entries: ListEntry[]): string[] {
  const columns: string[] = [];
  for (const { object } of entries) {
    const lifecycle = object.lifecycle?.dimension;
    const names = Object.keys(object.state).sort((a, b) => (a === lifecycle ? -1 : b === lifecycle ? 1 : a.localeCompare(b)));
    for (const name of names) if (!columns.includes(name)) columns.push(name);
  }
  return columns;
}

// Every cell keeps its content on one line, so a wide table scrolls sideways rather than wrapping (design system spec 4.3).
const th = (label: string): ViewNode => ({ component: 'Th', props: { label, modifier: 'nowrap' } });
const td = (column: string, children: ViewNode[] = []): ViewNode => ({ component: 'Td', props: { dataLabel: column, modifier: 'nowrap' }, children });

/** A row's actions: one method raised and the rest in a … menu (design system spec 4.3). */
function rowActions(entry: ListEntry): ViewNode[] {
  const o = entry.object;
  const built = entry.methods.filter((m) => BUILT_ARCHETYPES.has(m.archetype.label));
  const [raised, ...rest] = built;
  const actions: ViewNode[] = [];
  if (raised) actions.push({ component: 'Button', props: { label: raised.label, variant: entry.firstIsPrimary ? 'primary' : 'secondary', size: 'sm' }, action: { method: raised.method, target: o.iri } });
  if (rest.length) {
    actions.push({
      component: 'Dropdown',
      props: { 'aria-label': `More actions for ${o.identifier}` },
      children: rest.map((m) => ({ component: 'DropdownItem', props: { label: m.label }, action: { method: m.method, target: o.iri } })),
    });
  }
  // The raised method and its … menu stay side by side.
  return actions.length ? [{ component: 'Flex', props: { gap: { default: 'gapSm' }, flexWrap: { default: 'nowrap' }, alignItems: { default: 'alignItemsCenter' } }, children: actions }] : [];
}

/**
 * The list view (design system spec 4.3): a table with a column for each fact, the state dimensions headed by name and
 * their values in plain text, and the actions last.
 */
function objectTable(entries: ListEntry[], name: string): ViewNode {
  const columns = stateColumns(entries);
  const mixed = new Set(entries.map((e) => e.object.type)).size > 1;
  const hasDetail = entries.some((e) => e.detail);
  // Attention only when some object needs it: a deadline, urgency or a run in progress.
  const hasAttention = entries.some((e) => e.status.length);
  const head: ViewNode[] = [
    th('Identifier'),
    th('Title'),
    ...(mixed ? [th('Type')] : []),
    ...(hasAttention ? [th('Attention')] : []),
    ...columns.map(th),
    ...(hasDetail ? [th('Matched')] : []),
    // The actions stay in view at the end of the row while a wide table scrolls under them.
    { component: 'Th', props: { screenReaderText: 'Actions', modifier: 'fitContent', isStickyColumn: true, stickyRightOffset: '0', hasLeftBorder: true } },
  ];
  const rows = entries.map((entry): ViewNode => {
    const o = entry.object;
    return {
      component: 'Tr',
      selects: o.iri,
      children: [
        td('Identifier', [text(o.identifier)]),
        td('Title', [{ component: 'Button', props: { label: o.title, variant: 'link', isInline: true }, opens: o.iri }]),
        ...(mixed ? [td('Type', [text(o.typeLabel)])] : []),
        ...(hasAttention ? [td('Attention', entry.status.length ? [flexOf(entry.status)] : [])] : []),
        ...columns.map((c) => td(c, o.state[c] ? [text(o.state[c])] : [])),
        ...(hasDetail ? [td('Matched', entry.detail ? [text(entry.detail.replace(/^Matched: /, ''), 'small')] : [])] : []),
        { component: 'Td', props: { isActionCell: true, modifier: 'fitContent', isStickyColumn: true, stickyRightOffset: '0', hasLeftBorder: true }, children: rowActions(entry) },
      ],
    };
  });
  return {
    component: 'Table',
    props: { 'aria-label': name },
    children: [
      { component: 'Thead', children: [{ component: 'Tr', children: head }] },
      { component: 'Tbody', children: rows },
    ],
  };
}

/** An object list (design system spec 4.3): the list bar, then the objects as cards or as a list. */
export function objectList(entries: ListEntry[], controls: ListControls, name: string, heading: 'h2' | 'h3' = 'h2'): ViewNode[][] {
  if (!entries.length) return [];
  const objects: ViewNode =
    controls.mode === 'list' ? objectTable(entries, name) : gallery(entries.map((e) => entryCard(e, heading)));
  // The bar and the objects share one parent, so the sticky bar stays in view all the way down the list.
  return [[listBar(entries, controls), objects]];
}

/** To do's items as list entries: deadline, urgency and runs as status, and the tasks waiting, else the actions. */
export function todoEntries(items: ToDoItem[], runs: RunView[], today: Date): ListEntry[] {
  return items.map((item) => {
    const status: ViewNode[] = [];
    // A deadline already past says so, as a danger, not a warning.
    if (item.deadline) {
      const overdue = daysUntil(item.deadline, today) < 0;
      status.push({ component: 'Label', props: { label: `${overdue ? 'Overdue since' : 'Due'} ${formatDate(item.deadline)}`, status: overdue ? 'danger' : 'warning' } });
    }
    if (item.urgency >= 3) status.push({ component: 'Label', props: { label: 'Urgent', status: 'danger' } });
    status.push(...runLabels(item.object, runs));
    const waiting = item.tasks.length ? item.tasks : item.actions;
    return { object: item.object, status, intro: item.tasks.length ? 'Waiting for you:' : 'You can:', methods: waiting, firstIsPrimary: item.tasks.length > 0 };
  });
}

export function buildTodoView(
  allItems: ToDoItem[],
  who: string,
  notice?: ViewNode,
  runs: RunView[] = [],
  options: { filter?: TodoFilter; today?: Date; controls?: ListControls } = {},
): ViewSpec {
  const today = options.today ?? new Date();
  const filter = options.filter ?? 'all';
  const items = allItems.filter((i) => matchesFilter(i, filter, today));
  const entries = todoEntries(items, runs, today);
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
      // The heading and the summary in their own stack, so the standard gutter separates them (design system spec 4.3).
      ...(allItems.length ? [[stack([[{ component: 'Title', props: { label: 'At a glance', headingLevel: 'h2', size: 'lg' } } as ViewNode], ...buildSummary(allItems, today).map((n) => [n])])]] : []),
      ...(narrowed && !items.length ? [[text('Nothing matches. Choose Waiting to see every item.')]] : []),
      ...objectList(entries, options.controls ?? NO_CONTROLS, 'To do'),
    ]),
  };
}

/**
 * A type's objects (design system spec 4.3). Each card offers the methods the person can run on it now, which is how
 * on-demand methods are reached, and shows runs in progress.
 */
/** Methods with the work waiting first, then actions a person chooses to take, so a row raises a task (design system spec 4.3). */
const tasksFirst = (methods: MethodOption[]) => [...methods.filter((m) => !m.onDemand), ...methods.filter((m) => m.onDemand)];

export function buildTypeView(
  pluralLabel: string,
  objects: ObjectSummary[],
  options: { methods?: Map<string, MethodOption[]>; runs?: RunView[]; notice?: ViewNode; controls?: ListControls } = {},
): ViewSpec {
  const entries: ListEntry[] = objects.map((o) => ({
    object: o,
    status: runLabels(o, options.runs ?? []),
    methods: tasksFirst((options.methods?.get(o.iri) ?? []).filter((m) => m.available)),
    firstIsPrimary: false,
  }));
  return {
    pattern: 'card-view',
    because: `The ${pluralLabel.toLowerCase()} the person may read, with the methods they can run on each now`,
    root: stack([
      ...(options.notice ? [[options.notice]] : []),
      header(pluralLabel, `${objects.length} ${objects.length === 1 ? 'object' : 'objects'}.`),
      ...objectList(entries, options.controls ?? NO_CONTROLS, pluralLabel),
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
export function buildSearchView(
  result: SearchResult,
  options: { methods?: Map<string, MethodOption[]>; runs?: RunView[]; notice?: ViewNode; controls?: ListControls } = {},
): ViewSpec {
  const entries: ListEntry[] = result.results.map(({ object: o, matched }) => ({
    object: o,
    status: runLabels(o, options.runs ?? []),
    methods: tasksFirst((options.methods?.get(o.iri) ?? []).filter((m) => m.available)),
    firstIsPrimary: false,
    ...(matched.length ? { detail: `Matched: ${matched.join(' · ')}` } : {}),
  }));
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
      ...objectList(entries, options.controls ?? NO_CONTROLS, 'Search results'),
    ]),
  };
}

export const loadingView: ViewSpec = {
  pattern: 'card-view',
  because: 'Waiting for the gateway',
  root: { component: 'Bullseye', children: [{ component: 'Spinner', props: { size: 'lg', 'aria-valuetext': 'Loading' } }] },
};
