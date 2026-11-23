import type { ViewNode, ViewSpec } from '../design-system/catalog';
import type { HomeView } from '../data/client';
import { group, sections } from './layout';

/**
 * Home's first two sections (platform spec 5.1, Home; design system spec 4.3, Home): Your world, the metrics the person's
 * roles watch with their health, then Where things stand, each type of their work by lifecycle stage.
 */

const text = (label: string, component?: 'p' | 'small'): ViewNode => ({ component: 'Content', props: component ? { label, component } : { label } });
const heading = (label: string): ViewNode => ({ component: 'Title', props: { label, headingLevel: 'h2', size: 'lg' } });

/** Health as a status label with its icon and word, never color alone (design system spec 4.3, Home). */
const HEALTH: Record<NonNullable<HomeView['metrics'][number]['health']>, { label: string; status: 'success' | 'warning' | 'danger' }> = {
  'on track': { label: 'On track', status: 'success' },
  watch: { label: 'Watch', status: 'warning' },
  'at risk': { label: 'At risk', status: 'danger' },
};

function metricTile(m: HomeView['metrics'][number]): ViewNode {
  const health = m.health ? HEALTH[m.health] : undefined;
  return {
    component: 'GridItem',
    props: { span: 6, md: 3 },
    children: [
      {
        component: 'Card',
        props: { isFullHeight: true, isCompact: true },
        // The whole tile opens the objects it counts, when it counts any (platform spec 5.1, From a metric to its objects).
        ...(m.count ? { shows: m.metric } : {}),
        children: [
          { component: 'CardTitle', props: { label: m.label, component: 'h3' } },
          {
            component: 'CardBody',
            children: [
              // The count and its total are one group; the health label is the tile's last line, pinned to its foot, so
              // the labels of a row of tiles line up however many lines each name takes (design system spec 4.5).
              {
                component: 'Stack',
                props: { hasGutter: true },
                children: [
                  { component: 'StackItem', props: { isFilled: true }, children: [{ component: 'Content', props: { label: String(m.count), isEditorial: true } }, text(`of ${m.total} ${m.pluralLabel.toLowerCase()}`, 'small')] },
                  ...(health ? [{ component: 'StackItem', children: [{ component: 'Label', props: { label: health.label, status: health.status, isCompact: true } } as ViewNode] }] : []),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

/** The chart blue ramp's step for a stage: the first stage step 100, the last 500, spread evenly between. */
export function rampStep(index: number, stages: number): number {
  if (stages <= 1) return 300;
  return Math.round(1 + (index * 4) / (stages - 1)) * 100;
}

/**
 * One type's row: its name and total, then a thin segmented bar of its stages with every figure in the legend beside it.
 * The legend's markers are circles, so they are not mistaken for the bar's segments (design system spec 4.3, Home).
 */
function lifecycleRow(l: HomeView['lifecycles'][number], max: number): ViewNode {
  const fill = (i: number) => `var(--pf-t--chart--color--blue--${rampStep(i, l.stages.length)})`;
  const figures = l.stages.map((s) => `${s.label} ${s.count}`).join(', ');
  // The name, the bar and its legend are one group, close together: the legend belongs to its bar (design system spec 4.5).
  return group([
    {
      component: 'Flex',
      props: { gap: { default: 'gapSm' }, alignItems: { default: 'alignItemsBaseline' }, flexWrap: { default: 'wrap' } },
      children: [{ component: 'Title', props: { label: l.pluralLabel, headingLevel: 'h3', size: 'md' }, lists: l.type }, text(`${l.total}, by ${l.dimension.toLowerCase()}`, 'small')],
    },
    {
      component: 'Chart',
      props: {
        ariaTitle: `${l.pluralLabel} by ${l.dimension.toLowerCase()}`,
        ariaDesc: `${l.total} ${l.pluralLabel.toLowerCase()}: ${figures}`,
        height: 48,
        horizontal: true,
        showAxis: false,
        padding: { top: 0, bottom: 36, left: 0, right: 0 },
        // One scale for every row, so the bars compare (design system spec 4.3, Home).
        domain: { y: [0, max] },
        legendData: l.stages.map((s, i) => ({ name: `${s.label} ${s.count}`, symbol: { fill: fill(i), type: 'circle' } })),
        legendPosition: 'bottom-left',
        legendAllowWrap: true,
      },
      children: [
        {
          component: 'ChartStack',
          children: l.stages
            .map((s, i) => ({ s, i }))
            .filter(({ s }) => s.count > 0)
            .map(({ s, i }) => ({
              component: 'ChartBar',
              props: {
                data: [{ x: l.pluralLabel, y: s.count, name: s.label }],
                barWidth: 8,
                style: { data: { fill: fill(i), stroke: 'var(--pf-t--global--background--color--primary--default)', strokeWidth: 2 } },
              },
            })),
        },
      ],
    },
  ], 'gapXs');
}

export function homeSections(home: HomeView): ViewNode[] {
  const parts: ViewNode[] = [];
  if (home.metrics.length) {
    parts.push(group([heading('Your world'), { component: 'Grid', props: { hasGutter: true }, children: home.metrics.map(metricTile) }]));
  }
  if (home.lifecycles.length) {
    const max = Math.max(...home.lifecycles.map((l) => l.total));
    parts.push(
      group([
        heading('Where things stand'),
        // The rows are peers, set well apart so a row's legend is nearer its own bar than the next row's name (design system spec 4.5).
        { component: 'Card', props: { isCompact: true }, children: [{ component: 'CardBody', children: [group(home.lifecycles.map((l) => lifecycleRow(l, max)), 'gapXl')] }] },
      ]),
    );
  }
  return parts;
}

/** How the person is keeping up, in one line under the To do summary. */
export function keepingUp(home: HomeView, overdue: number): string {
  const done = home.doneLast7Days === 0 ? 'You haven’t done anything here in the last 7 days' : `You’ve done ${home.doneLast7Days} ${home.doneLast7Days === 1 ? 'thing' : 'things'} in the last 7 days`;
  return `${done}; ${overdue === 0 ? 'nothing is overdue' : `${overdue} ${overdue === 1 ? 'item is' : 'items are'} overdue`}.`;
}

/** The way back to Home from a page the person drilled into: a link above the page's heading (design system spec 4.3, Home). */
export const backToHome: ViewNode = { component: 'Button', props: { label: 'Back to Home', variant: 'link', icon: 'arrow-left', isInline: true }, goes: 'home' };

/**
 * A metric's own page (platform spec 5.1, Home, From a metric to its objects): its name as the heading, its description
 * and health under it, then exactly the objects it counts as an object list.
 */
export function metricPage(metric: HomeView['metrics'][number], list: ViewNode[], notice?: ViewNode): ViewSpec {
  const health = metric.health ? HEALTH[metric.health] : undefined;
  return {
    pattern: 'card-view',
    because: `The ${metric.pluralLabel.toLowerCase()} the metric ${metric.label} counts, as the person may read them`,
    root: sections([
      ...(notice ? [notice] : []),
      // The way back, then the name, what it measures and how many: the link stands a little above the heading it belongs to.
      group(
        [
          backToHome,
          group(
            [
              { component: 'Title', props: { label: metric.label, headingLevel: 'h1', size: '2xl' } },
              text(metric.comment),
              {
                component: 'Flex',
                props: { gap: { default: 'gapSm' }, alignItems: { default: 'alignItemsCenter' }, flexWrap: { default: 'wrap' } },
                children: [
                  text(`${metric.count} of ${metric.total} ${metric.pluralLabel.toLowerCase()}.`, 'small'),
                  ...(health ? [{ component: 'Label', props: { label: health.label, status: health.status, isCompact: true } }] : []),
                ],
              },
            ],
            'gapXs',
          ),
        ],
        'gapMd',
      ),
      ...(metric.count ? list : [text(`None right now.`)]),
    ]),
  };
}
