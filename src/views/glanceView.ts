import type { ViewNode, ViewSpec } from '../design-system/catalog';
import type { GlanceList, GlanceView, Health, HealthRuleResult, MethodOption, RunView, TypeProgress } from '../data/client';
import { journeyStepper } from './objectView';
import { daysUntil, flexOf, formatDate, gallery, NO_CONTROLS, objectEntries, objectList, stack, text, type ListControls } from './orientView';
import { counted, inText } from './words';

/**
 * At a glance (platform spec 5.1; design system spec 4.5): an initiative seen whole, composed from the gateway's answer,
 * the same way for every initiative in every domain.
 */

/** Each health in words and as a status: never by color alone. */
const HEALTH: Record<Health, { label: string; status: 'success' | 'warning' | 'danger' }> = {
  onTrack: { label: 'On track', status: 'success' },
  atRisk: { label: 'At risk', status: 'warning' },
  offTrack: { label: 'Off track', status: 'danger' },
};

const percent = (share: number) => `${Math.round(share * 100)}%`;

/** A rule's measure in words, with the level it crossed or stays within, such as "2 visits overdue, above 0". */
export function measured(rule: HealthRuleResult): string {
  const level = (n: number) => (rule.measure === 'share' ? percent(n) : String(n));
  const crossed = rule.health === 'offTrack' ? `above ${level(rule.offTrackAbove)}` : rule.health === 'atRisk' ? `above ${level(rule.atRiskAbove)}` : `at or below ${level(rule.atRiskAbove)}`;
  const what =
    rule.measure === 'share'
      ? `${rule.count} of ${counted(rule.total, rule.typeLabel, rule.pluralLabel)} ${rule.stateLabel} (${percent(rule.value)})`
      : `${counted(rule.count, rule.typeLabel, rule.pluralLabel)} ${rule.measure === 'overdue' ? 'overdue' : 'urgent'}`;
  return `${what}, ${crossed}`;
}

/** The line under the heading: the health in words, and how many rules need attention. */
function healthLine(view: GlanceView): string {
  const judged = view.rules.filter((r) => r.health !== 'hidden');
  const needing = judged.filter((r) => r.health !== 'onTrack').length;
  const of = `${needing} of ${judged.length} health ${judged.length === 1 ? 'rule' : 'rules'}`;
  return `${HEALTH[view.health].label}: ${needing ? `${of} ${needing === 1 ? 'needs' : 'need'} attention.` : `all ${judged.length} health rules are met.`}`;
}

function healthCard(view: GlanceView): ViewNode {
  const rows: ViewNode[][] = [[flexOf([{ component: 'Label', props: { label: HEALTH[view.health].label, status: HEALTH[view.health].status } }])]];
  for (const rule of view.rules) {
    if (rule.health === 'hidden') {
      rows.push([text(`${rule.label}: not shown to your role, which may not read ${inText(rule.pluralLabel)}.`, 'small')]);
      continue;
    }
    const look = HEALTH[rule.health];
    rows.push([
      flexOf([
        { component: 'Label', props: { label: look.label, status: look.status, isCompact: true } },
        text(`${rule.label}: ${measured(rule)}`),
      ]),
      text(rule.comment, 'small'),
    ]);
  }
  return {
    component: 'Card',
    because: 'The initiative’s health, by each health rule of its type in the ontology, measured over its scope',
    children: [
      { component: 'CardTitle', props: { label: 'Health', component: 'h2' } },
      { component: 'CardBody', children: [stack(rows)] },
    ],
  };
}

