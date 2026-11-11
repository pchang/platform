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
vi.setConfig({ testTimeout: 20_000 });

const agent = { person: `${NS.d}agent-northbridge`, role: `${NS.ls}ExternalCROAgent` };
type ToolResult = { isError?: boolean; content: { type: string; text: string }[] };
const parse = (r: unknown) => JSON.parse((r as ToolResult).content[0].text);

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => cleanup?.());

async function connect(gateway: Gateway) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createMcpServer(gateway, agent).connect(serverSide);
  const client = new Client({ name: 'test-agent', version: '1.0.0' });
  await client.connect(clientSide);
  cleanup = () => client.close();
  return client;
}

describe('MCP transport', () => {
  it('offers the gateway requests as tools', async () => {
    const client = await connect(withSeed());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['commit_method', 'compose_method', 'describe_ontology', 'find_objects', 'list_todo', 'offer_methods', 'preview_method', 'read_object']);
  });

  it('runs the External agent journey: answers and closes open queries, under the same policy and log', async () => {
    const gateway = withSeed();
    const client = await connect(gateway);

    const open = parse(await client.callTool({ name: 'find_objects', arguments: { type: 'DataQuery', state: { dataQueryStatus: 'DataQueryStatus-open' } } }));
    expect(open.map((q: { identifier: string }) => q.identifier)).toEqual(['Q-01', 'Q-02', 'Q-03', 'Q-04']);

    for (const { identifier } of open as { identifier: string }[]) {
      await client.callTool({ name: 'commit_method', arguments: { id: identifier, method: 'AnswerQuery', inputs: { answer: 'Confirmed against the site source record' } } });
      await client.callTool({ name: 'commit_method', arguments: { id: identifier, method: 'CloseQuery' } });
    }
    const stillOpen = parse(await client.callTool({ name: 'find_objects', arguments: { type: 'DataQuery', state: { dataQueryStatus: 'DataQueryStatus-open' } } }));
    expect(stillOpen).toEqual([]);

    // The agent's actions are in the same history as people's.
    const history = gateway.commits();
    expect(history).toHaveLength(8);
    expect(new Set(history.map((c) => c.person))).toEqual(new Set([agent.person]));
  });

  it('returns the reasons when the agent is refused', async () => {
    const client = await connect(withSeed());
    const refused = await client.callTool({ name: 'commit_method', arguments: { id: 'B-002', method: 'ReleaseBatch', inputs: { reviewer: 'person-elena' } } });
    expect((refused as ToolResult).isError).toBe(true);
    expect(parse(refused)).toEqual({ reasons: ['Your role cannot run this method'] });
    const blinded = await client.callTool({ name: 'read_object', arguments: { id: 'PT-03' } });
    expect(parse(blinded).properties).not.toHaveProperty('assigned arm');
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
