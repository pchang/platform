import { useId, useMemo, type ReactNode, type Ref } from 'react';
import { componentsById, type ViewNode, type ViewSpec } from '../design-system/catalog';
import { validateView } from '../design-system/validateView';
import { icons } from './icons';
import { library } from './library';

/**
 * Draws view specs with PatternFly (design system spec, sections 5.2 and 5.3).
 * Only catalog components can be drawn, and only after the whole view validates.
 */

export interface RenderHost {
  /** Runs a node's action. With no handler, actions do not run. */
  onAction?: (action: NonNullable<ViewNode['action']>, node: ViewNode) => void;
  /** Called with the reasons when a view is rejected. */
  onInvalid?: (errors: string[]) => void;
}

/** Components whose PatternFly API takes `label` as a prop rather than as children. */
const LABEL_IS_PROP = new Set(['Checkbox', 'Radio', 'Switch']);
/** Components that need an id so their label stays connected to the control. */
const NEEDS_ID = new Set(['Checkbox', 'Radio', 'Switch', 'TextInput']);

/** Components that take exactly one child element, not a list (PatternFly attaches to it). */
const SINGLE_CHILD = new Set(['Tooltip']);

// `ref` is passed through so components like Tooltip can attach to the element a node draws.
function Node({ node, host, ref }: { node: ViewNode; host: RenderHost; ref?: Ref<unknown> }) {
  const generatedId = useId();
  const entry = componentsById.get(node.component)!;
  const Component = library[entry.import.export];
  const { label, name, ...props } = (node.props ?? {}) as Record<string, unknown>;

  if (NEEDS_ID.has(entry.id)) props.id = generatedId;

  let content: ReactNode = undefined;
  if (node.children?.length) {
    content = SINGLE_CHILD.has(entry.id)
      ? <Node node={node.children[0]} host={host} />
      : node.children.map((child, i) => <Node key={i} node={child} host={host} />);
  }
  if (ref) props.ref = ref;
  if (entry.id === 'Icon') {
    const Svg = icons[name as string];
    content = <Svg />;
    // A named icon is an image to assistive technology; an unnamed one is decoration.
    if (props['aria-label']) props.role = 'img';
    else props['aria-hidden'] = true;
  } else if (label !== undefined) {
    if (LABEL_IS_PROP.has(entry.id)) props.label = label;
    else content = label as ReactNode;
  }
  if (entry.id === 'Radio') props.name = name;

  if (node.action && host.onAction) {
    const action = node.action;
    props.onClick = () => host.onAction!(action, node);
  }

  // Void elements, such as inputs and dividers, must get no children at all.
  return content === undefined ? <Component {...props} /> : <Component {...props}>{content}</Component>;
}

export function ViewRenderer({ view, host = {} }: { view: ViewSpec; host?: RenderHost }) {
  const result = useMemo(() => validateView(view), [view]);
  if (!result.valid) {
    console.error('View rejected', result.errors);
    host.onInvalid?.(result.errors);
    return null;
  }
  return <Node node={view.root} host={host} />;
}
