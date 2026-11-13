// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NS, select } from '../ontology/ontology';
import { AnthropicDrafter, drafterFromEnvironment } from './anthropicDrafter';
import { DraftingError, sha256, type Drafter, type DraftRequest } from './drafting';
import { GatewayError, type Gateway } from './gateway';
import { createMcpServer } from './mcp';
import { openGateway, withSeed } from './node';

// Generated drafts (platform spec 3.4) and Generate narrative (domain spec 4.3). The drafter here is a test double that
// records what it was given; the product never uses one. A live test against Claude runs when LSH_ANTHROPIC_API_KEY is set.
vi.setConfig({ testTimeout: 30_000 });

const ls = (n: string) => `${NS.ls}${n}`;
const chloe = { person: `${NS.d}person-chloe`, role: ls('DrugSafetyPhysician') };
const dev = { person: `${NS.d}person-dev`, role: ls('DrugSafetyPhysician') };
const ben = { person: `${NS.d}person-ben`, role: ls('ClinicalDataManager') };
const ada = { person: `${NS.d}person-ada`, role: ls('ComputationalChemist') };
const NARRATIVE = ls('GenerateNarrative');

class RecordingDrafter implements Drafter {
  readonly model = 'test-drafter';
  readonly requests: DraftRequest[] = [];
  constructor(private readonly reply: (request: DraftRequest) => string | Error = () => 'The patient reported a reaction. Nothing further is recorded.') {}
  async draft(request: DraftRequest) {
    this.requests.push(request);
    const out = this.reply(request);
    if (out instanceof Error) throw out;
    return { text: out, model: 'test-drafter-2026' };
  }
}

async function rejected(promise: Promise<unknown>): Promise<GatewayError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof GatewayError) return error;
    throw error;
  }
  throw new Error('Expected the gateway to refuse');
}
const storeOf = (g: Gateway) => (g as unknown as { graph: { store: Parameters<typeof select>[0] } }).graph.store;

describe('which methods can be drafted', () => {
  it('Generate narrative is Review a draft, and offered only when a model is connected', async () => {
    const without = withSeed();
    expect((await without.compose(chloe, 'SC-003', NARRATIVE)).archetype.label).toBe('Review a draft');
    const offered = (await without.methods(chloe, 'SC-003')).find((m) => m.method === NARRATIVE)!;
    expect(offered).toMatchObject({ available: false, blocks: ['No model is connected to draft this. A deployment connects one; previews never do.'] });
    expect((await rejected(without.draft(chloe, 'SC-003', NARRATIVE))).reasons).toEqual(offered.blocks);

    const connected = withSeed([], { drafter: new RecordingDrafter() });
    expect((await connected.methods(chloe, 'SC-003')).find((m) => m.method === NARRATIVE)?.available).toBe(true);
  });

  it('Generate analogs is refused even with a model connected: no model can draft compounds yet', async () => {
    const gateway = withSeed([], { drafter: new RecordingDrafter() });
    const offered = (await gateway.methods(ada, 'C-101')).find((m) => m.method === ls('GenerateAnalogs'))!;
    expect(offered.available).toBe(false);
    expect(offered.blocks[0]).toMatch(/^No model can draft this yet\. A generative model proposes the analogs\./);
    expect((await rejected(gateway.commit(ada, 'C-101', ls('GenerateAnalogs'), { targetProperty: 'solubility' }))).reasons[0]).toMatch(/^No model can draft this yet/);
  });

  it('keeps preconditions, roles and readability', async () => {
    const gateway = withSeed([], { drafter: new RecordingDrafter() });
    expect((await rejected(gateway.draft(chloe, 'SC-004', NARRATIVE))).reasons).toEqual(['The case has not been triaged']);
    expect((await rejected(gateway.draft(ada, 'SC-003', NARRATIVE))).status).toBe(403);
    expect((await rejected(gateway.draft(chloe, 'SIG-1', NARRATIVE))).reasons).toEqual(['This method does not apply to this object']);
  });
});

