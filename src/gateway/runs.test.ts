// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { disproportionality } from '../ontology/analyses';
import { loadOntology } from '../ontology/files';
import { NS, select } from '../ontology/ontology';
import { Gateway, GatewayError } from './gateway';
import { openGateway, withSeed } from './node';

// Background runs and notifications (platform spec 3.4), with signal detection (domain spec rule 7).
vi.setConfig({ testTimeout: 30_000 });

const ls = (n: string) => `${NS.ls}${n}`;
const chloe = { person: `${NS.d}person-chloe`, role: ls('DrugSafetyPhysician') };
const dev = { person: `${NS.d}person-dev`, role: ls('DrugSafetyPhysician') };
const ada = { person: `${NS.d}person-ada`, role: ls('ComputationalChemist') };

async function rejected(promise: Promise<unknown>): Promise<string[]> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof GatewayError) return error.reasons;
    throw error;
  }
  throw new Error('Expected the gateway to refuse');
}

describe('disproportionality (domain spec rule 7)', () => {
  it('computes the proportional reporting ratio and the chi-squared statistic with Yates correction', () => {
    const { prr, chiSquare } = disproportionality(4, 2, 1, 19);
    expect(prr).toBeCloseTo(13.333, 3);
    expect(chiSquare).toBeCloseTo(7.678, 3);
  });

  it('treats a reaction no other product has as an unbounded ratio', () => {
    expect(disproportionality(3, 0, 0, 20).prr).toBe(Infinity);
  });

  it('never gives a negative corrected statistic', () => {
    expect(disproportionality(1, 1, 1, 1).chiSquare).toBe(0);
  });
});

describe('starting a background run', () => {
  it('is the Start and track archetype, and the preview says what the run will do', async () => {
    const gateway = withSeed();
    expect((await gateway.compose(chloe, 'P-101', ls('RunSignalDetection'))).archetype.label).toBe('Start and track');
    const preview = await gateway.preview(chloe, 'P-101', ls('RunSignalDetection'));
    expect(preview.changes).toEqual([]);
    expect(preview.background).toEqual([expect.stringContaining('disproportionately often for this product')]);
  });

  it('commits the start and returns the run, queued', async () => {
    const gateway = withSeed();
    const result = await gateway.commit(chloe, 'P-101', ls('RunSignalDetection'));
    expect(result.run).toMatchObject({ status: 'queued', methodLabel: 'Run signal detection', objectIdentifier: 'P-101', startedBy: chloe.person, startedByName: 'Chloé Martin', created: [] });
    expect(gateway.commits()).toHaveLength(1);
    await gateway.idle();
  });

  it('refuses a background method no worker can do, and says so before anything else', async () => {
    const gateway = withSeed();
    const reasons = await rejected(gateway.preview(ada, 'C-102', ls('RunSimulation'), { modelType: 'ADMET' }));
    expect(reasons).toEqual([expect.stringContaining('No worker can do this method’s background work yet.')]);
    expect(reasons[0]).toContain('No model is connected yet.');
    expect(await rejected(gateway.commit(ada, 'C-102', ls('RunSimulation'), { modelType: 'ADMET' }))).toEqual(reasons);
    const offered = (await gateway.methods(ada, 'C-102')).find((m) => m.method === ls('RunSimulation'))!;
    expect(offered.available).toBe(false);
    expect(offered.blocks).toEqual(reasons);
    expect(gateway.commits()).toEqual([]);
  });
});

