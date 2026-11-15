// @vitest-environment node
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { NS } from '../ontology/ontology';
import { AnthropicAskModel, askModelFromEnvironment } from './anthropicAsk';
import { ANSWER_TOOL, type AskModel, type AskRequest, type AskToolOutput, type ModelAnswer } from './ask';
import { createGatewayServer } from './http';
import { withSeed } from './node';

// Asking a question (platform spec 5.2): a connected model answers through read-only gateway tools, as the principal.
vi.setConfig({ testTimeout: 30_000 });

const as = (person: string, role: string) => ({ person: `${NS.d}${person}`, role: `${NS.ls}${role}` });
const ben = as('person-ben', 'ClinicalDataManager');
const chloe = as('person-chloe', 'DrugSafetyPhysician');
const ada = as('person-ada', 'ComputationalChemist');

type Run = (name: string, input: unknown) => Promise<AskToolOutput & { json: Record<string, unknown> }>;

/** A model that follows a script: it calls the tools the script calls, then answers. Records what it was given. */
class ScriptedModel implements AskModel {
  readonly model = 'scripted-model';
  request?: AskRequest;
  constructor(private readonly script: (run: Run) => Promise<Omit<ModelAnswer, 'model'>>) {}
  async answer(request: AskRequest): Promise<ModelAnswer> {
    this.request = request;
    const run: Run = async (name, input) => {
      const output = await request.toolbox.run(name, input);
      return { ...output, json: output.isError ? {} : JSON.parse(output.content) };
    };
    return { ...(await this.script(run)), model: this.model };
  }
}

const find = (input: Partial<{ types: string[]; states: string[]; linked_to: string[]; words: string[]; mine: boolean }>) => ({
  types: [],
  states: [],
  linked_to: [],
  words: [],
  mine: false,
  ...input,
});

describe('Ask without a connected model', () => {
  it('searches the question and says why', async () => {
    const result = await withSeed().ask(ben, 'serious adverse events');
    expect(result.answer).toBeUndefined();
    expect(result.searched).toBe('No model is connected to answer questions, so the question was searched.');
    expect(result.search?.results.map((r) => r.object.identifier)).toEqual(['AE-003', 'AE-005']);
  });

  it('searches when the model fails, and says so', async () => {
    const failing: AskModel = { model: 'm', answer: () => Promise.reject(new Error('down')) };
    const result = await withSeed([], { askModel: failing }).ask(ben, 'serious adverse events');
    expect(result).toMatchObject({ searched: 'The model could not answer, so the question was searched.' });
    expect(result.search?.total).toBe(2);
  });
});

