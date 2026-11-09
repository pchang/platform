import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { NS } from '../ontology/ontology';
import { GatewayError, type Gateway, type Principal } from './gateway';

/**
 * The gateway over the Model Context Protocol, for agents (platform spec section 3.4, Transport).
 * One server per principal. The tools are the gateway's five requests, so an agent works under
 * exactly the same permissions, rules and audit trail as a person.
 */

const expand = (value: string, namespace: string) => (value.includes('://') ? value : `${namespace}${value}`);

function result(run: () => unknown | Promise<unknown>) {
  return Promise.resolve()
    .then(run)
    .then(
      (value) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }),
      (error: unknown) => {
        if (!(error instanceof GatewayError)) throw error;
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ reasons: error.reasons }) }] };
      },
    );
}

export function createMcpServer(gateway: Gateway, principal: Principal): McpServer {
  const server = new McpServer({ name: 'lsh-gateway', version: '0.1.0' });

  server.registerTool(
    'describe_ontology',
    {
      title: 'Describe the ontology',
      description: 'Object types you may read, with their state dimensions and values, and the methods on each with their inputs.',
      annotations: { readOnlyHint: true },
    },
    () => result(() => gateway.describe(principal)),
  );

  server.registerTool(
    'find_objects',
    {
      title: 'Find objects',
      description: 'Objects of a type, optionally filtered by state. Use short names, such as type "DataQuery" and state { "dataQueryStatus": "DataQueryStatus-open" }, or full IRIs.',
      inputSchema: { type: z.string(), state: z.record(z.string(), z.string()).optional() },
      annotations: { readOnlyHint: true },
    },
    ({ type, state = {} }) =>
      result(() =>
        gateway.find(principal, expand(type, NS.ls), Object.fromEntries(Object.entries(state).map(([k, v]) => [expand(k, NS.ls), expand(v, NS.lst)]))),
      ),
  );

  server.registerTool(
    'read_object',
    {
      title: 'Read an object',
      description: 'An object by identifier, such as "SC-003": its state, links and properties, as your role may see them.',
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ id }) => result(() => gateway.read(principal, id)),
  );

  server.registerTool(
    'offer_methods',
    {
      title: 'Offer methods',
      description: 'The methods on an object, each available or blocked with the reasons it is blocked.',
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ id }) => result(() => gateway.methods(principal, id)),
  );

  server.registerTool(
    'commit_method',
    {
      title: 'Commit a method',
      description:
        'Runs one method on one object, such as method "AnswerQuery" on "Q-01" with inputs { "answer": "..." }. ' +
        'Checks your role, the inputs and the preconditions, applies the effects, validates the result and records the commit. ' +
        'Nothing changes if any step fails; the reasons are returned.',
      inputSchema: { id: z.string(), method: z.string(), inputs: z.record(z.string(), z.string()).optional() },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    ({ id, method, inputs = {} }) => result(() => gateway.commit(principal, id, expand(method, NS.ls), inputs)),
  );

  return server;
}
