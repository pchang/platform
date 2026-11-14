import { describe, expect, it } from 'vitest';
import type { ViewNode } from '../design-system/catalog';
import { validateView } from '../design-system/validateView';
import type { CommitResult, MethodComposition, MethodOption, ObjectSummary } from '../data/client';
import { batchNotice, buildBatchView, countOf } from './batchView';
import { buildTypeView, commonMethods, type ListControls, type ListEntry } from './orientViews';

// Object lists in cards or a list, the list bar, and batch actions (design system spec 4.3; platform spec 5.4).

const summary = (id: string): ObjectSummary => ({ iri: `urn:${id}`, identifier: id, type: 'urn:SafetyCase', typeLabel: 'Safety Case', title: `Case ${id}`, pluralLabel: 'Safety Cases', state: { Workflow: 'received' } });
const option = (name: string, label: string, archetype = 'Fill in', available = true): MethodOption => ({ method: `urn:${name}`, label, available, blocks: [], archetype: { archetype: `urn:${archetype}`, label: archetype } });
const cases = ['SC-4', 'SC-5', 'SC-6'].map(summary);
const methods = new Map([
  ['urn:SC-4', [option('Triage', 'Triage'), option('Flag', 'Flag duplicate', 'Compare and decide')]],
  ['urn:SC-5', [option('Triage', 'Triage'), option('Flag', 'Flag duplicate', 'Compare and decide')]],
  ['urn:SC-6', [option('Assess', 'Assess')]],
]);
const controls = (c: Partial<ListControls> = {}): ListControls => ({ mode: 'cards', selecting: false, selected: new Set(), ...c });

function find(node: ViewNode, test: (n: ViewNode) => boolean): ViewNode[] {
  return [...(test(node) ? [node] : []), ...(node.children ?? []).flatMap((c) => find(c, test))];
}
const labelsOf = (nodes: ViewNode[]) => nodes.map((n) => (n.props as { label?: string; 'aria-label'?: string }).label ?? (n.props as { 'aria-label'?: string })['aria-label']);

describe('the list bar (design system spec 4.3)', () => {
  it('offers Select and the view toggle on cards, with every card able to be chosen', () => {
    const view = buildTypeView('Safety Cases', cases, { methods, controls: controls() });
    expect(validateView(view).errors).toEqual([]);
    const bar = find(view.root, (n) => n.component === 'Toolbar')[0];
    expect(bar.props).toMatchObject({ isSticky: true });
    expect(labelsOf(find(bar, (n) => n.component === 'Button'))).toEqual(['Select']);
    expect(find(bar, (n) => n.component === 'ToggleGroupItem').map((n) => (n.props as { value: string }).value)).toEqual(['cards', 'list']);
    expect(find(view.root, (n) => n.component === 'Card' && Boolean(n.selects)).map((n) => n.selects)).toEqual(cases.map((c) => c.iri));
  });

  it('in select mode, says how many are chosen and offers only the methods all of them have that run for many', () => {
    const view = buildTypeView('Safety Cases', cases, { methods, controls: controls({ selecting: true, selected: new Set(['urn:SC-4', 'urn:SC-5']) }) });
    expect(validateView(view).errors).toEqual([]);
    const bar = find(view.root, (n) => n.component === 'Toolbar')[0];
    // PatternFly's bulk select: some chosen, how many, and a menu to choose all or none.
    const bulk = find(bar, (n) => n.component === 'Dropdown' && (n.props as { toggle?: string }).toggle === 'bulk-select')[0];
    expect(bulk.props).toMatchObject({ checked: 'some', count: 2 });
    expect(find(bulk, (n) => n.component === 'DropdownItem').map((n) => [(n.props as { label: string }).label, n.intent])).toEqual([
      ['Select all (3)', 'select-all'],
      ['Select none', 'clear-selection'],
    ]);
    expect(labelsOf(find(bar, (n) => n.component === 'Button' && !n.batch))).toEqual(['Done selecting']);
    // A thin divider before the actions for what is chosen.
    expect(find(bar, (n) => n.component === 'ToolbarItem' && (n.props as { variant?: string } | undefined)?.variant === 'separator')).toHaveLength(1);
    // Flag duplicate is common to both but is a comparison, so it stays with one object at a time.
    const batch = find(bar, (n) => Boolean(n.batch));
    expect(batch.map((n) => [n.batch, (n.props as { label: string }).label])).toEqual([['urn:Triage', 'Triage']]);
  });

  it('says when no method applies to all the chosen objects', () => {
    const view = buildTypeView('Safety Cases', cases, { methods, controls: controls({ selecting: true, selected: new Set(['urn:SC-4', 'urn:SC-6']) }) });
    expect(find(view.root, (n) => Boolean(n.batch))).toEqual([]);
    expect(JSON.stringify(view)).toContain('No action applies to all of them.');
  });

  it('works out the common methods from what each chosen object has available now', () => {
    const entries: ListEntry[] = cases.map((o) => ({ object: o, status: [], methods: methods.get(o.iri)!, firstIsPrimary: false }));
    expect(commonMethods(entries, new Set()).map((m) => m.label)).toEqual([]);
    expect(commonMethods(entries, new Set(['urn:SC-6'])).map((m) => m.label)).toEqual(['Assess']);
  });
});