describe('signal detection, as a background run', () => {
  it('finds skin rash on P-101, and not drug-induced liver injury, which already has SIG-1', async () => {
    const gateway = withSeed();
    const { run } = await gateway.commit(chloe, 'P-101', ls('RunSignalDetection'));
    await gateway.idle();
    const ended = gateway.run(chloe, run!.run);
    expect(ended.status).toBe('succeeded');
    expect(ended.endedAt).toBeDefined();
    expect(ended.created).toEqual([{ iri: `${NS.d}Signal-2`, identifier: 'Signal-2' }]);
    expect(ended.message).toBe(
      'Found 1 new signal: Signal-2 for skin rash, in 4 safety cases (PRR 13.3, chi-squared 7.7). Drug-induced liver injury meets the thresholds and already has SIG-1.',
    );

    const signal = gateway.read(chloe, 'Signal-2');
    expect(signal.state).toEqual({ Status: 'detected' });
    expect(signal.properties.reaction).toBe('skin rash');
    expect(signal.links.find((l) => l.label === 'concerns')?.objects.map((o) => o.identifier)).toEqual(['P-101']);
    expect(signal.links.find((l) => l.label === 'aggregates')?.objects.map((o) => o.identifier)).toEqual(['SC-002', 'SC-004', 'SC-005', 'SC-006']);
  });

  it('commits the result as the background worker, on behalf of the person who started it', async () => {
    const gateway = withSeed();
    await gateway.commit(chloe, 'P-101', ls('RunSignalDetection'));
    await gateway.idle();
    const commits = gateway.commits();
    expect(commits.map((c) => c.person)).toEqual([chloe.person, `${NS.p}BackgroundWorker`]);
    const onBehalf = select((gateway as unknown as { graph: { store: Parameters<typeof select>[0] } }).graph.store,
      `SELECT ?who WHERE { GRAPH <${commits[1].commit}> { <${commits[1].commit}> p:onBehalfOf ?who } }`);
    expect(onBehalf.map((r) => r.who)).toEqual([chloe.person]);
  });

  it('does not detect the same signal twice', async () => {
    const gateway = withSeed();
    await gateway.commit(chloe, 'P-101', ls('RunSignalDetection'));
    await gateway.idle();
    const { run } = await gateway.commit(chloe, 'P-101', ls('RunSignalDetection'));
    await gateway.idle();
    const second = gateway.run(chloe, run!.run);
    expect(second.created).toEqual([]);
    expect(second.message).toMatch(/^No new signals\. /);
    expect(second.message).toContain('Skin rash meets the thresholds and already has Signal-2.');
    expect(gateway.commits()).toHaveLength(3);
  });

  it('leaves out cases flagged as duplicates', async () => {
    const gateway = withSeed();
    await gateway.commit(chloe, 'SC-005', ls('FlagDuplicate'), { candidateCase: 'SC-002' });
    await gateway.commit(chloe, 'P-101', ls('RunSignalDetection'));
    await gateway.idle();
    const [latest] = gateway.runs(chloe);
    expect(latest.message).toContain('Signal-2 for skin rash, in 3 safety cases (PRR 12.0, chi-squared 5.4)');
    const aggregated = gateway.read(chloe, 'Signal-2').links.find((l) => l.label === 'aggregates')?.objects.map((o) => o.identifier);
    expect(aggregated).toEqual(['SC-002', 'SC-004', 'SC-006']);
  });

  it('finds nothing on the comparator product', async () => {
    const gateway = withSeed();
    const { run } = await gateway.commit(chloe, 'P-102', ls('RunSignalDetection'));
    await gateway.idle();
    expect(gateway.run(chloe, run!.run)).toMatchObject({ status: 'succeeded', message: 'No new signals.', created: [] });
  });

  it('fails, with the reason, when there is nothing to compare with', async () => {
    // A graph with one product only: no background to compare its cases with.
    const lonely = new Gateway(loadOntology([`@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> . @prefix p: <${NS.p}> . @prefix ls: <${NS.ls}> . @prefix lst: <${NS.lst}> . @prefix d: <${NS.d}> .
      d:person-chloe a p:Person ; rdfs:label "Chloé Martin" ; p:actsAs ls:DrugSafetyPhysician .
      d:P-1 a ls:Product ; ls:identifier "P-1" ; ls:productStatus lst:ProductStatus-investigational .
      d:SC-1 a ls:SafetyCase ; ls:identifier "SC-1" ; ls:concerns d:P-1 ; ls:reaction lst:Reaction-skinRash .`]));
    const { run } = await lonely.commit(chloe, 'P-1', ls('RunSignalDetection'));
    await lonely.idle();
    expect(lonely.run(chloe, run!.run)).toMatchObject({ status: 'failed', message: 'No other product has safety cases to compare with.', created: [] });
    expect(lonely.notifications(chloe)[0]).toMatchObject({ title: 'Run signal detection failed', status: 'failed', message: 'No other product has safety cases to compare with.' });
    expect(lonely.commits()).toHaveLength(1);
  });
});

