import { DataListCheck, DataListItemCells, DataListItemRow, DropdownList, Icon, MenuToggle, MenuToggleCheckbox, TabTitleText, type MenuToggleElement } from '@patternfly/react-core';
import CheckCircleIcon from '@patternfly/react-icons/dist/esm/icons/check-circle-icon';
import EllipsisHIcon from '@patternfly/react-icons/dist/esm/icons/ellipsis-h-icon';
import OutlinedCircleIcon from '@patternfly/react-icons/dist/esm/icons/outlined-circle-icon';
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type MouseEvent, type ReactNode, type Ref } from 'react';
import { componentsById, type Intent, type ViewNode, type ViewSpec } from '../design-system/catalog';
import { validateView } from '../design-system/validateView';
import { icons } from './icons';
import { library } from './library';
import './Renderer.css';

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
  /** Opens a graph object in the object panel (view spec `opens`, design system spec 4.4), from the element chosen. */
  onOpen?: (object: string, origin?: HTMLElement) => void;
  /**
   * The objects chosen for a batch action (view spec `selects`, design system spec 4.3). While `selecting`, cards show
   * their select control and choosing a card chooses it; list rows always have their checkbox.
   */
  selection?: { selecting: boolean; selected: ReadonlySet<string>; onSelect: (object: string, chosen: boolean) => void };
  /** Runs a method on every chosen object (view spec `batch`). */
  onBatch?: (method: string) => void;
}

/** A card in select mode: whether it is chosen, how to change that, and its title for the control's name. */
const SelectContext = createContext<{ chosen: boolean; toggle: () => void; title: string } | undefined>(undefined);

/** The text of the first CardTitle in a node, to name a card's select control. */
function cardTitle(node: ViewNode): string {
  if (node.component === 'CardTitle') return String((node.props as { label?: string } | undefined)?.label ?? '');
  for (const child of node.children ?? []) {
    const found = cardTitle(child);
    if (found) return found;
  }
  return '';
}

/** A card's round select control (design system spec 4.3): an empty circle, or a green check when chosen. A checkbox. */
function SelectCircle() {
  const select = useContext(SelectContext)!;
  return (
    <Button
      variant="plain"
      role="checkbox"
      aria-checked={select.chosen}
      aria-label={`Select ${select.title}`}
      className="app-select-circle"
      onClick={select.toggle}
      icon={
        select.chosen ? (
          <Icon status="success" size="lg">
            <CheckCircleIcon />
          </Icon>
        ) : (
          <Icon size="lg">
            <OutlinedCircleIcon />
          </Icon>
        )
      }
    />
  );
}
const { Button } = library;

/** A list row (design system spec 4.3): a checkbox when it chooses an object, its cells, then its actions. */
function ListRow({ node, host }: { node: ViewNode; host: RenderHost }) {
  const id = useId();
  const { DataListItem, DataListCell, DataListAction } = library;
  const cells = (node.children ?? []).filter((c) => c.component === 'DataListCell');
  const action = (node.children ?? []).find((c) => c.component === 'DataListAction');
  const object = node.selects;
  const chosen = Boolean(object && host.selection?.selected.has(object));
  return (
    <DataListItem aria-labelledby={`${id}-name`} className={chosen ? 'app-row-chosen' : undefined}>
      <DataListItemRow>
        {object && host.selection && (
          <>
            <span id={`${id}-select`} className="pf-v6-screen-reader">
              Select
            </span>
            <DataListCheck id={`${id}-check`} aria-labelledby={`${id}-select ${id}-name`} isChecked={chosen} onChange={(_event, checked) => host.selection!.onSelect(object, checked)} />
          </>
        )}
        <DataListItemCells
          dataListCells={cells.map((cell, i) => (
            <DataListCell key={i} {...(cell.props ?? {})} id={i === 0 ? `${id}-name` : undefined}>
              {(cell.children ?? []).map((child, j) => (
                <Node key={j} node={child} host={host} />
              ))}
            </DataListCell>
          ))}
        />
        {action && (
          <DataListAction {...(action.props ?? {})} id={`${id}-action`} aria-labelledby={`${id}-action`}>
            {(action.children ?? []).map((child, j) => (
              <Node key={j} node={child} host={host} />
            ))}
          </DataListAction>
        )}
      </DataListItemRow>
    </DataListItem>
  );
}

