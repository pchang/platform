import type { ViewNode } from '../design-system/catalog';

/**
 * The page's vertical rhythm (design system spec 4.5, Spacing and grouping). The parts of one group, such as a heading and
 * what it holds, sit close together; peers in a stack keep the standard gutter; sections stand apart from one another.
 * A heading is therefore always nearer what it heads than what came before it.
 */
export type Gap = 'gapNone' | 'gapXs' | 'gapSm' | 'gapMd' | 'gapLg' | 'gapXl';

/** Children one under another, stretched to the full width, never wrapping into columns. */
const column = (children: ViewNode[], gap: Gap): ViewNode => ({
  component: 'Flex',
  props: { direction: { default: 'column' }, gap: { default: gap }, flexWrap: { default: 'nowrap' }, alignItems: { default: 'alignItemsStretch' } },
  children,
});

/** The parts of one group, close together: a heading and what it holds. */
export const group = (children: ViewNode[], gap: Gap = 'gapSm'): ViewNode => column(children, gap);

/** A page's sections, each standing apart from the next. */
export const sections = (children: ViewNode[]): ViewNode => column(children, 'gapXl');

/**
 * A dialog's body: its parts as sections, each apart from the next. A part of several nodes, such as a heading and what it
 * holds, is one group, so the heading is nearer what it heads than the part before.
 */
export const dialogBody = (items: ViewNode[][]): ViewNode => sections(items.map((nodes) => (nodes.length === 1 ? nodes[0] : group(nodes))));