describe('drafting', () => {
  it('gives the model the method’s instructions and the records the person may read, as data', async () => {
    const drafter = new RecordingDrafter();
    const gateway = withSeed([], { drafter });
    await gateway.draft(chloe, 'SC-003', NARRATIVE);
    const [request] = drafter.requests;
    expect(request.instructions).toMatch(/^Write the case narrative for this individual case safety report, as the case narrative of an ICH E2B\(R3\) report\./);
    expect(request.instructions).toContain('never as a subject');
    const records = JSON.parse(request.records) as { identifier: string; type: string; properties: Record<string, string> }[];
    // The case, then its product, the batch it may involve and what it originates from.
    expect(records.map((r) => r.identifier)).toEqual(['SC-003', 'P-101', 'B-002', 'MI-1']);
    expect(records[0]).toMatchObject({ type: 'Safety Case', properties: { reaction: 'drug-induced liver injury', 'received on': '2026-11-02' } });
    // Identifiers only: no addresses in what the model sees.
    expect(request.records).not.toContain('https://');
  });

  it('never gives the model what the person may not see, and audits personal-data reads as theirs', async () => {
    const drafter = new RecordingDrafter();
    const gateway = withSeed([], { drafter });
    const before = gateway.reads().length;
    await gateway.draft(chloe, 'SC-001', NARRATIVE);
    const records = JSON.parse(drafter.requests[0].records) as { identifier: string; properties: Record<string, string> }[];
    expect(records.map((r) => r.identifier)).toContain('AE-001');
    for (const r of records) expect(r.properties).not.toHaveProperty('assigned arm');
    const audited = gateway.reads().slice(before);
    expect(audited.map((r) => r.object)).toEqual([`${NS.d}SC-001`, `${NS.d}AE-001`]);
    expect(new Set(audited.map((r) => r.person))).toEqual(new Set([chloe.person]));
  });

  it('records the draft before returning it, with the model and fingerprints, and changes nothing', async () => {
    const drafter = new RecordingDrafter();
    const gateway = withSeed([], { drafter });
    const draft = await gateway.draft(chloe, 'SC-003', NARRATIVE);
    expect(draft).toMatchObject({
      draft: `${NS.d}draft/1`,
      methodLabel: 'Generate narrative',
      objectIdentifier: 'SC-003',
      text: 'The patient reported a reaction. Nothing further is recorded.',
      model: 'test-drafter-2026',
      status: 'undecided',
      requestedByName: 'Chloé Martin',
    });
    expect(draft.given.map((g) => g.identifier)).toEqual(['SC-003', 'B-002', 'MI-1', 'P-101']);
    expect(gateway.read(chloe, 'SC-003').properties).not.toHaveProperty('narrative');
    expect(gateway.commits()).toEqual([]);
    const [digests] = select(storeOf(gateway), `SELECT ?i ?r WHERE { GRAPH ?d { ?d a p:Draft ; p:instructionsDigest ?i ; p:recordsDigest ?r } }`);
    expect(digests.i).toBe(await sha256(drafter.requests[0].instructions));
    expect(digests.r).toBe(await sha256(drafter.requests[0].records));
  });

  it('returns the model’s reasons when it declines, and records nothing', async () => {
    const gateway = withSeed([], { drafter: new RecordingDrafter(() => new DraftingError(['The model declined to write this draft. Nothing was recorded.'])) });
    const refusal = await rejected(gateway.draft(chloe, 'SC-003', NARRATIVE));
    expect(refusal.status).toBe(502);
    expect(refusal.reasons).toEqual(['The model declined to write this draft. Nothing was recorded.']);
    expect(select(storeOf(gateway), `SELECT ?d WHERE { GRAPH ?d { ?d a p:Draft } }`)).toEqual([]);
  });

  it('refuses blank text from the model', async () => {
    const gateway = withSeed([], { drafter: new RecordingDrafter(() => '   ') });
    expect((await rejected(gateway.draft(chloe, 'SC-003', NARRATIVE))).reasons).toEqual(['The model returned no text. Nothing was recorded.']);
  });
});