/**
 * A menu (design system spec 4.3): a … button over actions, or PatternFly's bulk select, a checkbox split with a menu and
 * the count chosen. Each item runs its method, its batch action, or its selection intent.
 */
function ActionsMenu({ node, host }: { node: ViewNode; host: RenderHost }) {
  const id = useId();
  const [isOpen, setOpen] = useState(false);
  const { Dropdown, DropdownItem } = library;
  const props = node.props as { 'aria-label': string; toggle?: 'actions' | 'bulk-select'; checked?: 'none' | 'some' | 'all'; count?: number };
  const run = (item: ViewNode) => {
    if (item.action) host.onAction?.(item.action, item);
    else if (item.batch) host.onBatch?.(item.batch);
    else if (item.intent) host.onIntent?.(item.intent);
  };
  const bulk = props.toggle === 'bulk-select';
  const checked = props.checked ?? 'none';
  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={(open: boolean) => setOpen(open)}
      onSelect={() => setOpen(false)}
      popperProps={{ position: bulk ? 'left' : 'right' }}
      toggle={(ref: Ref<MenuToggleElement>) =>
        bulk ? (
          <MenuToggle
            ref={ref}
            aria-label={props['aria-label']}
            isExpanded={isOpen}
            onClick={() => setOpen((open) => !open)}
            splitButtonItems={[
              <MenuToggleCheckbox
                key="all"
                id={`${id}-checkbox`}
                aria-label={checked === 'none' ? 'Select all' : 'Select none'}
                isChecked={checked === 'all' ? true : checked === 'some' ? null : false}
                onChange={() => host.onIntent?.(checked === 'none' ? 'select-all' : 'clear-selection')}
              >
                {props.count ? `${props.count} selected` : undefined}
              </MenuToggleCheckbox>,
            ]}
          />
        ) : (
          <MenuToggle ref={ref} variant="plain" aria-label={props['aria-label']} isExpanded={isOpen} onClick={() => setOpen((open) => !open)} icon={<EllipsisHIcon />} />
        )
      }
    >
      <DropdownList>
        {(node.children ?? []).map((item, i) => (
          <DropdownItem key={i} onClick={() => run(item)}>
            {(item.props as { label: string }).label}
          </DropdownItem>
        ))}
      </DropdownList>
    </Dropdown>
  );
}

/** The object the Card being drawn opens, so its title can be the card's button. */
const OpensContext = createContext<string | undefined>(undefined);

/** Clicks on these, inside an openable card, do their own thing and do not open the card's object. */
const INTERACTIVE = 'button, a, input, select, textarea, label, [role="tab"], [role="radio"], [role="checkbox"]';

/**
 * A card that opens its object (design system spec 4.4): a click anywhere on it opens the object, except on its buttons
 * and other controls. Its title is a button too, so keyboard and screen reader users open it the same way.
 */
function OpenableCard({ node, host }: { node: ViewNode; host: RenderHost }) {
  const object = node.opens;
  const selects = node.selects;
  // In select mode, choosing the card chooses it (design system spec 4.3); its title still opens it.
  const selecting = Boolean(selects && host.selection?.selecting);
  const chosen = Boolean(selects && host.selection?.selected.has(selects));
  const toggle = () => selects && host.selection?.onSelect(selects, !chosen);
  const { Card } = library;
  const onClick = (event: MouseEvent<HTMLElement>) => {
    const control = (event.target as HTMLElement).closest(INTERACTIVE);
    if (control && event.currentTarget.contains(control)) return;
    // Selecting text in a card is not a click on it.
    if (window.getSelection()?.toString()) return;
    if (selecting) toggle();
    else if (object) host.onOpen?.(object, event.currentTarget);
  };
  const className = ['app-openable-card', chosen ? 'app-card-chosen' : ''].filter(Boolean).join(' ');
  return (
    <OpensContext.Provider value={object}>
      <SelectContext.Provider value={selecting ? { chosen, toggle, title: cardTitle(node) } : undefined}>
        <Card {...(node.props ?? {})} className={className} onClick={onClick}>
          {(node.children ?? []).map((child, i) => (
            <Node key={i} node={child} host={host} />
          ))}
        </Card>
      </SelectContext.Provider>
    </OpensContext.Provider>
  );
}

