import { describe, expect, it } from 'vitest';
import { validateView } from '../design-system/validateView';
import type { MethodOption, RunView, ToDoItem } from '../data/client';
import { buildTodoView, buildTypeView, loadingView } from './orientViews';

const object = { iri: 'urn:x', identifier: 'SUB-1', type: 'urn:t', typeLabel: 'Submission', state: { Status: 'draft', Deadline: 'on track' } };
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
    const draft = [{ ...items[0], tasks: [{ method: 'urn:s', label: 'Generate narrative', archetype: { archetype: 'urn:a', label: 'Review a draft' } }] }];
    const json = JSON.stringify(buildTodoView(draft, 'Dev Raman, Drug Safety Physician'));
    expect(json).toContain('Generate narrative (Review a draft, coming soon)');
    expect(json).not.toContain('"component":"Button"');
  });

  it('says what is waiting, and what can be done on an urgent object', () => {
    const json = JSON.stringify(buildTodoView(items, 'Chloé Martin, Drug Safety Physician'));
    expect(json).toContain('"label":"Waiting for you:"');
    expect(json).toContain('{"component":"Button","props":{"label":"Send for review","variant":"primary","size":"sm"},"action":{"method":"urn:m","target":"urn:x"}}');
    expect(json).toContain('"label":"You can:"');
    expect(json).toContain('"label":"Quarantine batch","variant":"secondary"');
    expect(json).toContain('"label":"Urgent","status":"danger"');
  });

  const product = { iri: 'urn:p', identifier: 'P-101', type: 'urn:Product', typeLabel: 'Product', state: { Status: 'investigational' } };
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
