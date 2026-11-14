import { describe, expect, it } from 'vitest';
import { validateView } from '../design-system/validateView';
import type { MethodOption, RunView, SearchResult, ToDoItem } from '../data/client';
import { buildSearchView, buildSummary, buildTodoView, buildTypeView, loadingView, matchesFilter } from './orientViews';

const object = { iri: 'urn:x', identifier: 'SUB-1', type: 'urn:t', typeLabel: 'Submission', title: 'A Submission title', pluralLabel: 'Submissions', state: { Status: 'draft', Deadline: 'on track' } };
const items: ToDoItem[] = [
  { object, tasks: [{ method: 'urn:m', label: 'Send for review', archetype: { archetype: 'urn:a', label: 'Fill in' } }], actions: [], urgency: 0, deadline: '2026-11-17' },
  { object: { ...object, identifier: 'B-002', typeLabel: 'Batch', state: { Quality: 'pending' } }, tasks: [], actions: [{ method: 'urn:q', label: 'Quarantine batch', archetype: { archetype: 'urn:a', label: 'Fill in' } }], urgency: 3 },
];

describe('Orient views are valid view specs drawn only from the catalog (design system 4.3)', () => {
  it.each([
    ['To do', buildTodoView(items, 'Chloé Martin, Drug Safety Physician')],
    ['an empty To do', buildTodoView([], 'Ben Okafor, Clinical Data Manager')],
    ['a list of objects', buildTypeView('Submissions', [object])],
    ['an empty list', buildTypeView('CAPAs', [])],
    ['loading', loadingView],
  ])('%s', (_name, view) => {
    expect(validateView(view).errors).toEqual([]);
  });

  it('shows tasks whose pattern is not built yet as text, not as buttons', () => {
    // No method in the life sciences domain uses Choose an object yet, so its pattern is not built.
    const choose = [{ ...items[0], tasks: [{ method: 'urn:s', label: 'Link a record', archetype: { archetype: 'urn:a', label: 'Choose an object' } }] }];
    const json = JSON.stringify(buildTodoView(choose, 'Dev Raman, Drug Safety Physician'));
    expect(json).toContain('Link a record (Choose an object, coming soon)');
    // No method button: only the list bar's own controls.
    expect(json).not.toContain('"action":');
  });

  it('says what is waiting, and what can be done on an urgent object', () => {
    const json = JSON.stringify(buildTodoView(items, 'Chloé Martin, Drug Safety Physician'));
    expect(json).toContain('"label":"Waiting for you:"');
    expect(json).toContain('{"component":"Button","props":{"label":"Send for review","variant":"primary","size":"sm"},"action":{"method":"urn:m","target":"urn:x"}}');
    expect(json).toContain('"label":"You can:"');
    expect(json).toContain('"label":"Quarantine batch","variant":"secondary"');
    expect(json).toContain('"label":"Urgent","status":"danger"');
  });

  const product = { iri: 'urn:p', identifier: 'P-101', type: 'urn:Product', typeLabel: 'Product', title: 'A Product title', pluralLabel: 'Products', state: { Status: 'investigational' } };
  const detect: MethodOption = { method: 'urn:detect', label: 'Run signal detection', available: true, blocks: [], archetype: { archetype: 'urn:a', label: 'Start and track' } };
  const blocked: MethodOption = { ...detect, method: 'urn:x', label: 'Withdraw', available: false, blocks: ['No'] };
  const run: RunView = {
    run: 'urn:run/1', method: 'urn:detect', methodLabel: 'Run signal detection', object: 'urn:p', objectIdentifier: 'P-101', status: 'running', progress: 0.5,
    startedBy: 'urn:c', startedByName: 'Chloé Martin', startedAt: '2026-11-11T10:00:00Z', created: [],
  };

  it('offers on an object list the methods the person can run now, and shows runs in progress (design system 4.3)', () => {
    const view = buildTypeView('Products', [product], { methods: new Map([['urn:p', [detect, blocked]]]), runs: [run] });
    expect(validateView(view).errors).toEqual([]);
    const json = JSON.stringify(view);
    expect(json).toContain('"label":"You can:"');
    expect(json).toContain('{"component":"Button","props":{"label":"Run signal detection","variant":"secondary","size":"sm"},"action":{"method":"urn:detect","target":"urn:p"}}');
    expect(json).not.toContain('Withdraw');
    expect(json).toContain('{"component":"Label","props":{"label":"Run signal detection: running","status":"info"}}');
  });

  it('shows no run label once the run has ended', () => {
    const json = JSON.stringify(buildTodoView([{ ...items[0], object: product }], 'Chloé Martin', undefined, [{ ...run, status: 'succeeded' }]));
    expect(json).not.toContain('Run signal detection: running');
  });
});