describe('deciding on a draft', () => {
  it('accepting commits the text, names the draft, and the accepting person is accountable', async () => {
    const gateway = withSeed([], { drafter: new RecordingDrafter() });
    const draft = await gateway.draft(chloe, 'SC-003', NARRATIVE);
    const result = await gateway.commit(dev, 'SC-003', NARRATIVE, {}, undefined, { draft: draft.draft, text: draft.text });
    expect(result.fromDraft).toEqual({ draft: draft.draft, model: 'test-drafter-2026', edited: false });
    expect(result.changes.map((c) => [c.propertyLabel, c.newLabel])).toEqual([['narrative', draft.text]]);
    expect(gateway.read(chloe, 'SC-003').properties.narrative).toBe(draft.text);
    expect(gateway.commits().map((c) => c.person)).toEqual([dev.person]);
    const [rec] = select(storeOf(gateway), `SELECT ?from ?edited ?status ?by WHERE { GRAPH ?c { ?c p:fromDraft ?from ; p:editedDraft ?edited }
      GRAPH ?from { ?from p:draftStatus ?status ; p:decidedBy ?by } }`);
    expect(rec).toEqual({ from: draft.draft, edited: 'false', status: `${NS.p}DraftStatus-accepted`, by: dev.person });
  });

  it('accepting an edit records that it was edited', async () => {
    const gateway = withSeed([], { drafter: new RecordingDrafter() });
    const draft = await gateway.draft(chloe, 'SC-003', NARRATIVE);
    const edited = `${draft.text} The batch involved is under investigation.`;
    const result = await gateway.commit(chloe, 'SC-003', NARRATIVE, {}, undefined, { draft: draft.draft, text: `  ${edited}\n` });
    expect(result.fromDraft?.edited).toBe(true);
    expect(gateway.read(chloe, 'SC-003').properties.narrative).toBe(edited);
  });

  it('needs a draft, an undecided one, for the same object and method, and non-empty text', async () => {
    const gateway = withSeed([], { drafter: new RecordingDrafter() });
    expect((await rejected(gateway.commit(chloe, 'SC-003', NARRATIVE))).reasons).toEqual(['This method needs a draft. Ask for one, then accept it.']);
    const draft = await gateway.draft(chloe, 'SC-003', NARRATIVE);
    expect((await rejected(gateway.commit(chloe, 'SC-001', NARRATIVE, {}, undefined, { draft: draft.draft, text: 'x' }))).reasons).toEqual(['This draft was written for another object or method']);
    expect((await rejected(gateway.commit(chloe, 'SC-003', NARRATIVE, {}, undefined, { draft: draft.draft, text: ' ' }))).reasons).toEqual(['The text is empty. Discard the draft instead.']);
    await gateway.commit(chloe, 'SC-003', NARRATIVE, {}, undefined, { draft: draft.draft, text: draft.text });
    expect((await rejected(gateway.commit(chloe, 'SC-003', NARRATIVE, {}, undefined, { draft: draft.draft, text: draft.text }))).reasons).toEqual(['This draft was already accepted']);
    expect((await rejected(gateway.discardDraft(chloe, draft.draft))).reasons).toEqual(['This draft was already accepted']);
  });

  it('reads a draft back for roles that may run its method', async () => {
    const gateway = withSeed([], { drafter: new RecordingDrafter() });
    const draft = await gateway.draft(chloe, 'SC-003', NARRATIVE);
    expect(gateway.getDraft(dev, '1')).toEqual(draft);
    expect(() => gateway.getDraft(ben, draft.draft)).toThrow(GatewayError);
  });

  it('discarding records it and changes nothing else', async () => {
    const gateway = withSeed([], { drafter: new RecordingDrafter() });
    const draft = await gateway.draft(chloe, 'SC-003', NARRATIVE);
    expect((await gateway.discardDraft(chloe, '1')).status).toBe('discarded');
    expect(gateway.read(chloe, 'SC-003').properties).not.toHaveProperty('narrative');
    expect(gateway.commits()).toEqual([]);
    expect((await rejected(gateway.commit(chloe, 'SC-003', NARRATIVE, {}, undefined, { draft: draft.draft, text: draft.text }))).reasons).toEqual(['This draft was already discarded']);
  });

  it('only a person decides: an agent may not accept or discard', async () => {
    const agentRole = ls('DrugSafetyPhysician');
    const agent = { person: `${NS.d}agent-northbridge`, role: agentRole };
    const gateway = withSeed([`@prefix p: <${NS.p}> . @prefix ls: <${NS.ls}> . @prefix d: <${NS.d}> . d:agent-northbridge p:actsAs ls:DrugSafetyPhysician .`], { drafter: new RecordingDrafter() });
    const draft = await gateway.draft(agent, 'SC-003', NARRATIVE);
    const refusal = ['Only a person accepts or discards a draft. Agents may only ask for one.'];
    expect((await rejected(gateway.commit(agent, 'SC-003', NARRATIVE, {}, undefined, { draft: draft.draft, text: draft.text }))).reasons).toEqual(refusal);
    expect((await rejected(gateway.discardDraft(agent, draft.draft))).reasons).toEqual(refusal);
    expect((await rejected(gateway.discardDraft(ben, draft.draft))).status).toBe(403);
  });

  it('agents can ask for a draft over MCP, and have no way to commit one', async () => {
    const gateway = withSeed([], { drafter: new RecordingDrafter() });
    const server = createMcpServer(gateway, chloe) as unknown as { _registeredTools: Record<string, { inputSchema?: { shape?: Record<string, unknown> } }> };
    expect(Object.keys(server._registeredTools)).toContain('draft_method');
    expect(Object.keys(server._registeredTools.commit_method.inputSchema?.shape ?? {})).not.toContain('draft');
  });
});