function progressCard(progress: TypeProgress): ViewNode {
  const rows: ViewNode[][] = [];
  if (progress.along !== undefined) {
    const value = Math.round(progress.along * 100);
    rows.push([
      {
        component: 'Progress',
        props: { value, title: 'How far along', valueText: `${value}% of the way along their ${progress.dimension?.toLowerCase() ?? 'lifecycle'}`, measureLocation: 'outside', size: 'sm' },
      },
    ]);
  }
  if (progress.stages.length) {
    rows.push([
      flexOf(
        progress.stages.map((s) => ({
          component: 'Label',
          props: { label: `${s.stage}: ${s.count}${s.exit ? ', an exit' : ''}`, color: 'grey', variant: 'outline', isCompact: true },
        })),
      ),
    ]);
  }
  const attention: ViewNode[] = [];
  if (progress.overdue) attention.push({ component: 'Label', props: { label: `${progress.overdue} overdue`, status: 'danger' } });
  if (progress.urgent) attention.push({ component: 'Label', props: { label: `${progress.urgent} urgent`, status: 'danger' } });
  if (attention.length) rows.push([flexOf(attention)]);
  return {
    component: 'GalleryItem',
    children: [
      {
        component: 'Card',
        props: { isFullHeight: true },
        because: `The ${inText(progress.pluralLabel)} in the initiative’s scope, by the stages of their lifecycle`,
        children: [
          { component: 'CardTitle', props: { label: `${progress.pluralLabel} · ${progress.count}`, component: 'h3' } },
          { component: 'CardBody', children: [stack(rows)] },
        ],
      },
    ],
  };
}

/** An initiative seen whole. */
export function buildGlanceView(
  view: GlanceView,
  options: { methods?: Map<string, MethodOption[]>; runs?: RunView[]; notice?: ViewNode; controls?: ListControls; today?: Date } = {},
): ViewSpec {
  const today = options.today ?? new Date();
  const i = view.initiative;
  const header: ViewNode[][] = [
    [
      text(`${i.identifier} · ${i.typeLabel}`, 'small'),
      { component: 'Title', props: { label: i.title, headingLevel: 'h1' } },
      text(healthLine(view)),
    ],
  ];
  if (i.journey) header.push([journeyStepper(i.journey)]);
  header.push([flexOf([{ component: 'Button', props: { label: `Open ${i.identifier}`, variant: 'secondary', size: 'sm' }, opens: i.iri }])]);

  // What needs attention: an object list like any other, with each object's deadline and urgency as status.
  const entries = objectEntries(
    view.attention.map((a) => a.object),
    options,
  ).map((entry, n) => {
    const a = view.attention[n];
    const status: ViewNode[] = [];
    if (a.deadline) {
      const overdue = daysUntil(a.deadline, today) < 0;
      status.push({ component: 'Label', props: { label: `${overdue ? 'Overdue since' : 'Due'} ${formatDate(a.deadline)}`, status: overdue ? 'danger' : 'warning' } });
    }
    if (a.urgency >= 3) status.push({ component: 'Label', props: { label: 'Urgent', status: 'danger' } });
    return { ...entry, status: [...status, ...entry.status] };
  });

  return {
    pattern: 'glance',
    because: `${i.identifier} at a glance: its journey, health, the progress of what is in its scope and what needs attention, from the same objects and states as the day-to-day work`,
    root: stack([
      ...(options.notice ? [[options.notice]] : []),
      [stack(header)],
      [healthCard(view)],
      [{ component: 'Title', props: { label: 'Progress', headingLevel: 'h2' } }, gallery(view.progress.map(progressCard))],
      [{ component: 'Title', props: { label: `Needs attention · ${view.attention.length}`, headingLevel: 'h2' } }],
      ...(entries.length ? objectList(entries, options.controls ?? NO_CONTROLS, 'Needs attention', 'h3') : [[text('Nothing needs attention.')]]),
    ]),
  };
}

/** The initiatives a person may read, to choose one: an object list like any other. */
export function buildGlanceListView(list: GlanceList, options: { methods?: Map<string, MethodOption[]>; runs?: RunView[]; controls?: ListControls } = {}): ViewSpec {
  return {
    pattern: 'card-view',
    because: 'The initiatives the person may read, to see one at a glance',
    root: stack([
      [{ component: 'Title', props: { label: 'At a glance', headingLevel: 'h1' } }, text(list.initiatives.length ? 'Choose an initiative to see it whole.' : 'There are no initiatives you may read.')],
      ...objectList(objectEntries(list.initiatives, options), options.controls ?? NO_CONTROLS, 'Initiatives'),
    ]),
  };
}
