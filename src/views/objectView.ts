import type { ViewNode, ViewSpec } from '../design-system/catalog';
import type { MethodOption, ObjectView, RelationshipEnd, RunView } from '../data/client';
import { group, sections } from './layout';
import { createButton, daysUntil, flexOf, formatDate, NO_CONTROLS, objectEntries, objectList, quietId, runLabels, runnable, stack, stateLabels, text, typeLink, type ListControls } from './orientView';

/**
 * One object in the object panel (platform spec 5.1, Within an object; design system spec 4.4), composed from what the
 * gateway reads. Its sections come from the object's relationship ends in the ontology, never from its type.
 */

/** The field the panel's tabs set: which section is shown. */
export const OBJECT_TAB_FIELD = 'objectTab';
export const OVERVIEW_TAB = 'overview';

/** A term's local name, such as runsAt for …#runsAt, made safe for an element id. */
const localName = (iri: string) => (iri.split(/[#/]/).pop() ?? iri).replace(/[^A-Za-z0-9_-]/g, '-');

/**
 * A relationship end's tab key: its direction, relationship and the type at its other end, so each is distinct. PatternFly
 * makes element ids from it, so it holds only characters an id may.
 */
export const endKey = (end: Pick<RelationshipEnd, 'direction' | 'relationship' | 'type'>) => [end.direction, localName(end.relationship), localName(end.type)].join('-');

/** A type's name in running text: lower case, except words that start in capitals, such as CAPA and CAPAs. */
const inText = (name: string) =>
  name
    .split(' ')
    .map((word) => (/^[A-Z]{2}/.test(word) ? word : word.toLowerCase()))
    .join(' ');

/** The ends that hold at most one object go in the overview; the others each get a tab. */
const isTab = (end: RelationshipEnd) => !end.one;

const sentenceCase = (phrase: string) => phrase[0].toUpperCase() + phrase.slice(1);

/**
 * Names for a set of ends: the type at the other end, or how the relationship reads when two ends reach the same type or
 * an end reaches the object's own type (platform spec 5.1, Names).
 */
function names(ends: RelationshipEnd[], own: string, name: (end: RelationshipEnd) => string): Map<RelationshipEnd, string> {
  return new Map(
    ends.map((end) => {
      if (end.type === own) return [end, sentenceCase(end.label)];
      return [end, ends.filter((e) => e.type === end.type).length > 1 ? `${name(end)} (${end.label})` : name(end)];
    }),
  );
}

const dl = (rows: [string, ViewNode[]][]): ViewNode => ({
  component: 'DescriptionList',
  props: { isCompact: true, isHorizontal: true, termWidth: '16ch' },
  children: rows.map(([term, description]) => ({
    component: 'DescriptionListGroup',
    children: [
      { component: 'DescriptionListTerm', props: { label: term } },
      { component: 'DescriptionListDescription', children: description },
    ],
  })),
});

const heading = (label: string): ViewNode => ({ component: 'Title', props: { label, headingLevel: 'h3', size: 'md' } });
/** A section of the overview: its heading, then what it holds, close together (design system spec 4.5). */
const part = (title: string, body: ViewNode): ViewNode => group([heading(title), body]);

function overview(view: ObjectView, today: Date): ViewNode {
  const parts: ViewNode[] = [];
  const properties = Object.entries(view.properties).sort(([a], [b]) => a.localeCompare(b));
  parts.push(part('Details', properties.length ? dl(properties.map(([k, v]) => [sentenceCase(k), [text(v)]])) : text('No details recorded.')));

  const linked = view.links.filter((end) => !isTab(end));
  if (linked.length) {
    const named = names(linked, view.type, (end) => end.typeLabel);
    parts.push(
      part(
        'Linked',
        dl(
        linked.map((end) => [
          named.get(end)!,
            end.objects.length
              ? [flexOf(end.objects.map((o) => ({ component: 'Button', props: { label: `${o.identifier} · ${o.title}`, variant: 'link', isInline: true }, opens: o.iri })))]
              : [text('None')],
          ]),
        ),
      ),
    );
  }

  const about: [string, ViewNode[]][] = [
    ['Type', [text(view.typeLabel)]],
    ['Domain', [text(view.domainLabel)]],
  ];
  if (view.lifecycle) about.push([view.lifecycle.dimension, [text(`${view.lifecycle.stage}, stage ${view.lifecycle.position + 1} of ${view.lifecycle.stages.length}`)]]);
  if (view.deadline) about.push(['Deadline', [text(`${formatDate(view.deadline)}${daysUntil(view.deadline, today) < 0 ? ', overdue' : ''}`)]]);
  about.push([
    'Last change',
    [text(view.lastChange ? `${view.lastChange.methodLabel} by ${view.lastChange.personName}, ${new Date(view.lastChange.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : 'None since it was recorded')],
  ]);
  parts.push(part('About', dl(about)));
  return sections(parts);
}

/** A tab's objects as an object list like any other (design system spec 4.4 and 4.3): the list bar, then cards or a list. */
function section(
  view: ObjectView,
  end: RelationshipEnd,
  name: string,
  options: { methods?: Map<string, MethodOption[]>; runs?: RunView[]; controls?: ListControls },
): ViewNode {
  const sentence = `This ${inText(view.typeLabel)} ${end.label} ${end.objects.length === 1 ? `this ${inText(end.typeLabel)}` : `these ${inText(end.pluralLabel)}`}.`;
  // Add creates a new object inside this one, when the person may (platform spec 5.3; design system spec 4.3).
  const create = end.canAdd ? { type: end.type, typeLabel: end.typeLabel, within: view.iri, verb: 'Add' as const } : undefined;
  if (!end.objects.length) return group([text(`No ${inText(end.pluralLabel)} yet.`), ...(create ? [createButton(create)] : [])], 'gapMd');
  return group([text(sentence), ...objectList(objectEntries(end.objects, options), { ...(options.controls ?? NO_CONTROLS), create }, name, 'h3')], 'gapMd');
}

/**
 * The object panel's content: the header (identity, state, deadline and urgency, runs, and the methods the person can run
 * now), then tabs for the overview and each relationship end that holds many objects, contained objects first.
 */
export function buildObjectView(
  view: ObjectView,
  options: { methods?: MethodOption[]; related?: Map<string, MethodOption[]>; runs?: RunView[]; notice?: ViewNode; today?: Date; controls?: ListControls; editable?: boolean } = {},
): ViewSpec {
  const today = options.today ?? new Date();
  const status: ViewNode[] = [];
  if (view.deadline) {
    const overdue = daysUntil(view.deadline, today) < 0;
    status.push({ component: 'Label', props: { label: `${overdue ? 'Overdue since' : 'Due'} ${formatDate(view.deadline)}`, status: overdue ? 'danger' : 'warning' } });
  }
  if (view.urgency >= 3) status.push({ component: 'Label', props: { label: 'Urgent', status: 'danger' } });
  status.push(...runLabels(view, options.runs ?? []));

  const header: ViewNode[][] = [
    [
      // The type's name, a link to its list, then the identifier, quiet (design system spec 4.4).
      { component: 'Flex', props: { gap: { default: 'gapXs' }, flexWrap: { default: 'wrap' }, alignItems: { default: 'alignItemsBaseline' } }, children: [typeLink(view.type, view.typeLabel), quietId(`· ${view.identifier}`)] },
      { component: 'Title', props: { label: view.title, headingLevel: 'h2', size: '2xl' } },
    ],
  ];
  if (status.length) header.push([flexOf(status)]);
  if (Object.keys(view.state).length) header.push([flexOf(stateLabels(view))]);
  const available = (options.methods ?? []).filter((m) => m.available);
  // The methods the person can run now, then Edit when they may edit it, then Ask about this last, as on a card
  // (platform spec 5.3; design system spec 4.1 and 4.4).
  const actions = runnable(available, view.iri, false, view);
  const edit: ViewNode = { component: 'Button', props: { label: 'Edit', variant: 'secondary', size: 'sm' }, edits: view.iri };
  if (options.editable) {
    const row = actions.find((r) => r[0].component === 'Flex')!;
    const children = row[0].children ?? [];
    // Before Ask, which is always last in the row.
    row[0] = { ...row[0], children: [...children.slice(0, -1), edit, children[children.length - 1]] };
  }
  header.push(...actions);

  const tabs = view.links.filter(isTab);
  const named = names(tabs, view.type, (end) => end.pluralLabel);
  const tabNodes: ViewNode[] = [
    { component: 'Tab', props: { eventKey: OVERVIEW_TAB, label: 'Overview' }, children: [overview(view, today)] },
    ...tabs.map((end) => ({
      component: 'Tab',
      props: { eventKey: endKey(end), label: named.get(end)!, count: end.objects.length },
      children: [section(view, end, named.get(end)!, { methods: options.related, runs: options.runs, controls: options.controls })],
    })),
  ];

  return {
    pattern: 'object',
    because: `${view.identifier}, as the person may read it: its header, overview and the objects at each relationship end its type has in the ontology`,
    root: group(
      [
        ...(options.notice ? [options.notice] : []),
        stack(header),
        { component: 'Tabs', props: { 'aria-label': `${view.identifier} sections` }, field: OBJECT_TAB_FIELD, children: tabNodes },
      ],
      'gapLg',
    ),
  };
}
