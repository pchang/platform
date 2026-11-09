import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { NS } from '../ontology/ontology';
import { Gateway, GatewayError, type Principal } from './gateway';
import { createMcpServer } from './mcp';

/**
 * JSON over HTTP for the experience layer (platform spec section 3.4, Transport).
 *
 *   GET  /api/ontology                       describe the ontology
 *   GET  /api/objects?type=Batch             find objects, optionally &<dimension>=<value>
 *   GET  /api/objects/:id                    read an object
 *   GET  /api/objects/:id/methods            offer methods
 *   POST /api/objects/:id/methods/:method    commit a method; body { "inputs": { ... } }
 *   GET  /api/commits                        the history of commits
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
    const principal = principalFrom(req, options);
    const route = `${req.method} ${parts.slice(1).map((p, i) => (i % 2 === 1 ? ':' : p)).join('/')}`;

    switch (route) {
      case 'GET ontology':
        return send(res, 200, gateway.describe(principal));
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
      case 'POST objects/:/methods/:': {
        const { inputs = {} } = (await body(req)) as { inputs?: Record<string, string> };
        return send(res, 201, await gateway.commit(principal, parts[2], expand(parts[4], NS.ls), inputs));
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