describe('tracking runs', () => {
  it('lists runs newest first, by object and by whether they have ended', async () => {
    const gateway = withSeed();
    await gateway.commit(chloe, 'P-102', ls('RunSignalDetection'));
    await gateway.idle();
    const pending = gateway.commit(chloe, 'P-101', ls('RunSignalDetection'));
    const started = await pending;
    expect(gateway.runs(chloe, { active: true }).map((r) => r.run)).toEqual([started.run!.run]);
    expect(gateway.runs(dev, { object: 'P-101' }).map((r) => r.objectIdentifier)).toEqual(['P-101']);
    await gateway.idle();
    expect(gateway.runs(chloe, { active: true })).toEqual([]);
    expect(gateway.runs(chloe).map((r) => r.objectIdentifier)).toEqual(['P-101', 'P-102']);
  });

  it('reports progress while a run is running, and not once it ends', async () => {
    const gateway = withSeed();
    const { run } = await gateway.commit(chloe, 'P-101', ls('RunSignalDetection'));
    const seen = new Set<string>();
    while (gateway.run(chloe, run!.run).status !== 'succeeded') {
      const now = gateway.run(chloe, run!.run);
      seen.add(now.status);
      if (now.status === 'running') expect(now.progress).toBeGreaterThanOrEqual(0);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(seen).toContain('running');
    expect(gateway.run(chloe, run!.run).progress).toBeUndefined();
  });

  it('hides runs from a role that may not read their object', async () => {
    const gateway = withSeed();
    await gateway.commit(chloe, 'P-101', ls('RunSignalDetection'));
    await gateway.idle();
    const hidden = select((gateway as unknown as { graph: { store: Parameters<typeof select>[0] } }).graph.store,
      `SELECT ?role WHERE { ?role p:mayNotRead ls:Product }`).map((r) => r.role);
    for (const role of hidden) {
      const person = select((gateway as unknown as { graph: { store: Parameters<typeof select>[0] } }).graph.store, `SELECT ?p WHERE { ?p p:actsAs <${role}> }`)[0]?.p;
      if (person) expect(gateway.runs({ person, role })).toEqual([]);
    }
  });
});

describe('notifications', () => {
  it('tell the person who started the run how it ended, and nobody else', async () => {
    const gateway = withSeed();
    await gateway.commit(chloe, 'P-101', ls('RunSignalDetection'));
    await gateway.idle();
    const [notice] = gateway.notifications(chloe);
    expect(notice).toMatchObject({ title: 'Run signal detection finished', status: 'succeeded', objectIdentifier: 'P-101', read: false });
    expect(notice.message).toContain('Signal-2 for skin rash');
    expect(gateway.notifications(dev)).toEqual([]);
  });

  it('are marked read by their recipient, one or all', async () => {
    const gateway = withSeed();
    await gateway.commit(chloe, 'P-101', ls('RunSignalDetection'));
    await gateway.commit(chloe, 'P-102', ls('RunSignalDetection'));
    await gateway.idle();
    const [newest, older] = gateway.notifications(chloe);
    expect(newest.objectIdentifier).toBe('P-102');
    expect(() => gateway.markRead(dev, [newest.notification])).toThrow(GatewayError);
    expect(gateway.markRead(chloe, [older.notification])).toBe(1);
    expect(gateway.notifications(chloe).map((n) => n.read)).toEqual([false, true]);
    expect(gateway.markRead(chloe)).toBe(1);
    expect(gateway.markRead(chloe)).toBe(0);
  });
});

describe('background runs in the journal', () => {
  let dir: string | undefined;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));
  const journal = () => join((dir ??= mkdtempSync(join(tmpdir(), 'lsh-runs-'))), 'journal.jsonl');

  it('replays the run, its result and its notification, read or not, after a restart', async () => {
    const path = journal();
    const gateway = openGateway(path);
    await gateway.commit(chloe, 'P-101', ls('RunSignalDetection'));
    await gateway.idle();
    gateway.markRead(chloe);
    const kinds = readFileSync(path, 'utf8').trim().split('\n').map((l) => JSON.parse(l).kind);
    expect(kinds).toEqual(['genesis', 'commit', 'run', 'commit', 'notification']);

    const restarted = openGateway(path);
    await restarted.idle();
    expect(restarted.runs(chloe)).toEqual(gateway.runs(chloe));
    expect(restarted.notifications(chloe)).toEqual(gateway.notifications(chloe));
    expect(restarted.read(chloe, 'Signal-2').state.Status).toBe('detected');
    // Counters continue from the journal, so the next run and notification get new names.
    const next = await restarted.commit(chloe, 'P-102', ls('RunSignalDetection'));
    expect(next.run!.run).toBe(`${NS.d}run/2`);
    await restarted.idle();
    expect(restarted.notifications(chloe).map((n) => n.notification)).toEqual([`${NS.d}notification/2`, `${NS.d}notification/1`]);
  });

  it('starts again a run that had not ended when the gateway stopped, and applies its result once', async () => {
    const path = journal();
    const gateway = openGateway(path);
    await gateway.commit(chloe, 'P-101', ls('RunSignalDetection'));
    await gateway.idle();
    // Cut the journal back to the moment the run had started but not ended: genesis, the start commit, and running.
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    writeFileSync(path, `${lines.slice(0, 3).join('\n')}\n`);

    const restarted = openGateway(path);
    expect(restarted.runs(chloe)[0].status).toBe('running');
    await restarted.idle();
    const [run] = restarted.runs(chloe);
    expect(run.status).toBe('succeeded');
    expect(run.created.map((c) => c.identifier)).toEqual(['Signal-2']);
    expect(restarted.find(chloe, ls('Signal')).map((s) => s.identifier)).toEqual(['SIG-1', 'Signal-2']);

    // A further restart replays the ended run; nothing runs again.
    const again = openGateway(path);
    await again.idle();
    expect(again.find(chloe, ls('Signal'))).toHaveLength(2);
    expect(again.commits()).toHaveLength(2);
  });
});

describe('reading coded values', () => {
  it('shows a case’s reactions by label, all of them', () => {
    expect(withSeed().read(chloe, 'SC-004').properties.reaction).toBe('drug-induced liver injury, skin rash');
  });
});

describe('a reaction value outside the scheme', () => {
  it('breaks the shape, so the seed only uses coded reactions', async () => {
    const graph = loadOntology([readFileSync(new URL('../../data/life-sciences/seed.ttl', import.meta.url), 'utf8'),
      `@prefix ls: <${NS.ls}> . @prefix d: <${NS.d}> . d:SC-001 ls:reaction <urn:not-a-reaction> .`]);
    const { validateData } = await import('../ontology/methods');
    expect((await validateData(graph)).length).toBeGreaterThan(0);
  });
});