describe('the To do summary (design system spec 4.3)', () => {
  const today = new Date('2026-11-12T09:00:00Z');
  const lifecycle = (stage: string, position: number, stages: string[]) => ({ dimension: 'Workflow', stage, position, stages });
  const WF = ['received', 'triaged', 'assessed', 'reported', 'closed'];
  const caseItem = (id: string, position: number, extra: Partial<ToDoItem> = {}): ToDoItem => ({
    object: { iri: `urn:${id}`, identifier: id, type: 'urn:SafetyCase', typeLabel: 'Safety Case', title: 'A Safety Case title', pluralLabel: 'Safety Cases', state: {}, lifecycle: lifecycle(WF[position], position, WF) },
    tasks: [{ method: 'urn:m', label: 'Triage', archetype: { archetype: 'urn:a', label: 'Fill in' } }],
    actions: [],
    urgency: 0,
    ...extra,
  });
  const sub: ToDoItem = {
    ...caseItem('SUB-1', 0, { deadline: '2026-11-17' }),
    object: { iri: 'urn:SUB-1', identifier: 'SUB-1', type: 'urn:Submission', typeLabel: 'Submission', title: 'A Submission title', pluralLabel: 'Submissions', state: {}, lifecycle: lifecycle('draft', 0, ['draft', 'in review', 'submitted', 'acknowledged']) },
  };
  const items = [sub, caseItem('SC-1', 0), caseItem('SC-2', 0, { urgency: 3 }), caseItem('SC-3', 2), caseItem('SC-4', 1, { deadline: '2026-11-10' })];

  it('counts urgent, due within 7 days and overdue; overdue is not also due', () => {
    expect(items.filter((i) => matchesFilter(i, 'urgent', today)).map((i) => i.object.identifier)).toEqual(['SC-2']);
    expect(items.filter((i) => matchesFilter(i, 'due', today)).map((i) => i.object.identifier)).toEqual(['SUB-1']);
    expect(items.filter((i) => matchesFilter(i, 'overdue', today)).map((i) => i.object.identifier)).toEqual(['SC-4']);
    expect(items.filter((i) => matchesFilter(i, 'all', today))).toHaveLength(5);
    // Today and seven days on are both due; eight days on is not.
    expect(matchesFilter({ ...sub, deadline: '2026-11-12' }, 'due', today)).toBe(true);
    expect(matchesFilter({ ...sub, deadline: '2026-11-19' }, 'due', today)).toBe(true);
    expect(matchesFilter({ ...sub, deadline: '2026-11-20' }, 'due', today)).toBe(false);
  });

  it('is a valid view spec with four selectable count tiles bound to the filter', () => {
    const view = buildTodoView(items, 'Chloé Martin', undefined, [], { today });
    expect(validateView(view).errors).toEqual([]);
    const json = JSON.stringify(view);
    for (const [value, title, count] of [['all', 'Waiting', 5], ['urgent', 'Urgent', 1], ['due', 'Due within 7 days', 1], ['overdue', 'Overdue', 1]]) {
      expect(json).toContain(`"props":{"isSelectable":true,"value":"${value}","isFullHeight":true,"isCompact":true},"field":"todoFilter","children":[{"component":"CardTitle","props":{"label":"${title}","component":"h3"}},{"component":"CardBody","children":[{"component":"Content","props":{"label":"${count}","isEditorial":true}}]}]`);
    }
  });

  it('narrows the cards to the chosen count, and says so when nothing matches', () => {
    const urgent = JSON.stringify(buildTodoView(items, 'Chloé Martin', undefined, [], { today, filter: 'urgent' }));
    expect(urgent).toContain(`"label":"SC-2 · Safety Case"`);
    expect(urgent).not.toContain(`"label":"SC-1 · Safety Case"`);
    // The counts stay those of every item.
    expect(urgent).toContain('"label":"Waiting","component":"h3"}},{"component":"CardBody","children":[{"component":"Content","props":{"label":"5"');
    const none = JSON.stringify(buildTodoView([caseItem('SC-1', 0)], 'Chloé Martin', undefined, [], { today, filter: 'overdue' }));
    expect(none).toContain('Nothing matches. Choose Waiting to see every item.');
  });

  it('is only the count tiles: no chart of work by type and stage', () => {
    const summary = buildSummary(items, today);
    expect(summary).toHaveLength(1);
    expect(JSON.stringify(summary)).not.toContain('"component":"Chart"');
  });

  it('labels a deadline already past as overdue, a danger, and one to come as due, a warning', () => {
    const json = JSON.stringify(buildTodoView(items, 'Chloé Martin', undefined, [], { today }));
    expect(json).toContain('{"component":"Label","props":{"label":"Overdue since Nov 10, 2026","status":"danger"}}');
    expect(json).toContain('{"component":"Label","props":{"label":"Due Nov 17, 2026","status":"warning"}}');
  });

  it('leads each card with the identifier and type in small text, then the title as its heading', () => {
    const json = JSON.stringify(buildTodoView(items, 'Chloé Martin', undefined, [], { today }));
    expect(json).toContain('{"component":"CardHeader","children":[{"component":"Content","props":{"label":"SC-2 · Safety Case","component":"small"}},{"component":"CardTitle","props":{"label":"A Safety Case title","component":"h2"}}]}');
  });

  it('has no summary when nothing is waiting', () => {
    expect(JSON.stringify(buildTodoView([], 'Ben Okafor'))).not.toContain('At a glance');
  });
});

