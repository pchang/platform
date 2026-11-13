import { describe, expect, it } from 'vitest';
import type { MethodComposition, RunView } from '../data/client';
import { processProgress } from '../views/composeView';
import { endProcess, loadProcesses, minimizeProcess, openProcess, restoreProcess, saveProcesses, updateProcess, type ProcessState } from './processes';

// Several processes at once (platform spec 5.4; design system spec 4.1 and 5.1).

let n = 0;
const id = () => `p${++n}`;
const start = (object: string, method = 'urn:Triage', label = 'Triage') => ({ object: `urn:${object}`, objectIdentifier: object, method, label, archetype: 'Fill in' });

describe('one process in front, the rest set aside', () => {
  it('opening sets the front one aside; opening one already set aside brings it back instead of starting another', () => {
    let s: ProcessState = { docked: [] };
    s = openProcess(s, start('SC-004'), id);
    const first = s.front!.id;
    s = openProcess(s, start('SUB-1', 'urn:Send', 'Send for review'), id);
    expect(s.front?.objectIdentifier).toBe('SUB-1');
    expect(s.docked.map((p) => p.id)).toEqual([first]);
    s = openProcess(s, start('SC-004'), id);
    expect(s.front?.id).toBe(first);
    expect(s.docked.map((p) => p.objectIdentifier)).toEqual(['SUB-1']);
  });

  it('minimizing, restoring and ending', () => {
    let s = openProcess({ docked: [] }, start('SC-004'), id);
    const a = s.front!.id;
    s = minimizeProcess(s);
    expect(s.front).toBeUndefined();
    s = openProcess(s, start('SC-005'), id);
    s = restoreProcess(s, a);
    expect(s.front?.id).toBe(a);
    expect(s.docked.map((p) => p.objectIdentifier)).toEqual(['SC-005']);
    s = endProcess(s, a);
    expect(s.front).toBeUndefined();
    expect(endProcess(s, s.docked[0].id)).toEqual({ front: undefined, docked: [] });
  });

  it('keeps what was given, but never a typed signature', () => {
    let s = openProcess({ docked: [] }, start('SUB-1', 'urn:Submit', 'Submit'), id);
    s = updateProcess(s, s.front!.id, { values: { approver: 'urn:dev', signatureName: 'Dev Raman' }, progress: { fraction: 1, words: 'Ready to sign' } });
    expect(s.front?.values).toEqual({ approver: 'urn:dev' });
    expect(s.front?.progress.words).toBe('Ready to sign');
  });
});

describe('kept on this device, for each person', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), data };
  };

  it('brings processes back after a reload, in the dock, for the same person only', () => {
    const storage = memory();
    let s = openProcess({ docked: [] }, start('SC-004'), id);
    s = updateProcess(s, s.front!.id, { values: { seriousness: 'urn:serious', signatureName: 'x' } });
    s = openProcess(s, start('SC-005'), id);
    saveProcesses('urn:chloe', s, storage);
    const back = loadProcesses('urn:chloe', storage);
    expect(back.front).toBeUndefined();
    expect(back.docked.map((p) => p.objectIdentifier)).toEqual(['SC-004', 'SC-005']);
    expect(back.docked[0].values).toEqual({ seriousness: 'urn:serious' });
    expect(loadProcesses('urn:dev', storage)).toEqual({ docked: [] });
  });

  it('forgets a person’s processes once all are ended, and survives storage that is broken or unavailable', () => {
    const storage = memory();
    saveProcesses('urn:chloe', openProcess({ docked: [] }, start('SC-004'), id), storage);
    saveProcesses('urn:chloe', { docked: [] }, storage);
    expect(storage.data.size).toBe(0);
    storage.setItem('lsh.processes.urn:chloe', '{not json');
    expect(loadProcesses('urn:chloe', storage)).toEqual({ docked: [] });
    storage.setItem('lsh.processes.urn:chloe', JSON.stringify({ docked: [{ id: 'x' }] }));
    expect(loadProcesses('urn:chloe', storage)).toEqual({ docked: [] });
    expect(loadProcesses('urn:chloe', undefined)).toEqual({ docked: [] });
    expect(() => saveProcesses('urn:chloe', { docked: [] }, { setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('denied'); } })).not.toThrow();
  });
});

