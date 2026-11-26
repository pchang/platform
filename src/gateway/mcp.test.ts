// @vitest-environment node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NS } from '../ontology/ontology';
import type { Gateway } from './gateway';
import { withSeed } from './node';
import { createGatewayServer } from './http';
import { createMcpServer } from './mcp';

// Journeys run many commits, and each validates the whole graph (see the PR note on validation cost).
vi.setConfig({ testTimeout: 60_000 });

const agent = { person: `${NS.d}agent-northbridge`, role: `${NS.ls}ExternalCROAgent` };
type ToolResult = { isError?: boolean; content: { type: string; text: string }[] };
const parse = (r: unknown) => JSON.parse((r as ToolResult).content[0].text);

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => cleanup?.());

async function connect(gateway: Gateway, principal = agent) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createMcpServer(gateway, principal).connect(serverSide);
  const client = new Client({ name: 'test-agent', version: '1.0.0' });
  await client.connect(clientSide);
  cleanup = () => client.close();
  return client;
}

describe('MCP transport', () => {
  it('offers the gateway requests as tools', async () => {
    const client = await connect(withSeed());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['ask', 'commit_method', 'compose_method', 'describe_ontology', 'draft_method', 'find_objects', 'list_notifications', 'list_todo', 'mark_notifications_read', 'offer_methods', 'preview_method', 'propose_inputs', 'read_object', 'search_objects', 'track_runs']);
  });

  it('asks a question: without a connected model, the question is searched and the result says so', async () => {
    const client = await connect(withSeed(), { person: `${NS.d}person-chloe`, role: `${NS.ls}DrugSafetyPhysician` });
    const asked = parse(await client.callTool({ name: 'ask', arguments: { question: 'serious adverse events' } }));
    expect(asked.searched).toBe('No model is connected to answer questions, so the question was searched.');
    expect(asked.search.results.map((r: { object: { identifier: string } }) => r.object.identifier)).toEqual(['AE-003', 'AE-005']);
  });

  it('runs the External agent journey: answers open queries at its sites and proposes closing them, under the same policy and log', async () => {
    const gateway = withSeed();
    const client = await connect(gateway);

    // Only the open queries at Northbridge's two sites exist for it (domain spec section 6, Scope).
    const open = parse(await client.callTool({ name: 'find_objects', arguments: { type: 'DataQuery', state: { dataQueryStatus: 'DataQueryStatus-open' } } }));
    expect(open.map((q: { identifier: string }) => q.identifier)).toEqual(['Q-01', 'Q-03']);

    const proposals: string[] = [];
    for (const { identifier } of open as { identifier: string }[]) {
      const answered = parse(await client.callTool({ name: 'commit_method', arguments: { id: identifier, method: 'AnswerQuery', inputs: { answer: 'Confirmed against the site source record' }, reason: 'The site source record matches' } }));
      expect(answered.changes[0]).toMatchObject({ subjectLabel: identifier, newLabel: 'answered' });
      // Closing is final, so it becomes a proposal for the person who answers for the agent.
      const closing = parse(await client.callTool({ name: 'commit_method', arguments: { id: identifier, method: 'CloseQuery', reason: 'Answered from source; nothing left to resolve' } }));
      expect(closing.proposedTo).toMatchObject({ accountablePersonName: 'Mira Castellanos' });
      proposals.push(closing.proposedTo.identifier);
    }
    const stillOpen = parse(await client.callTool({ name: 'find_objects', arguments: { type: 'DataQuery', state: { dataQueryStatus: 'DataQueryStatus-open' } } }));
    expect(stillOpen).toEqual([]);

    // Mira confirms; the closes are hers, recorded as proposed by the agent.
    const mira = { person: `${NS.d}person-mira`, role: `${NS.ls}CRODataManager` };
    for (const proposal of proposals) await gateway.commit(mira, proposal, `${NS.p}ConfirmAgentProposal`);

    // The agent's actions are in the same history as people's, with the version it declared.
    const history = gateway.commits();
    expect(history.map((c) => [c.person.split('/').pop(), c.method.split('#').pop()])).toEqual([
      ['agent-northbridge', 'AnswerQuery'], ['agent-northbridge', 'Create'], ['agent-northbridge', 'AnswerQuery'], ['agent-northbridge', 'Create'],
      ['person-mira', 'CloseQuery'], ['person-mira', 'CloseQuery'],
    ]);
  });

  it('returns the reasons when the agent is refused', async () => {
    const client = await connect(withSeed());
    // A batch is nothing the agent reads, so for it the batch does not exist.
    const refused = await client.callTool({ name: 'commit_method', arguments: { id: 'B-002', method: 'ReleaseBatch', inputs: { reviewer: 'person-elena' }, reason: 'Release' } });
    expect((refused as ToolResult).isError).toBe(true);
    expect(parse(refused)).toEqual({ reasons: ['No object B-002'] });
    const unexplained = await client.callTool({ name: 'commit_method', arguments: { id: 'Q-01', method: 'AnswerQuery', inputs: { answer: 'Confirmed' } } });
    expect(parse(unexplained)).toEqual({ reasons: ['Give your reason: every commit and proposal by an agent says why'] });
    const blinded = await client.callTool({ name: 'read_object', arguments: { id: 'PT-01' } });
    expect(parse(blinded).properties).not.toHaveProperty('assigned arm');
  });

  it('starts a background run, tracks it and reads the notification it ends with', async () => {
    const gateway = withSeed();
    const chloe = { person: `${NS.d}person-chloe`, role: `${NS.ls}DrugSafetyPhysician` };
    const client = await connect(gateway, chloe);
    const started = parse(await client.callTool({ name: 'commit_method', arguments: { id: 'P-101', method: 'RunSignalDetection' } }));
    expect(started.run.status).toBe('queued');
    await gateway.idle();
    const [run] = parse(await client.callTool({ name: 'track_runs', arguments: { id: 'P-101' } }));
    expect(run).toMatchObject({ status: 'succeeded', created: [{ identifier: 'Signal-2' }] });
    const [notice] = parse(await client.callTool({ name: 'list_notifications', arguments: {} }));
    expect(notice).toMatchObject({ title: 'Run signal detection finished', read: false });
    expect(parse(await client.callTool({ name: 'mark_notifications_read', arguments: {} }))).toEqual({ marked: 1 });
  });

  it('works over HTTP at /mcp, with the principal from development headers', async () => {
    const server = createGatewayServer(withSeed(), { developmentMode: true });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`);
    const client = new Client({ name: 'http-agent', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { 'x-lsh-person': 'agent-northbridge', 'x-lsh-role': 'ExternalCROAgent' } } }));
    cleanup = async () => {
      await client.close();
      server.close();
    };
    const query = parse(await client.callTool({ name: 'read_object', arguments: { id: 'Q-01' } }));
    expect(query.state.Status).toBe('open');
  });
});