/** Tabs bound to a field (design system spec 4.4): the chosen tab is the field's value, the first tab when it has none. */
function BoundTabs({ node, host }: { node: ViewNode; host: RenderHost }) {
  const { Tabs, Tab, Badge } = library;
  const tabs = (node.children ?? []).filter((c) => c.component === 'Tab');
  const keys = tabs.map((t) => (t.props as { eventKey: string }).eventKey);
  const chosen = node.field ? host.values?.[node.field] : undefined;
  const [own, setOwn] = useState(keys[0]);
  const active = chosen && keys.includes(chosen) ? chosen : node.field ? keys[0] : own;
  return (
    <Tabs
      {...(node.props ?? {})}
      activeKey={active}
      onSelect={(_event: unknown, key: string | number) => (node.field ? host.onField?.(node.field, String(key)) : setOwn(String(key)))}
      mountOnEnter
      unmountOnExit
    >
      {tabs.map((tab) => {
        const { eventKey, label, count } = tab.props as { eventKey: string; label: string; count?: number };
        return (
          <Tab
            key={eventKey}
            eventKey={eventKey}
            title={
              <TabTitleText>
                {label}
                {count !== undefined && (
                  <>
                    {' '}
                    <Badge isRead>{count}</Badge>
                  </>
                )}
              </TabTitleText>
            }
          >
            {(tab.children ?? []).map((child, i) => (
              <Node key={i} node={child} host={host} />
            ))}
          </Tab>
        );
      })}
    </Tabs>
  );
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
  const opens = useContext(OpensContext);
  const select = useContext(SelectContext);
  const entry = componentsById.get(node.component)!;
  const Component = library[entry.import.export];
  if (entry.id === 'Chart') return <ChartFrame node={node} />;
  if (entry.id === 'Card' && node.field) return <SelectableCard node={node} host={host} />;
  if (entry.id === 'Card' && (node.opens || node.selects)) return <OpenableCard node={node} host={host} />;
  if (entry.id === 'DataListItem') return <ListRow node={node} host={host} />;
  if (entry.id === 'Dropdown') return <ActionsMenu node={node} host={host} />;
  if (entry.id === 'Tabs') return <BoundTabs node={node} host={host} />;
  const { label, name, ...props } = (node.props ?? {}) as Record<string, unknown>;

  if (NEEDS_ID.has(entry.id)) props.id = entry.id !== 'Radio' && groupId ? groupId : generatedId;
  if (entry.id === 'FormGroup' && props.role !== 'radiogroup') props.fieldId = generatedId;

  // Fields: the value comes from the host, and changes go back to it.
  const field = node.field;
  if (field && VALUE_FIELDS.has(entry.id)) {
    props.value = host.values?.[field] ?? '';
    props.onChange = (_event: unknown, value: string) => host.onField?.(field, value);
  }
  // A ToggleGroupItem is chosen while its field has its value.
  if (field && entry.id === 'ToggleGroupItem') {
    const value = props.value as string;
    props.isSelected = host.values?.[field] === value;
    props.onChange = () => host.onField?.(field, value);
    delete props.value;
  }
  if (entry.id === 'ToggleGroupItem' && typeof props.icon === 'string') {
    const Svg = icons[props.icon];
    props.icon = <Svg />;
  }
  // A CardHeader in select mode carries the card's select control at its end.
  if (entry.id === 'CardHeader' && select) props.actions = { actions: <SelectCircle />, hasNoOffset: true };
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
  if (entry.id === 'Button' && node.batch) {
    const method = node.batch;
    props.onClick = () => host.onBatch?.(method);
  }
  if (entry.id === 'Button' && node.opens) {
    const object = node.opens;
    props.onClick = (event: MouseEvent<HTMLElement>) => host.onOpen?.(object, event.currentTarget);
  }
  // In a card that opens its object, the title is the card's button.
  if (entry.id === 'CardTitle' && opens && content !== undefined) {
    const Button = library.Button;
    content = (
      <Button variant="link" isInline className="app-card-open" onClick={(event: MouseEvent<HTMLElement>) => host.onOpen?.(opens, event.currentTarget.closest<HTMLElement>('.app-openable-card') ?? undefined)}>
        {content}
      </Button>
    );
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