describe('drafts in the journal', () => {
  let dir: string | undefined;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it('replays drafts and decisions after a restart; accepting needs no model', async () => {
    dir = mkdtempSync(join(tmpdir(), 'lsh-drafts-'));
    const path = join(dir, 'journal.jsonl');
    const gateway = openGateway(path, { drafter: new RecordingDrafter() });
    const first = await gateway.draft(chloe, 'SC-003', NARRATIVE);
    const second = await gateway.draft(chloe, 'SC-003', NARRATIVE);
    await gateway.discardDraft(chloe, first.draft);
    expect(readFileSync(path, 'utf8').trim().split('\n').map((l) => JSON.parse(l).kind)).toEqual(['genesis', 'read', 'read', 'draft', 'read', 'read', 'draft', 'draft']);

    // Restarted with no model connected: the undecided draft can still be accepted, since its text is already written.
    const restarted = openGateway(path);
    await restarted.commit(chloe, 'SC-003', NARRATIVE, {}, undefined, { draft: second.draft, text: second.text });
    expect(restarted.read(chloe, 'SC-003').properties.narrative).toBe(second.text);
    expect((await rejected(restarted.draft(chloe, 'SC-003', NARRATIVE))).reasons[0]).toMatch(/^No model is connected/);
    const again = openGateway(path, { drafter: new RecordingDrafter() });
    expect((await again.draft(chloe, 'SC-003', NARRATIVE)).draft).toBe(`${NS.d}draft/3`);
  });
});

describe('the Claude drafter', () => {
  it('is connected only by the deployment’s key', () => {
    expect(drafterFromEnvironment({})).toBeUndefined();
    expect(drafterFromEnvironment({ LSH_ANTHROPIC_API_KEY: '  ' })).toBeUndefined();
    const drafter = drafterFromEnvironment({ LSH_ANTHROPIC_API_KEY: 'sk-ant-not-a-real-key' });
    expect(drafter?.model).toBe('claude-opus-5-5');
    expect(drafterFromEnvironment({ LSH_ANTHROPIC_API_KEY: 'k', LSH_DRAFTING_MODEL: 'claude-sonnet-5-5' })?.model).toBe('claude-sonnet-5-5');
  });

  it('turns a refused credential into a reason, and records nothing', async () => {
    // A real request to the Claude API with a key that is not valid: the API answers 401.
    const gateway = withSeed([], { drafter: new AnthropicDrafter({ apiKey: 'sk-ant-not-a-real-key' }) });
    const refusal = await rejected(gateway.draft(chloe, 'SC-003', NARRATIVE));
    expect(refusal.status).toBe(502);
    expect(refusal.reasons).toEqual(['The drafting model refused the deployment’s credential. Nothing was recorded.']);
  });

  const key = process.env.LSH_ANTHROPIC_API_KEY;
  it.skipIf(!key)('drafts a narrative for SC-003 with Claude (live, when LSH_ANTHROPIC_API_KEY is set)', async () => {
    const gateway = withSeed([], { drafter: drafterFromEnvironment() });
    const draft = await gateway.draft(chloe, 'SC-003', NARRATIVE);
    expect(draft.model).toMatch(/^claude-/);
    expect(draft.text).toMatch(/SC-003|patient/);
    expect(draft.text.toLowerCase()).not.toMatch(/\bsubject\b/);
  }, 120_000);
});