describe('the list view (design system spec 4.3)', () => {
  const view = buildTypeView('Safety Cases', cases, { methods, controls: controls({ mode: 'list' }) });

  it('is a DataList with a row for each object, each choosing its object', () => {
    expect(validateView(view).errors).toEqual([]);
    expect(find(view.root, (n) => n.component === 'Gallery')).toEqual([]);
    const rows = find(view.root, (n) => n.component === 'DataListItem');
    expect(rows.map((r) => r.selects)).toEqual(cases.map((c) => c.iri));
    // The title opens the object.
    expect(find(rows[0], (n) => Boolean(n.opens)).map((n) => [n.component, n.opens])).toEqual([['Button', 'urn:SC-4']]);
  });

  it('raises one method to the row and keeps the rest in a … menu named for the object', () => {
    const [row] = find(view.root, (n) => n.component === 'DataListItem');
    const actions = find(row, (n) => n.component === 'DataListAction')[0];
    expect(actions.props).toEqual({ 'aria-label': 'Actions for SC-4' });
    expect(labelsOf(find(actions, (n) => n.component === 'Button'))).toEqual(['Triage']);
    const menu = find(actions, (n) => n.component === 'Dropdown')[0];
    expect(menu.props).toEqual({ 'aria-label': 'More actions for SC-4' });
    expect(find(menu, (n) => n.component === 'DropdownItem').map((n) => [(n.props as { label: string }).label, n.action])).toEqual([
      ['Flag duplicate', { method: 'urn:Flag', target: 'urn:SC-4' }],
    ]);
  });

  it('has no … menu for an object with one method', () => {
    const [, , row] = find(view.root, (n) => n.component === 'DataListItem');
    expect(find(row, (n) => n.component === 'Dropdown')).toEqual([]);
  });

  it('always has the bulk select in list mode, with no Select button', () => {
    const bar = find(view.root, (n) => n.component === 'Toolbar')[0];
    expect(labelsOf(find(bar, (n) => n.component === 'Button'))).toEqual([]);
    expect(find(bar, (n) => n.component === 'Dropdown')[0].props).toMatchObject({ toggle: 'bulk-select', checked: 'none', count: 0 });
  });

  it('shows three batch actions and keeps the rest in a … menu', () => {
    const many = [option('A', 'Alpha'), option('B', 'Beta'), option('C', 'Gamma'), option('D', 'Delta')];
    const all = new Map(cases.map((c) => [c.iri, many]));
    const chosen = buildTypeView('Safety Cases', cases, { methods: all, controls: controls({ mode: 'list', selected: new Set(cases.map((c) => c.iri)) }) });
    const bar = find(chosen.root, (n) => n.component === 'Toolbar')[0];
    expect(find(bar, (n) => n.component === 'Button' && Boolean(n.batch)).map((n) => (n.props as { label: string }).label)).toEqual(['Alpha', 'Beta', 'Gamma']);
    const more = find(bar, (n) => n.component === 'Dropdown' && (n.props as { 'aria-label': string })['aria-label'] === 'More actions for the selected')[0];
    expect(find(more, (n) => n.component === 'DropdownItem').map((n) => n.batch)).toEqual(['urn:D']);
    expect(validateView(chosen).errors).toEqual([]);
  });
});

