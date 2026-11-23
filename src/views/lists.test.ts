import { describe, expect, it } from 'vitest';
import type { ViewNode } from '../design-system/catalog';
import { validateView } from '../design-system/validateView';
import type { CommitResult, MethodComposition, MethodOption, ObjectSummary } from '../data/client';
import { batchModeOf, batchNotice, buildBatchView, buildSequentialBatchView, countOf, inputsFor, isComplete, type ObjectPreview } from './batchView';
import { askAboutChosen, buildTypeView, commonMethods, type ListControls, type ListEntry } from './orientView';

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
    expect(find(bar, (n) => n.component === 'Button')[0].props).toMatchObject({ variant: 'link' });
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
    expect(labelsOf(find(bar, (n) => n.component === 'Button' && !n.batch))).toEqual(['Ask about the 2 selected', 'Done']);
    // Once selecting, the card bar is the list bar, with Done to end select mode.
    const listBar = find(buildTypeView('Safety Cases', cases, { methods, controls: controls({ mode: 'list', selected: new Set(['urn:SC-4', 'urn:SC-5']) }) }).root, (n) => n.component === 'Toolbar')[0];
    const dropDone = (n: ViewNode): ViewNode => ({
      ...n,
      ...(n.children
        ? { children: n.children.filter((c) => !(c.component === 'ToolbarItem' && (c.children?.[0]?.props as { label?: string } | undefined)?.label === 'Done')).map(dropDone) }
        : {}),
    });
    const withoutDone = dropDone(bar);
    expect(withoutDone).toEqual(listBar);
    // A thin divider before the actions for what is chosen.
    expect(find(bar, (n) => n.component === 'ToolbarItem' && (n.props as { variant?: string } | undefined)?.variant === 'separator')).toHaveLength(1);
    // Flag duplicate is common to both but is a comparison, so it stays with one object at a time.
    const batch = find(bar, (n) => Boolean(n.batch));
    expect(batch.map((n) => [n.batch, (n.props as { label: string }).label])).toEqual([['urn:Triage', 'Triage']]);
  });

  it('begins a type’s list with a Back to Home link above the heading', () => {
    const json = JSON.stringify(buildTypeView('Safety Cases', cases, { methods, controls: controls() }));
    expect(json).toContain('"label":"Back to Home","variant":"link","icon":"arrow-left","isInline":true},"goes":"home"');
    expect(json.indexOf('Back to Home')).toBeLessThan(json.indexOf('"label":"Safety Cases"'));
  });

  it('leaves New out of the bar while objects are chosen, and keeps it otherwise (design system spec 4.3)', () => {
    const create = { type: 'urn:SC', typeLabel: 'Safety Case', verb: 'New' as const };
    const offered = (selected: string[]) => JSON.stringify(buildTypeView('Safety Cases', cases, { methods, controls: controls({ mode: 'list', selected: new Set(selected), create }) })).includes('"creates"');
    expect(offered([])).toBe(true);
    expect(offered(['urn:SC-4'])).toBe(false);
  });

  it('offers only Ask when no method applies to all the chosen objects, and says nothing about it', () => {
    const view = buildTypeView('Safety Cases', cases, { methods, controls: controls({ selecting: true, selected: new Set(['urn:SC-4', 'urn:SC-6']) }) });
    expect(find(view.root, (n) => Boolean(n.batch))).toEqual([]);
    expect(JSON.stringify(view)).not.toContain('No action applies');
    // Ask is still there, as the free-text way forward when nothing anticipated fits (design system spec 4.3).
    expect(find(view.root, (n) => Boolean(n.asks) && Array.isArray(n.asks)).map((n) => n.asks)).toEqual([['urn:SC-4', 'urn:SC-6']]);
  });

  it('ends the actions for what is chosen with Ask about the chosen, after the set and batch actions', () => {
    const view = buildTypeView('Safety Cases', cases, { methods, controls: controls({ mode: 'list', selected: new Set(['urn:SC-4', 'urn:SC-5']), setActions: [{ method: 'urn:Compare', label: 'Compare' }] }) });
    expect(validateView(view).errors).toEqual([]);
    const bar = find(view.root, (n) => n.component === 'Toolbar')[0];
    const start = (bar.children![0].children![0].children ?? []).map((item) => JSON.stringify(item));
    const at = (needle: string) => start.findIndex((i) => i.includes(needle));
    expect(at('"batch":"urn:Compare"')).toBeLessThan(at('"batch":"urn:Triage"'));
    expect(at('"batch":"urn:Triage"')).toBeLessThan(at('Ask about the 2 selected'));
    expect(at('Ask about the 2 selected')).toBe(start.length - 1);
    const ask = find(bar, (n) => Boolean(n.asks))[0];
    expect(ask).toMatchObject({ component: 'Button', props: { icon: 'comments', 'aria-label': 'Ask about the 2 selected' }, asks: ['urn:SC-4', 'urn:SC-5'] });
    // Nothing chosen, nothing to ask about.
    expect(find(buildTypeView('Safety Cases', cases, { methods, controls: controls({ mode: 'list' }) }).root, (n) => Boolean(n.asks) && Array.isArray(n.asks))).toEqual([]);
  });

  it('asks about at most ten chosen objects, and says why not with more', () => {
    expect(askAboutChosen(Array.from({ length: 10 }, (_, i) => `urn:o${i}`))).toMatchObject({ component: 'Tooltip', props: { content: 'Ask about the 10 selected' } });
    const tooMany = askAboutChosen(Array.from({ length: 11 }, (_, i) => `urn:o${i}`));
    expect(tooMany).toMatchObject({ component: 'Tooltip', props: { content: 'Choose ten or fewer to ask about them.' } });
    expect(tooMany.children![0]).toMatchObject({ props: { isAriaDisabled: true } });
    expect(tooMany.children![0].asks).toBeUndefined();
  });

  it('works out the common methods from what each chosen object has available now', () => {
    const entries: ListEntry[] = cases.map((o) => ({ object: o, status: [], methods: methods.get(o.iri)!, firstIsPrimary: false }));
    expect(commonMethods(entries, new Set()).map((m) => m.label)).toEqual([]);
    expect(commonMethods(entries, new Set(['urn:SC-6'])).map((m) => m.label)).toEqual(['Assess']);
  });
});