describe('Ask with a connected model', () => {
  it('gives the model who is asking, today and the vocabulary they may read, never a record, and read-only tools', async () => {
    const model = new ScriptedModel(async () => ({ status: 'answered', text: 'Nothing to say.', cited: [] }));
    await withSeed([], { askModel: model, now: () => new Date('2026-11-15T09:00:00Z') }).ask(ben, 'what is open?');
    const { context, toolbox, question, maxSteps } = model.request!;
    expect(question).toBe('what is open?');
    expect(maxSteps).toBe(12);
    expect(context).toContain('The person asking: Ben Okafor, acting as Clinical Data Manager.');
    expect(context).toContain('Today: 2026-11-15.');
    expect(context).toMatch(/- Adverse Event \(plural Adverse Events\), in Clinical Development\. States: Entry \(entered, verified\);/);
    expect(context).toContain('experienced by one Patient');
    // Vocabulary only: no record's values, and an unreadable property is not even named.
    expect(context).not.toContain('Jaundice');
    expect(context).not.toContain('assigned arm');
    expect(toolbox.tools.map((t) => t.name)).toEqual(['find_objects', 'read_object', 'count_objects', 'methods_for', ANSWER_TOOL.name]);
  });

  it('answers from what the model read, and keeps only citations of objects it read in this question', async () => {
    const model = new ScriptedModel(async (run) => {
      const found = await run('find_objects', find({ types: ['Adverse Event'], states: ['serious'] }));
      expect(found.json).toMatchObject({ total: 2, objects: [{ identifier: 'AE-003', type: 'Adverse Event', state: { Seriousness: 'serious' } }, { identifier: 'AE-005' }] });
      const read = await run('read_object', { identifier: 'ae-003' });
      expect(read.json).toMatchObject({ identifier: 'AE-003', properties: { 'verbatim term': 'Jaundice and raised liver enzymes; admitted to hospital' } });
      expect(read.json.links).toEqual(expect.arrayContaining([{ link: 'experienced by', objects: [expect.objectContaining({ identifier: 'PT-03' })] }]));
      // SC-001 was never met, and XX-9 does not exist: neither may be cited.
      return { status: 'answered', text: 'Two serious events: AE-003 and AE-005. AE-003 is not yet reported.', cited: ['AE-003', 'ae-005', 'PT-03', 'SC-001', 'XX-9'] };
    });
    const result = await withSeed([], { askModel: model }).ask(ben, 'which serious events are not reported?');
    expect(result.search).toBeUndefined();
    expect(result.answer).toMatchObject({ status: 'answered', model: 'scripted-model', lookedAt: 3, text: 'Two serious events: AE-003 and AE-005. AE-003 is not yet reported.' });
    expect(result.answer!.cited.map((c) => c.identifier)).toEqual(['AE-003', 'AE-005', 'PT-03']);
  });

  it('counts objects, filtered by state and grouped by a state dimension or a link', async () => {
    const model = new ScriptedModel(async (run) => {
      expect((await run('count_objects', { type: 'Adverse Events', states: [], group_by: '' })).json).toEqual({ type: 'Adverse Event', total: 5 });
      expect((await run('count_objects', { type: 'Adverse Event', states: ['serious'], group_by: '' })).json).toEqual({ type: 'Adverse Event', total: 2 });
      expect((await run('count_objects', { type: 'Adverse Event', states: [], group_by: 'seriousness' })).json).toEqual({
        type: 'Adverse Event',
        total: 5,
        groupedBy: 'Seriousness',
        groups: [{ value: 'non-serious', count: 3 }, { value: 'serious', count: 2 }],
      });
      const bySite = (await run('count_objects', { type: 'Patient', states: [], group_by: 'enrolled at' })).json as { groups: { value: string; count: number }[] };
      expect(bySite.groups.map((g) => g.value).sort()).toEqual(['SITE-1', 'SITE-2', 'SITE-3']);
      expect((await run('count_objects', { type: 'Patient', states: [], group_by: 'colour' })).isError).toBe(true);
      expect((await run('count_objects', { type: 'Widget', states: [], group_by: '' })).content).toContain('There is no type you may read called "Widget"');
      return { status: 'answered', text: 'Most patients are at SITE-1.', cited: ['SITE-1'] };
    });
    const result = await withSeed([], { askModel: model }).ask(ben, 'which site has the most patients?');
    // A linked object met in a count may be cited.
    expect(result.answer!.cited.map((c) => c.identifier)).toEqual(['SITE-1']);
  });

  it('explains why a method is blocked, and changes nothing', async () => {
    const gateway = withSeed([], {
      askModel: new ScriptedModel(async (run) => {
        const methods = (await run('methods_for', { identifier: 'PT-03' })).json as { methods: { method: string; available: boolean; blockedBecause?: string[] }[] };
        const unblind = methods.methods.find((m) => m.method === 'Unblind patient');
        expect(unblind).toMatchObject({ available: false });
        expect(unblind!.blockedBecause!.join(' ')).toContain('Rule 2');
        return { status: 'answered', text: 'Rule 2 blocks it until the case is triaged as serious and unexpected.', cited: ['PT-03'] };
      }),
    });
    const before = gateway.commits().length;
    const result = await gateway.ask(chloe, "why can't I unblind PT-03?");
    expect(result.answer!.cited.map((c) => c.identifier)).toEqual(['PT-03']);
    expect(gateway.commits()).toHaveLength(before);
  });

  it('runs every tool as the principal: unreadable types are unknown, and their objects cannot be read or cited', async () => {
    const model = new ScriptedModel(async (run) => {
      const found = await run('find_objects', find({ types: ['Adverse Event', 'Quality Event'] }));
      expect(found.json.notUnderstood).toEqual(['Adverse Event']);
      expect((found.json.objects as { type: string }[]).every((o) => o.type === 'Quality Event')).toBe(true);
      const refused = await run('read_object', { identifier: 'AE-003' });
      expect(refused).toMatchObject({ isError: true });
      expect((await run('methods_for', { identifier: 'AE-003' })).isError).toBe(true);
      return { status: 'cannot answer', text: 'You may not read adverse events.', cited: ['AE-003'] };
    });
    const result = await withSeed([], { askModel: model }).ask(ada, 'how is AE-003 going?');
    expect(model.request!.context).not.toContain('Adverse Event');
    expect(result.answer).toMatchObject({ status: 'cannot answer', cited: [] });
  });

  it('hides what the role may not read, records personal-data reads as the principal’s, and withholds properties that identify a person', async () => {
    // For this test only: the verbatim term is marked as identifying a person.
    const marked = `@prefix p: <${NS.p}> . @prefix ls: <${NS.ls}> . ls:verbatimTerm p:identifiesPerson true .`;
    const gateway = withSeed([marked], {
      askModel: new ScriptedModel(async (run) => {
        expect(((await run('read_object', { identifier: 'PT-03' })).json.properties as Record<string, string>)['assigned arm']).toBeUndefined();
        expect(((await run('read_object', { identifier: 'AE-003' })).json.properties as Record<string, string>)['verbatim term']).toBe('withheld');
        return { status: 'answered', text: 'Done.', cited: [] };
      }),
    });
    const before = gateway.reads().length;
    await gateway.ask(ben, 'tell me about PT-03');
    expect(gateway.reads().slice(before).map((r) => [r.person, r.object])).toEqual([
      [ben.person, `${NS.d}PT-03`],
      [ben.person, `${NS.d}AE-003`],
    ]);
  });

  it('answers over HTTP', async () => {
    const model = new ScriptedModel(async () => ({ status: 'needs more', text: 'Which study do you mean?', cited: [] }));
    const server = createGatewayServer(withSeed([], { askModel: model }), { developmentMode: true });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ask`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-lsh-person': ben.person, 'x-lsh-role': ben.role },
        body: JSON.stringify({ question: 'how is the study going?' }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ question: 'how is the study going?', answer: { status: 'needs more', text: 'Which study do you mean?', cited: [] } });
    } finally {
      server.close();
    }
  });
});

// ---------------------------------------------------------------- the Claude-backed model, against a stand-in API

/** A stand-in for the Messages API: answers each request with the next scripted response, and keeps the requests. */
async function standIn(responses: object[]) {
  const requests: { body: Record<string, unknown>; headers: IncomingMessage['headers'] }[] = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    requests.push({ body: JSON.parse(raw), headers: req.headers });
    const next = responses.shift();
    res.writeHead(next ? 200 : 500, { 'content-type': 'application/json' });
    res.end(JSON.stringify(next ?? { type: 'error', error: { type: 'api_error', message: 'no more' } }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { requests, baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
}

const message = (content: object[], stop_reason: string) => ({
  id: 'msg', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason, stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
});

describe('AnthropicAskModel', () => {
  it('runs the tools Claude calls, returns their results together, and ends with give_answer', async () => {
    const api = await standIn([
      message([
        { type: 'tool_use', id: 't1', name: 'find_objects', input: find({ types: ['Adverse Event'], states: ['serious'] }) },
        { type: 'tool_use', id: 't2', name: 'count_objects', input: { type: 'Adverse Event', states: [], group_by: '' } },
      ], 'tool_use'),
      message([{ type: 'tool_use', id: 't3', name: 'give_answer', input: { status: 'answered', text: 'Two of five are serious.', cited: ['AE-003', 'AE-005'] } }], 'tool_use'),
    ]);
    try {
      const model = new AnthropicAskModel({ apiKey: 'test-key', baseURL: api.baseURL });
      const result = await withSeed([], { askModel: model }).ask(ben, 'how many events are serious?');
      expect(result.answer).toMatchObject({ status: 'answered', text: 'Two of five are serious.', model: 'claude-opus-5-5' });
      expect(result.answer!.cited.map((c) => c.identifier)).toEqual(['AE-003', 'AE-005']);

      const [first, second] = api.requests;
      expect(first.body).toMatchObject({ model: 'claude-opus-5-5', output_config: { effort: 'medium' }, fallbacks: 'default' });
      expect(first.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
      expect((first.body.tools as { name: string; strict: boolean }[]).map((t) => [t.name, t.strict])).toEqual([
        ['find_objects', true], ['read_object', true], ['count_objects', true], ['methods_for', true], ['give_answer', true],
      ]);
      expect(JSON.stringify(first.body.messages)).toContain('<question>\\nhow many events are serious?\\n</question>');
      // Both results go back in one message, in the order of the calls.
      const results = (second.body.messages as { role: string; content: { type: string; tool_use_id: string; content: string }[] }[]).at(-1)!;
      expect(results.content.map((r) => r.tool_use_id)).toEqual(['t1', 't2']);
      expect(JSON.parse(results.content[1].content)).toEqual({ type: 'Adverse Event', total: 5 });
    } finally {
      api.close();
    }
  });

  it('asks for give_answer once when Claude answers in plain text, then takes the text', async () => {
    const api = await standIn([message([{ type: 'text', text: 'Five.' }], 'end_turn'), message([{ type: 'text', text: 'There are five.' }], 'end_turn')]);
    try {
      const result = await withSeed([], { askModel: new AnthropicAskModel({ apiKey: 'k', baseURL: api.baseURL }) }).ask(ben, 'how many events?');
      expect(result.answer).toMatchObject({ status: 'answered', text: 'There are five.', cited: [] });
      expect(JSON.stringify(api.requests[1].body.messages)).toContain('Finish by calling give_answer');
    } finally {
      api.close();
    }
  });

  it('falls back to search when Claude declines, and never runs a tool from that turn', async () => {
    const api = await standIn([message([{ type: 'tool_use', id: 't1', name: 'read_object', input: { identifier: 'AE-003' } }], 'refusal')]);
    try {
      const gateway = withSeed([], { askModel: new AnthropicAskModel({ apiKey: 'k', baseURL: api.baseURL }) });
      const before = gateway.reads().length;
      const result = await gateway.ask(ben, 'serious adverse events');
      expect(result.searched).toBe('The model could not answer, so the question was searched.');
      expect(gateway.reads().length).toBe(before);
    } finally {
      api.close();
    }
  });

  it('answers as unanswerable when the question takes more steps than allowed', async () => {
    const loop = () => message([{ type: 'tool_use', id: `t${Math.random()}`, name: 'count_objects', input: { type: 'Study', states: [], group_by: '' } }], 'tool_use');
    const api = await standIn(Array.from({ length: 12 }, loop));
    try {
      const result = await withSeed([], { askModel: new AnthropicAskModel({ apiKey: 'k', baseURL: api.baseURL }) }).ask(ben, 'count forever');
      expect(result.answer).toMatchObject({ status: 'cannot answer', text: 'This question needed more steps than a question may take. Try asking about one thing at a time.' });
      expect(api.requests).toHaveLength(12);
    } finally {
      api.close();
    }
  });

  const key = process.env.LSH_ANTHROPIC_API_KEY;
  it.skipIf(!key)('answers "which serious adverse events are not reported to safety yet?" with Claude (live, when LSH_ANTHROPIC_API_KEY is set)', async () => {
    const result = await withSeed([], { askModel: askModelFromEnvironment() }).ask(ben, 'Which serious adverse events are not reported to safety yet?');
    expect(result.answer).toMatchObject({ status: 'answered', model: expect.stringMatching(/^claude-/) });
    expect(result.answer!.cited.map((c) => c.identifier)).toEqual(expect.arrayContaining(['AE-003', 'AE-005']));
  }, 300_000);

  it('is connected only with a key in the environment', () => {
    expect(askModelFromEnvironment({})).toBeUndefined();
    expect(askModelFromEnvironment({ LSH_ANTHROPIC_API_KEY: 'k', LSH_ASK_MODEL: 'claude-sonnet-5-5' })?.model).toBe('claude-sonnet-5-5');
  });
});
