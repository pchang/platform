import { describe, expect, it } from 'vitest';
import { validateView } from '../design-system/validateView';
import type { ToDoItem } from '../data/client';
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

  it('says what is waiting, and what can be done on an urgent object', () => {
    const json = JSON.stringify(buildTodoView(items, 'Chloé Martin, Drug Safety Physician'));
    expect(json).toContain('Waiting for you: Send for review');
    expect(json).toContain('You can: Quarantine batch');
    expect(json).toContain('"label":"Urgent","status":"danger"');
  });
});