describe('progress by archetype (design system spec 5.1)', () => {
  const object = { iri: 'urn:o', identifier: 'X-1', type: 'urn:t', typeLabel: 'Thing', title: 'A Thing title', pluralLabel: 'Things', state: {} };
  const of = (label: string, inputs: MethodComposition['inputs'] = []): MethodComposition => ({ method: 'urn:m', label: 'Do', archetype: { archetype: 'urn:a', label }, object, inputs });
  const two = [{ name: 'a', label: 'A', kind: 'text' as const }, { name: 'b', label: 'B', kind: 'text' as const }];
  const preview = { changes: [], created: [], pending: [], pendingDescriptions: [], background: [] };
  const run = (status: RunView['status'], progress?: number): RunView => ({
    run: 'urn:r', method: 'urn:m', methodLabel: 'Do', object: 'urn:o', objectIdentifier: 'X-1', status, ...(progress !== undefined ? { progress } : {}),
    startedBy: 'urn:p', startedByName: 'P', startedAt: '2026-11-12T10:00:00Z', created: [],
  });

  it.each([
    ['Fill in, nothing given', of('Fill in', two), { status: 'incomplete' }, {}, {}, { fraction: 0, words: '0 of 2 fields' }],
    ['Fill in, one given', of('Fill in', two), { status: 'incomplete' }, { a: 'x' }, {}, { fraction: 1 / 3, words: '1 of 2 fields' }],
    ['Fill in, ready', of('Fill in', two), { status: 'ready', preview }, { a: 'x', b: 'y' }, {}, { fraction: 1, words: 'Ready to commit' }],
    ['Compare and decide, one of one', of('Compare and decide', two.slice(0, 1)), { status: 'checking' }, { a: 'x' }, {}, { fraction: 0.5, words: '1 of 1 field' }],
    ['Confirm, ready', of('Confirm'), { status: 'ready', preview }, {}, {}, { fraction: 1, words: 'Ready to confirm' }],
    ['Review and sign, ready', of('Review and sign', two.slice(0, 1)), { status: 'ready', preview }, { a: 'x' }, {}, { fraction: 1, words: 'Ready to sign' }],
    ['any, refused', of('Fill in', two), { status: 'refused', reasons: ['No'] }, {}, {}, { fraction: 0, words: 'Cannot run', status: 'danger' }],
    ['Start and track, before the start', of('Start and track'), { status: 'ready', preview }, {}, {}, { fraction: 1, words: 'Ready to start' }],
    ['Start and track, running', of('Start and track'), { status: 'ready', preview }, {}, { run: run('running', 0.4) }, { fraction: 0.4, words: 'Running, 40%' }],
    ['Start and track, finished', of('Start and track'), { status: 'ready', preview }, {}, { run: run('succeeded') }, { fraction: 1, words: 'Finished', status: 'success' }],
    ['Start and track, failed', of('Start and track'), { status: 'ready', preview }, {}, { run: run('failed') }, { fraction: 1, words: 'Failed', status: 'danger' }],
    ['Review a draft, drafting', of('Review a draft'), { status: 'incomplete' }, {}, { draft: { status: 'drafting' } }, { fraction: null, words: 'Drafting' }],
    ['Review a draft, editing', of('Review a draft'), { status: 'incomplete' }, {}, { draft: { status: 'ready', draft: {} }, editing: true }, { fraction: 1, words: 'Editing' }],
  ] as const)('%s', (_name, composition, state, values, extra, expected) => {
    expect(processProgress(composition, state as never, values as Record<string, string>, extra as never)).toEqual(expected);
  });
});
