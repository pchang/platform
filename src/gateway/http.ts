import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { NS } from '../ontology/ontology';
import { Gateway, GatewayError, type Principal } from './gateway';
import { createMcpServer } from './mcp';

/**
 * JSON over HTTP for the experience layer (platform spec section 3.4, Transport).
 *
 *   GET  /api/ontology                       describe the ontology
 *   GET  /api/navigation                     the domains and object types of the principal's work
 *   GET  /api/todo                           objects with work waiting for the principal
 *   GET  /api/objects?type=Batch             find objects, optionally &<dimension>=<value>
 *   GET  /api/objects/:id                    read an object
 *   GET  /api/objects/:id/methods            offer methods
 *   GET  /api/objects/:id/methods/:method    compose a method: its inputs, choices, defaults and archetype
 *   POST /api/objects/:id/methods/:method/preview   preview a method; body { "inputs": { ... } }
 *   POST /api/objects/:id/methods/:method    commit a method; body { "inputs": { ... }, "signature": { "typedName": "..." }, "draft": { "draft": "...", "text": "..." } }
 *   POST /api/objects/:id/methods/:method/draft     a connected model drafts the method; recorded, changes nothing
 *   POST /api/drafts/:draft/discard          discard a draft, such as /api/drafts/1/discard
 *   GET  /api/runs?object=P-101&active=true  track background runs, optionally on one object, or only those not ended
 *   GET  /api/runs/:run                      one run, such as /api/runs/1
 *   GET  /api/notifications                  the principal's notifications, newest first
 *   POST /api/notifications/read             mark notifications read; body { "notifications": [...] }, or {} for all
 *   GET  /api/commits                        the history of commits
 *   GET  /api/dev/people                     the seed graph's people and roles (development mode only)
 *   POST /mcp                                the same requests over the Model Context Protocol, for agents
 *
 * Identity: until an identity provider is connected, development mode reads the principal from
 * the X-LSH-Person and X-LSH-Role headers. Outside development mode every request is refused.
 */

export interface HttpOptions {
  developmentMode: boolean;
}

/** Accepts full IRIs, or short names in the default namespace: person-chloe, DrugSafetyPhysician. */
const expand = (value: string, namespace: string) => (value.includes('://') ? value : `${namespace}${value}`);

function principalFrom(req: IncomingMessage, options: HttpOptions): Principal {
  if (!options.developmentMode) throw new GatewayError(401, ['Authentication is required. No identity provider is connected yet.']);
  const person = req.headers['x-lsh-person'];
  const role = req.headers['x-lsh-role'];
  if (typeof person !== 'string' || typeof role !== 'string') throw new GatewayError(401, ['Send X-LSH-Person and X-LSH-Role headers (development mode)']);
  return { person: expand(person, NS.d), role: expand(role, NS.ls) };
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new GatewayError(400, ['The request body is not valid JSON']);
  }
}

function send(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

export async function handle(gateway: Gateway, options: HttpOptions, req: IncomingMessage, res: ServerResponse) {
  try {
    const url = new URL(req.url ?? '/', 'http://gateway');
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] === 'mcp' && parts.length === 1) return await mcp(gateway, principalFrom(req, options), req, res);
    if (parts[0] !== 'api') throw new GatewayError(404, ['Not found']);
    if (req.method === 'GET' && parts[1] === 'dev' && parts[2] === 'people' && parts.length === 3) {
      if (!options.developmentMode) throw new GatewayError(404, ['Not found']);
      return send(res, 200, gateway.people());
    }
    const principal = principalFrom(req, options);
    const route = `${req.method} ${parts.slice(1).map((p, i) => (i % 2 === 1 ? ':' : p)).join('/')}`;

    switch (route) {
      case 'GET ontology':
        return send(res, 200, gateway.describe(principal));
      case 'GET navigation':
        return send(res, 200, gateway.navigation(principal));
      case 'GET todo':
        return send(res, 200, await gateway.todo(principal));
      case 'GET objects': {
        const type = url.searchParams.get('type');
        if (!type) throw new GatewayError(400, ['Give a type, such as ?type=Batch']);
        const state = Object.fromEntries([...url.searchParams].filter(([k]) => k !== 'type').map(([k, v]) => [expand(k, NS.ls), expand(v, NS.lst)]));
        return send(res, 200, gateway.find(principal, expand(type, NS.ls), state));
      }
      case 'GET objects/:':
        return send(res, 200, gateway.read(principal, parts[2]));
      case 'GET objects/:/methods':
        return send(res, 200, await gateway.methods(principal, parts[2]));
      case 'GET objects/:/methods/:':
        return send(res, 200, await gateway.compose(principal, parts[2], expand(parts[4], NS.ls)));
      case 'POST objects/:/methods/:/preview': {
        const { inputs = {} } = (await body(req)) as { inputs?: Record<string, string> };
        return send(res, 200, await gateway.preview(principal, parts[2], expand(parts[4], NS.ls), inputs));
      }
      case 'POST objects/:/methods/:/draft':
        return send(res, 201, await gateway.draft(principal, parts[2], expand(parts[4], NS.ls)));
      case 'POST objects/:/methods/:': {
        const { inputs = {}, signature, draft } = (await body(req)) as { inputs?: Record<string, string>; signature?: { typedName: string }; draft?: { draft: string; text: string } };
        return send(res, 201, await gateway.commit(principal, parts[2], expand(parts[4], NS.ls), inputs, signature, draft));
      }
      case 'POST drafts/:/discard':
        return send(res, 200, await gateway.discardDraft(principal, parts[2]));
      case 'GET runs':
        return send(res, 200, gateway.runs(principal, { object: url.searchParams.get('object') ?? undefined, active: url.searchParams.get('active') === 'true' }));
      case 'GET runs/:':
        return send(res, 200, gateway.run(principal, parts[2]));
      case 'GET notifications':
        return send(res, 200, gateway.notifications(principal));
      case 'POST notifications/:': {
        if (parts[2] !== 'read') throw new GatewayError(404, ['Not found']);
        const { notifications } = (await body(req)) as { notifications?: string[] };
        return send(res, 200, { marked: gateway.markRead(principal, notifications) });
      }
      case 'GET commits':
        return send(res, 200, gateway.commits());
      default:
        throw new GatewayError(404, ['Not found']);
    }
  } catch (error) {
    if (error instanceof GatewayError) return send(res, error.status, { reasons: error.reasons });
    console.error(error);
    return send(res, 500, { reasons: ['The gateway failed. Nothing was changed.'] });
  }
}

/** Stateless Streamable HTTP: each request gets a server bound to its principal. */
async function mcp(gateway: Gateway, principal: Principal, req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') throw new GatewayError(404, ['The MCP endpoint takes POST requests']);
  const server = createMcpServer(gateway, principal);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, await body(req));
}

export function createGatewayServer(gateway: Gateway, options: HttpOptions): Server {
  return createServer((req, res) => void handle(gateway, options, req, res));
}
