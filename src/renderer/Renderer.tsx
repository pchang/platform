import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { componentsById, type Intent, type ViewNode, type ViewSpec } from '../design-system/catalog';
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
  /** The values of the fields being composed, by input name (view spec `field`). The renderer never stores them. */
  values?: Record<string, string>;
  /** Called when the person changes a field. */
  onField?: (field: string, value: string) => void;
  /** Called when the person presses a button with an intent, or closes a Modal (cancel). */
  onIntent?: (intent: Intent) => void;
}

/**
 * PatternFly 6.7's Wizard never passes a name to its phone step toggle, so the toggle is always called
 * "Wizard toggle" while it shows the step, such as "2 Sign". That fails WCAG 2.5.3, label in name. Removing
 * the fixed name lets the visible text name the toggle. React does not put it back, because it believes the
 * attribute is unchanged.
 */
function WizardToggleName({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector('.pf-v6-c-wizard__toggle')?.removeAttribute('aria-label');
  });
  return (
    <div ref={ref} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}

/** A FormGroup's id, so the control inside it is labeled by the group's label. */
const FieldIdContext = createContext<string | undefined>(undefined);

/** Components whose PatternFly API takes `label` as a prop rather than as children. */
const LABEL_IS_PROP = new Set(['Checkbox', 'Radio', 'Switch', 'FormGroup', 'FormSelectOption']);
/** Components that need an id so their label stays connected to the control. */
const NEEDS_ID = new Set(['Checkbox', 'Radio', 'Switch', 'TextInput', 'TextArea', 'FormSelect']);
/** Controls whose value comes from the field they are bound to. */
const VALUE_FIELDS = new Set(['TextInput', 'TextArea', 'FormSelect']);

/** Components that take exactly one child element, not a list (PatternFly attaches to it). */
const SINGLE_CHILD = new Set(['Tooltip']);

/** Builds a chart's subtree directly: PatternFly charts read their children's props, so nothing may wrap them. */
function chartElement(node: ViewNode, key?: number): ReactNode {
  const Component = library[componentsById.get(node.component)!.import.export];
  return (
    <Component key={key} {...(node.props ?? {})}>
      {node.children?.map((child, i) => chartElement(child, i))}
    </Component>
  );
}

/** Width a chart is drawn at before its container is measured, such as in tests without layout. */
const UNMEASURED_CHART_WIDTH = 400;