describe('the list view (design system spec 4.3)', () => {
  const view = buildTypeView('Safety Cases', cases, { methods, controls: controls({ mode: 'list' }) });

  const bodyRows = (root: ViewNode) => find(find(root, (n) => n.component === 'Tbody')[0], (n) => n.component === 'Tr');
  const cellText = (cell: ViewNode) => find(cell, (n) => n.component === 'Content' || n.component === 'Label' || n.component === 'Button').map((n) => (n.props as { label?: string }).label ?? '').join(' ');

  it('is a table with a row for each object, each choosing its object', () => {
    expect(validateView(view).errors).toEqual([]);
    expect(find(view.root, (n) => n.component === 'Gallery')).toEqual([]);
    const rows = bodyRows(view.root);
    expect(rows.map((r) => r.selects)).toEqual(cases.map((c) => c.iri));
    // The title opens the object.
    expect(find(rows[0], (n) => Boolean(n.opens)).map((n) => [n.component, n.opens])).toEqual([['Button', 'urn:SC-4']]);
  });

  it('heads a column for each state dimension, with the values in plain text, and leaves out Type when all are one type', () => {
    const head = find(view.root, (n) => n.component === 'Th').map((n) => (n.props as { label?: string; screenReaderText?: string }).label ?? `(${(n.props as { screenReaderText: string }).screenReaderText})`);
    // No object needs attention here, so there is no Attention column.
    expect(head).toEqual(['Title', 'Workflow', '(Actions)']);
    const [row] = bodyRows(view.root);
    // The identifier has no column: it follows the title on the same line, quiet.
    expect((row.children ?? []).map(cellText)).toEqual(['Case SC-4 SC-4', 'received', 'Triage ']);
    expect(JSON.stringify(row.children![0])).toContain('"label":"SC-4","component":"small","isSubtle":true');
    // Every cell keeps to one line; the actions column fits its content.
    expect(find(row, (n) => n.component === 'Td').map((n) => (n.props as { modifier?: string }).modifier)).toEqual(['nowrap', 'nowrap', 'fitContent']);
  });

  it('adds an Attention column for deadlines, urgency and runs once any object has one', () => {
    const runs = [{ run: 'urn:r', method: 'urn:Detect', methodLabel: 'Run signal detection', object: 'urn:SC-5', objectIdentifier: 'SC-5', status: 'running' as const, startedAt: '', startedBy: '', startedByName: '' }];
    const withRun = buildTypeView('Safety Cases', cases, { methods, runs: runs as never, controls: controls({ mode: 'list' }) });
    const head = find(withRun.root, (n) => n.component === 'Th').map((n) => (n.props as { label?: string }).label);
    expect(head).toEqual(['Title', 'Attention', 'Workflow', undefined]);
    const [, second] = bodyRows(withRun.root);
    expect(cellText((second.children ?? [])[1])).toBe('Run signal detection: running');
  });

  it('puts the lifecycle first among the state columns, adds Type for mixed types, and leaves cells empty where a type has no such dimension', () => {
    const lifecycle = (dimension: string, stage: string) => ({ dimension, stage, position: 0, stages: [stage] });
    const mixed: ObjectSummary[] = [
      { ...summary('SC-7'), state: { Causality: 'possible', Workflow: 'triaged' }, lifecycle: lifecycle('Workflow', 'triaged') },
      { ...summary('SUB-1'), type: 'urn:Submission', typeLabel: 'Submission', pluralLabel: 'Submissions', state: { Status: 'draft', Deadline: 'on track' }, lifecycle: lifecycle('Status', 'draft') },
    ];
    const table = buildTypeView('Mixed', mixed, { controls: controls({ mode: 'list' }) });
    expect(validateView(table).errors).toEqual([]);
    const head = find(table.root, (n) => n.component === 'Th').map((n) => (n.props as { label?: string }).label);
    expect(head).toEqual(['Title', 'Type', 'Workflow', 'Causality', 'Status', 'Deadline', undefined]);
    const [first, sub] = bodyRows(table.root);
    expect((sub.children ?? []).map(cellText).slice(0, 6)).toEqual(['Case SUB-1 SUB-1', 'Submission', '', '', 'draft', 'on track']);
    // The Type column is plain text: a row stands for its object, so nothing in it leads elsewhere (design system spec 4.3, Type links).
    expect(JSON.stringify(table.root)).not.toContain('"lists"');
    expect(first).toBeDefined();
  });

  // Ask about this comes after the methods, at the right end of the actions column, so it lines up down the list (design system spec 4.1).
  it('puts Ask about this at the right end of the actions, after the methods', () => {
    const [row] = bodyRows(view.root);
    const actions = find(row, (n) => n.component === 'Td' && (n.props as { isActionCell?: boolean }).isActionCell === true)[0];
    const outer = find(actions, (n) => n.component === 'Flex')[0];
    expect(outer.props).toMatchObject({ justifyContent: { default: 'justifyContentSpaceBetween' } });
    expect(outer.children?.at(-1)?.asks).toBe('urn:SC-4');
    expect(labelsOf(find(outer.children![0], (n) => n.component === 'Button'))).toEqual(['Triage']);
  });

  it('raises one method to the row and keeps the rest in a … menu named for the object', () => {
    const [row] = bodyRows(view.root);
    const actions = find(row, (n) => n.component === 'Td' && (n.props as { isActionCell?: boolean }).isActionCell === true)[0];
    expect(labelsOf(find(actions, (n) => n.component === 'Button'))).toEqual(['Triage', 'Ask about SC-4']);
    const menu = find(actions, (n) => n.component === 'Dropdown')[0];
    expect(menu.props).toEqual({ 'aria-label': 'More actions for SC-4' });
    expect(find(menu, (n) => n.component === 'DropdownItem').map((n) => [(n.props as { label: string }).label, n.action])).toEqual([
      ['Flag duplicate', { method: 'urn:Flag', target: 'urn:SC-4' }],
    ]);
  });

  it('raises the work waiting before an action the person chooses to take', () => {
    const onDemandFirst = new Map([['urn:SC-4', [{ ...option('Flag', 'Flag duplicate', 'Compare and decide'), onDemand: true }, option('Triage', 'Triage')]]]);
    const table = buildTypeView('Safety Cases', cases.slice(0, 1), { methods: onDemandFirst, controls: controls({ mode: 'list' }) });
    const [row] = bodyRows(table.root);
    const actions = find(row, (n) => n.component === 'Td' && (n.props as { isActionCell?: boolean }).isActionCell === true)[0];
    expect(labelsOf(find(actions, (n) => n.component === 'Button'))).toEqual(['Triage', 'Ask about SC-4']);
    expect(find(actions, (n) => n.component === 'DropdownItem').map((n) => (n.props as { label: string }).label)).toEqual(['Flag duplicate']);
  });

  it('has no … menu for an object with one method', () => {
    const [, , row] = bodyRows(view.root);
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

describe('a batch that runs one after another (platform spec 5.4; design system spec 4.3)', () => {
  const events = ['AE-3', 'AE-5'].map((id) => ({ ...summary(id), type: 'urn:AdverseEvent', typeLabel: 'Adverse Event', pluralLabel: 'Adverse Events', title: `Event ${id}` }));
  const report: MethodComposition = {
    method: 'urn:ReportToSafety',
    label: 'Report to safety',
    archetype: { archetype: 'urn:FillIn', label: 'Fill in' },
    object: events[0],
    inputs: [
      { name: 'reporter', label: 'Reporter', kind: 'person', choices: [{ value: 'urn:ben', label: 'Ben' }] },
      { name: 'note', label: 'Note to safety', kind: 'text', perObject: true },
    ],
  };
  const created = (id: string): Omit<CommitResult, 'commit'> => ({
    changes: [{ subject: `urn:${id}`, subjectLabel: id, property: 'urn:rep', propertyLabel: 'Reporting', oldValue: 'urn:n', oldLabel: 'not reported', newValue: 'urn:r', newLabel: 'reported to safety' }],
    created: [],
    pending: [],
    pendingDescriptions: [],
    background: [],
  });
  const stepsOf = (view: ReturnType<typeof buildSequentialBatchView>) => find(view.root, (n) => n.component === 'WizardStep').map((n) => n.props as { name: string; footer: { isNextDisabled?: boolean; nextButtonText?: string } });

  it('runs together when every input is shared, and one after another when the ontology marks one as about each object', () => {
    expect(batchModeOf({ ...report, inputs: [report.inputs[0]] })).toBe('together');
    expect(batchModeOf({ ...report, inputs: [] })).toBe('together');
    expect(batchModeOf(report)).toBe('one after another');
  });

  it('keeps each object’s own inputs apart, and shares the rest', () => {
    const values = { reporter: 'urn:ben', noteForAE3: 'Rash after dose 2', noteForAE5: '' };
    expect(inputsFor(report, values, events[0])).toEqual({ reporter: 'urn:ben', note: 'Rash after dose 2' });
    expect(isComplete(report, values, events[0])).toBe(true);
    expect(isComplete(report, values, events[1])).toBe(false);
  });

  it('is a Wizard: the shared inputs, a step per object with its own field, then Review', () => {
    const view = buildSequentialBatchView(report, events, new Map(), {});
    expect(validateView(view).errors).toEqual([]);
    expect(stepsOf(view).map((s) => s.name)).toEqual(['For all of them', 'AE-3', 'AE-5', 'Review']);
    expect(stepsOf(view).map((s) => s.footer.isNextDisabled)).toEqual([true, true, true, true]);
    const json = JSON.stringify(view);
    expect(json).toContain('"title":"Report to safety 2 adverse events","description":"AE-3, AE-5"');
    expect(json).toContain('"field":"noteForAE3"');
    expect(json).toContain('"field":"noteForAE5"');
    expect(json).toContain('"isVisitRequired":true');
    // No shared inputs, no shared step.
    expect(stepsOf(buildSequentialBatchView({ ...report, inputs: [report.inputs[1]] }, events, new Map(), {})).map((s) => s.name)).toEqual(['AE-3', 'AE-5', 'Review']);
  });

  it('moves on from an object once its own preview is in, and reviews every object before committing them', () => {
    const states = new Map<string, ObjectPreview>([
      [events[0].iri, { status: 'ready', preview: created('AE-3') }],
      [events[1].iri, { status: 'ready', reasons: ['The event was already reported to safety'] }],
    ]);
    const view = buildSequentialBatchView(report, events, states, { reporter: 'urn:ben' });
    const steps = stepsOf(view);
    expect(steps.map((s) => s.footer.isNextDisabled)).toEqual([false, false, false, false]);
    expect(steps[3].footer.nextButtonText).toBe('Report to safety 1 of 2');
    const json = JSON.stringify(view);
    expect(json.match(/"label":"not reported → reported to safety"/g)).toHaveLength(2);
    expect(json).toContain('"title":"AE-5 will be left out"');
    expect(json).toContain('"label":"AE-3 · Event AE-3","headingLevel":"h4"');
  });

  it('names an object the batch will create by its type, since its identifier is given only at commit', () => {
    const preview: Omit<CommitResult, 'commit'> = {
      ...created('AE-3'),
      created: ['urn:SC-27'],
      changes: [
        ...created('AE-3').changes,
        { subject: 'urn:SC-27', subjectLabel: 'SafetyCase-27', property: 'urn:type', propertyLabel: 'type', newValue: 'urn:SafetyCase', newLabel: 'Safety Case' },
        { subject: 'urn:SC-27', subjectLabel: 'SafetyCase-27', property: 'urn:note', propertyLabel: 'note from the reporter', newValue: 'Rash', newLabel: 'Rash' },
      ],
    };
    const json = JSON.stringify(buildSequentialBatchView(report, events.slice(0, 1), new Map([[events[0].iri, { status: 'ready', preview }]]), {}));
    expect(json).toContain('"label":"a new Safety Case, note from the reporter: Rash"');
    expect(json).not.toContain('SafetyCase-27');
  });

  it('cannot commit until every object has been checked', () => {
    const states = new Map<string, ObjectPreview>([[events[0].iri, { status: 'ready', preview: created('AE-3') }]]);
    expect(stepsOf(buildSequentialBatchView(report, events, states, { reporter: 'urn:ben' }))[3].footer.isNextDisabled).toBe(true);
  });
});