describe('a batch action (platform spec 5.4, Acting on many objects)', () => {
  const composition: MethodComposition = {
    method: 'urn:Triage',
    label: 'Triage',
    archetype: { archetype: 'urn:FillIn', label: 'Fill in' },
    object: cases[0],
    inputs: [{ name: 'seriousness', label: 'Seriousness', kind: 'choice', choices: [{ value: 'urn:s', label: 'serious' }] }],
  };
  const preview = (id: string): Omit<CommitResult, 'commit'> => ({
    changes: [{ subject: `urn:${id}`, subjectLabel: id, property: 'urn:wf', propertyLabel: 'Workflow', oldValue: 'urn:r', oldLabel: 'received', newValue: 'urn:t', newLabel: 'triaged' }],
    created: [],
    pending: [],
    pendingDescriptions: [],
    background: [],
  });

  it('names the method and how many, takes the inputs once, and shows the same changes once for every object they apply to', () => {
    const view = buildBatchView(composition, cases, { status: 'ready', previews: cases.map((object) => ({ object, preview: preview(object.identifier) })) });
    expect(validateView(view).errors).toEqual([]);
    const json = JSON.stringify(view);
    expect(json).toContain('"title":"Triage 3 safety cases","description":"SC-4, SC-5, SC-6"');
    expect(find(view.root, (n) => n.component === 'Form')).toHaveLength(1);
    expect(json).toContain('"label":"SC-4, SC-5, SC-6","headingLevel":"h3"');
    expect(json.match(/"label":"received → triaged"/g)).toHaveLength(1);
    expect(json).toContain('"label":"Triage 3 safety cases","variant":"primary","isDisabled":false');
  });

  it('names an object the gateway would refuse, with its reasons, and commits only the others', () => {
    const view = buildBatchView(composition, cases, {
      status: 'ready',
      previews: [
        { object: cases[0], preview: preview('SC-4') },
        { object: cases[1], preview: preview('SC-5') },
        { object: cases[2], reasons: ['Workflow must be received'] },
      ],
    });
    const json = JSON.stringify(view);
    expect(json).toContain('"title":"SC-6 will be left out"');
    expect(json).toContain('Workflow must be received');
    expect(json).toContain('"label":"Triage 2 of 3","variant":"primary","isDisabled":false');
  });

  it('cannot commit while nothing would succeed', () => {
    const view = buildBatchView(composition, cases.slice(0, 1), { status: 'ready', previews: [{ object: cases[0], reasons: ['No'] }] });
    expect(JSON.stringify(view)).toContain('"isDisabled":true');
  });

  it('reports every object: those changed, and those left out and why', () => {
    const notice = batchNotice(composition, cases.slice(0, 2), [{ object: cases[2], reasons: ['Workflow must be received'] }]);
    expect(notice.props).toMatchObject({ variant: 'warning', title: 'Triage done on 2 safety cases, 1 left out' });
    expect(JSON.stringify(notice)).toContain('Left out SC-6: Workflow must be received');
    expect(batchNotice(composition, cases, []).props).toMatchObject({ variant: 'success', title: 'Triage done on 3 safety cases' });
  });

  it('counts objects by their type, or as objects when they are of several types', () => {
    expect(countOf(cases.slice(0, 1))).toBe('1 safety case');
    expect(countOf([cases[0], { ...summary('Q-1'), type: 'urn:Query', typeLabel: 'Data Query', pluralLabel: 'Data Queries' }])).toBe('2 objects');
    expect(countOf([{ ...summary('C-1'), typeLabel: 'CAPA', pluralLabel: 'CAPAs' }, { ...summary('C-2'), typeLabel: 'CAPA', pluralLabel: 'CAPAs' }])).toBe('2 CAPAs');
  });
});