/** A chart drawn at its container's width, re-measured as the container changes, so its text is never scaled. */
function ChartFrame({ node }: { node: ViewNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => setWidth(Math.floor(element.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // A wrapping legend needs more height than the chart was given: PatternFly reports how much.
  const [legendExtra, setLegendExtra] = useState(0);
  const props = { ...(node.props ?? {}) } as Record<string, unknown>;
  if (props.legendAllowWrap) {
    props.legendAllowWrap = (extra: number) => setLegendExtra((current) => (current === extra ? current : extra));
    // The legend sits in the bottom padding, so the padding grows with it and the plot keeps its size.
    props.height = ((props.height as number | undefined) ?? 0) + legendExtra;
    const padding = (props.padding ?? {}) as Record<string, number>;
    props.padding = { ...padding, bottom: (padding.bottom ?? 0) + legendExtra };
  }
  const Chart = library.Chart;
  return (
    <div ref={frame}>
      <Chart {...props} width={width || UNMEASURED_CHART_WIDTH}>
        {node.children?.map((child, i) => chartElement(child, i))}
      </Chart>
    </div>
  );
}

/**
 * A selectable Card bound to a field (design system spec 5.2): a radio button named by the card's title, in a CardHeader,
 * that sets the field to the card's value.
 */
function SelectableCard({ node, host }: { node: ViewNode; host: RenderHost }) {
  const id = useId();
  const field = node.field!;
  const { value, ...props } = (node.props ?? {}) as Record<string, unknown>;
  const checked = host.values?.[field] === value;
  const title = node.children?.find((c) => c.component === 'CardTitle');
  const rest = (node.children ?? []).filter((c) => c !== title);
  const { Card, CardHeader, CardTitle } = library;
  const titleProps = { ...((title?.props ?? {}) as Record<string, unknown>) };
  const titleLabel = titleProps.label as ReactNode;
  delete titleProps.label;
  return (
    <Card {...props} id={id} isSelectable isSelected={checked}>
      <CardHeader
        selectableActions={{
          selectableActionId: `${id}-input`,
          selectableActionAriaLabelledby: `${id}-title`,
          name: field,
          variant: 'single',
          isChecked: checked,
          onChange: () => host.onField?.(field, value as string),
        }}
      >
        {title && (
          <CardTitle {...titleProps} id={`${id}-title`}>
            {titleLabel}
          </CardTitle>
        )}
      </CardHeader>
      {rest.map((child, i) => (
        <Node key={i} node={child} host={host} />
      ))}
    </Card>
  );
}

// `ref` is passed through so components like Tooltip can attach to the element a node draws.
function Node({ node, host, ref }: { node: ViewNode; host: RenderHost; ref?: Ref<unknown> }) {
  const generatedId = useId();
  const groupId = useContext(FieldIdContext);
  const entry = componentsById.get(node.component)!;
  const Component = library[entry.import.export];
  if (entry.id === 'Chart') return <ChartFrame node={node} />;
  if (entry.id === 'Card' && node.field) return <SelectableCard node={node} host={host} />;
  const { label, name, ...props } = (node.props ?? {}) as Record<string, unknown>;

  if (NEEDS_ID.has(entry.id)) props.id = entry.id !== 'Radio' && groupId ? groupId : generatedId;
  if (entry.id === 'FormGroup' && props.role !== 'radiogroup') props.fieldId = generatedId;

  // Fields: the value comes from the host, and changes go back to it.
  const field = node.field;
  if (field && VALUE_FIELDS.has(entry.id)) {
    props.value = host.values?.[field] ?? '';
    props.onChange = (_event: unknown, value: string) => host.onField?.(field, value);
  }
  if (field && entry.id === 'Radio') {
    const value = props.value as string;
    props.isChecked = host.values?.[field] === value;
    props.onChange = () => host.onField?.(field, value);
  }
  if (node.intent) {
    const intent = node.intent;
    props.onClick = () => host.onIntent?.(intent);
  }
  // A Modal is open while it is drawn; Escape and its close button cancel.
  if (entry.id === 'Modal') {
    props.isOpen = true;
    props.onClose = () => host.onIntent?.('cancel');
  }
  // A Wizard's last Next submits; its Cancel and its header's close button cancel.
  if (entry.id === 'Wizard') {
    props.onSave = () => host.onIntent?.('submit');
    props.onClose = () => host.onIntent?.('cancel');
  }
  if (entry.id === 'WizardHeader') props.onClose = () => host.onIntent?.('cancel');
  // A button's icon is named in the catalog and drawn from @patternfly/react-icons.
  if (entry.id === 'Button' && typeof props.icon === 'string') {
    const Svg = icons[props.icon];
    props.icon = <Svg />;
  }

  let content: ReactNode = undefined;
  // PatternFly takes a Wizard's header as a prop, not a child, and accepts only WizardStep elements as
  // children: so the steps are made here directly, and only their contents go through Node.
  // PatternFly takes a ModalHeader's action as its help prop, drawn beside the close button.
  if (entry.id === 'ModalHeader' && node.children?.length) {
    props.help = <Node node={node.children[0]} host={host} />;
    content = undefined;
  } else if (entry.id === 'Wizard') {
    const header = node.children?.find((c) => c.component === 'WizardHeader');
    if (header) props.header = <Node node={header} host={host} />;
    const Step = library.WizardStep;
    content = (node.children ?? [])
      .filter((c) => c.component === 'WizardStep')
      .map((step, i) => (
        <Step key={i} {...(step.props ?? {})}>
          {(step.children ?? []).map((child, j) => (
            <Node key={j} node={child} host={host} />
          ))}
        </Step>
      ));
  } else if (node.children?.length) {
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
  let element = content === undefined ? <Component {...props} /> : <Component {...props}>{content}</Component>;
  if (entry.id === 'Wizard') element = <WizardToggleName>{element}</WizardToggleName>;
  return entry.id === 'FormGroup' && props.fieldId ? <FieldIdContext.Provider value={generatedId}>{element}</FieldIdContext.Provider> : element;
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