describe('the search page (design system spec 4.1, Search)', () => {
  const ae = { iri: 'urn:AE-005', identifier: 'AE-005', type: 'urn:AE', typeLabel: 'Adverse Event', title: 'A Adverse Event title', pluralLabel: 'Adverse Events', state: { Seriousness: 'serious' } };
  const result: SearchResult = {
    query: 'serious adverse events PT-09 pneumonia',
    interpretation: {
      types: [{ type: 'urn:AE', label: 'Adverse Event' }],
      states: [{ dimension: 'urn:d', dimensionLabel: 'Seriousness', type: 'urn:AE', value: 'urn:v', label: 'serious' }],
      identifiers: [{ iri: 'urn:PT-09', identifier: 'PT-09' }],
      words: ['pneumonia'],
      mine: false,
    },
    results: [{ object: ae, matched: ['Linked to PT-09', 'Type: Adverse Event', 'Seriousness: serious', 'verbatim term: Fever and cough'] }],
    total: 1,
    understoodBy: { ontology: true },
  };
  const verify: MethodOption = { method: 'urn:verify', label: 'Verify adverse event', available: true, blocks: [], archetype: { archetype: 'urn:a', label: 'Confirm' } };

  it('says how the query was understood, and why each object matched, with its methods', () => {
    const view = buildSearchView(result, { methods: new Map([['urn:AE-005', [verify]]]) });
    expect(validateView(view).errors).toEqual([]);
    const json = JSON.stringify(view);
    expect(json).toContain('1 match for “serious adverse events PT-09 pneumonia”.');
    for (const chip of ['Type: Adverse Event', 'Seriousness: serious', 'Linked to PT-09', 'Words: pneumonia']) expect(json).toContain(`"label":"${chip}","color":"blue"`);
    expect(json).toContain('Matched: Linked to PT-09 · Type: Adverse Event · Seriousness: serious · verbatim term: Fever and cough');
    expect(json).toContain('"label":"Verify adverse event"');
  });

  it("says who understood the query, the model or the ontology, and marks the person's own objects", () => {
    expect(JSON.stringify(buildSearchView(result))).toContain('Understood from the ontology');
    const byModel = JSON.stringify(buildSearchView({ ...result, understoodBy: { model: 'claude-opus-5-5' }, interpretation: { ...result.interpretation, mine: true } }));
    expect(byModel).toContain('Understood by claude-opus-5-5');
    expect(byModel).toContain('"label":"Yours","color":"blue"');
  });

  it('suggests how to search when nothing matches, and says when only the best are shown', () => {
    const none = JSON.stringify(buildSearchView({ ...result, results: [], total: 0 }));
    expect(none).toContain('Nothing matches for');
    expect(none).toContain('Try fewer words');
    expect(JSON.stringify(buildSearchView({ ...result, total: 80 }))).toContain('80 matches for “serious adverse events PT-09 pneumonia”, the best 1 shown.');
    expect(JSON.stringify(buildSearchView({ ...result, interpretation: { ...result.interpretation, types: [] } }))).toContain('"label":"Identifier: PT-09"');
  });
});
