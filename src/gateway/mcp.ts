import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { NS } from '../ontology/ontology';
import { GatewayError, type Gateway, type Principal } from './gateway';

/**
 * The gateway over the Model Context Protocol, for agents (platform spec section 3.4, Transport).
 * One server per principal. The tools are the gateway's requests, so an agent works under
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
    'list_todo',
    {
      title: 'To do',
      description: 'Objects with work waiting for you: tasks you can run now, and urgent objects. Nearest deadline first.',
      annotations: { readOnlyHint: true },
    },
    () => result(() => gateway.todo(principal)),
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
    'compose_method',
    {
      title: 'Compose a method',
      description: 'What a method needs before it can run on an object: each input with its kind, choices and default, and the method\'s interaction archetype.',
      inputSchema: { id: z.string(), method: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ id, method }) => result(() => gateway.compose(principal, id, expand(method, NS.ls))),
  );

  server.registerTool(
    'preview_method',
    {
      title: 'Preview a method',
      description: 'What running a method would change, without saving anything: every value from old to new and every object created, or the reasons it would fail.',
      inputSchema: { id: z.string(), method: z.string(), inputs: z.record(z.string(), z.string()).optional() },
      annotations: { readOnlyHint: true },
    },
    ({ id, method, inputs = {} }) => result(() => gateway.preview(principal, id, expand(method, NS.ls), inputs)),
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

  server.registerTool(
    'draft_method',
    {
      title: 'Draft a method',
      description:
        'For a method that produces a draft, such as "GenerateNarrative" on "SC-003": the connected model writes the draft from what you may read. ' +
        'The draft is recorded and changes nothing. Only a person accepts or discards it, so an agent cannot commit it.',
      inputSchema: { id: z.string(), method: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    ({ id, method }) => result(() => gateway.draft(principal, id, expand(method, NS.ls))),
  );

  server.registerTool(
    'track_runs',
    {
      title: 'Track runs',
      description:
        'Background runs, such as signal detection, newest first: each run\'s status (queued, running, succeeded or failed), progress while it runs, ' +
        'and what it found or why it failed once it ends. Optionally only one object\'s runs, by identifier, or only runs that have not ended.',
      inputSchema: { id: z.string().optional(), active: z.boolean().optional() },
      annotations: { readOnlyHint: true },
    },
    ({ id, active }) => result(() => gateway.runs(principal, { object: id, active })),
  );

  server.registerTool(
    'list_notifications',
    {
      title: 'Notifications',
      description: 'Your notifications, newest first, such as a background run you started ending, with which are unread.',
      annotations: { readOnlyHint: true },
    },
    () => result(() => gateway.notifications(principal)),
  );

  server.registerTool(
    'mark_notifications_read',
    {
      title: 'Mark notifications read',
      description: 'Marks your notifications read: the ones given by their IRIs, or all of them. Returns how many changed.',
      inputSchema: { notifications: z.array(z.string()).optional() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    ({ notifications }) => result(() => ({ marked: gateway.markRead(principal, notifications) })),
  );

  return server;
}
