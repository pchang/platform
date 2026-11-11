import { catalog, type CatalogComponent, type Level, type ViewNode, type ViewSpec } from '../design-system/catalog';

/**
 * Builds the catalog preview as a view spec from the catalog data (design system
 * spec, section 5.4). Everything on the page is drawn by the renderer.
 */

const LEVELS: { level: Level; heading: string }[] = [
  { level: 'atom', heading: 'Atoms' },
  { level: 'molecule', heading: 'Molecules' },
  { level: 'organism', heading: 'Organisms' },
  { level: 'layout', heading: 'Layouts' },
  { level: 'template', heading: 'Templates' },
];

const text = (label: string, component?: 'p' | 'small'): ViewNode => ({
  component: 'Content',
  props: component ? { label, component } : { label },
});
const heading = (label: string, headingLevel: 'h1' | 'h2' | 'h4'): ViewNode => ({ component: 'Title', props: { label, headingLevel } });
const stack = (items: ViewNode[][]): ViewNode => ({
  component: 'Stack',
  props: { hasGutter: true },
  children: items.map((children) => ({ component: 'StackItem', children })),
});
const card = (title: string, body: ViewNode[]): ViewNode => ({
  component: 'GalleryItem',
  children: [
    {
      component: 'Card',
      props: { isFullHeight: true },
      children: [
        { component: 'CardTitle', props: { label: title, component: 'h3' } },
        { component: 'CardBody', children: body },
      ],
    },
  ],
});
const gallery = (items: ViewNode[]): ViewNode => ({
  component: 'Gallery',
  props: { hasGutter: true, minWidths: { default: '100%', lg: '24rem' } },
  children: items,
});

/** Bindings, actions and reasons anywhere in an example, shown as text because examples are not live. */
function annotations(node: ViewNode): ViewNode[] {
  const notes: ViewNode[] = [];
  if (node.bind) notes.push(text(`Bound to ${node.bind}. Not read in the preview.`, 'small'));
  if (node.action) notes.push(text(`Runs ${node.action.method} on ${node.action.target}. Does not run in the preview.`, 'small'));
  if (node.because) notes.push(text(`Because: ${node.because}`, 'small'));
  return [...notes, ...(node.children ?? []).flatMap(annotations)];
}

/** Whether an example opens over the page, such as a Modal (design system spec 5.1, Overlays in the catalog preview). */
function opensOverPage(node: ViewNode): boolean {
  return Boolean(catalog.components.find((c) => c.id === node.component)?.overlay) || (node.children ?? []).some(opensOverPage);
}

function componentCard(entry: CatalogComponent): ViewNode {
  const details: ViewNode[][] = [
    [{ component: 'Label', props: { label: entry.level, color: 'blue', isCompact: true } }],
    [text(entry.purpose)],
    [text(`Use when: ${entry.useWhen.join('; ')}.`, 'small')],
  ];
  if (entry.avoidWhen.length) details.push([text(`Avoid when: ${entry.avoidWhen.join('; ')}.`, 'small')]);
  details.push([text(`Responsive: ${entry.responsive}`, 'small')]);
  details.push([text(`Accessibility: ${entry.accessibility.join('. ')}.`, 'small')]);
  details.push([{ component: 'Divider' }]);
  details.push([heading(entry.examples.length > 1 ? 'Examples' : 'Example', 'h4')]);
  for (const example of entry.examples) {
    if (opensOverPage(example)) details.push([text('This example opens as a dialog over the page, so it is described here rather than opened. Try it from To do.', 'small')]);
    else details.push([example, ...annotations(example)]);
  }
  return card(entry.id, [stack(details)]);
}

export function buildCatalogView(): ViewSpec {
  const sections: ViewNode[][] = [
    [
      heading('Design system catalog', 'h1'),
      text(
        `PatternFly 6.7.0 in its default style. ${catalog.components.length} components and ${catalog.tokens.length} tokens. ` +
          'Examples are not connected to the gateway: actions do not run and bindings are shown, not read.',
      ),
    ],
  ];

  for (const { level, heading: title } of LEVELS) {
    const entries = catalog.components.filter((c) => c.level === level);
    if (entries.length) sections.push([heading(`${title} (${entries.length})`, 'h2'), gallery(entries.map(componentCard))]);
  }

  sections.push([
    heading(`Tokens (${catalog.tokens.length})`, 'h2'),
    gallery(
      catalog.files.tokens.groups.map((group) =>
        card(
          group.id[0].toUpperCase() + group.id.slice(1),
          [stack(group.tokens.map((token) => [text(token.name, 'small'), text(token.use)]))],
        ),
      ),
    ),
  ]);

  return {
    pattern: 'card-view',
    because: 'Shows every catalog entry so people can review the design system on any device',
    root: stack(sections),
  };
}
