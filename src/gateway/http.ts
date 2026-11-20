import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize as normalizePath, sep } from 'node:path';
import { NS } from '../ontology/ontology';
import { Gateway, GatewayError, type Principal } from './gateway';
import { checkAbout, checkTurns } from './ask';
import type { SignIn } from './auth';
import { createMcpServer } from './mcp';

/**
 * JSON over HTTP for the experience layer (platform spec section 3.4, Transport).
 *
 *   GET  /api/ontology                       describe the ontology
 *   GET  /api/navigation                     the domains and object types of the principal's work
 *   GET  /api/todo                           objects with work waiting for the principal
 *   GET  /api/objects?type=Batch             find objects, optionally &<dimension>=<value>
 *   GET  /api/search?q=list+my+queries      search: who understood the query and how, and what it found; &understand=ontology skips the model
 *   POST /api/ask                            ask a question; body { "question": "...", "earlier": [{ "question", "answer" }], "about": ["AE-003"] }: an answer with the objects it cites, or the search it fell back to
 *   GET  /api/objects/:id                    read an object
 *   GET  /api/objects/:id/methods            offer methods
 *   GET  /api/objects/:id/methods/:method    compose a method: its inputs, choices, defaults and archetype
 *   POST /api/objects/:id/methods/:method/preview   preview a method; body { "inputs": { ... } }
 *   POST /api/objects/:id/methods/:method    commit a method; body { "inputs": { ... }, "signature": { "typedName": "..." }, "draft": { "draft": "...", "text": "..." } }
 *   POST /api/objects/:id/methods/:method/draft     a connected model drafts the method; recorded, changes nothing
 *   GET  /api/types/:type/form?parent=:id    the form to create an object of a type, inside a parent when given
 *   POST /api/types/:type/preview            preview a create; body { "values": { ... }, "parent": "..." }
 *   POST /api/types/:type                    create an object; body { "values": { ... }, "parent": "..." }
 *   GET  /api/objects/:id/editable           why the object cannot be edited now: { "blocks": [...] }
 *   GET  /api/objects/:id/edit               the form to edit an object, with its current values
 *   POST /api/objects/:id/edit/preview       preview an edit; body { "values": { ... } }
 *   POST /api/objects/:id/edit               edit an object; body { "values": { ... } }
 *   GET  /api/home                           the person's homepage: metrics, lifecycles and work done lately
 *   POST /api/sets                           the set methods a selection qualifies for; body { "objects": [...] }
 *   POST /api/sets/:method                   compose a set method for a selection; body { "objects": [...] }
 *   POST /api/sets/:method/preview           preview a set method; body { "objects": [...], "inputs": { ... } }
 *   POST /api/sets/:method/commit            commit a set method once; body { "objects": [...], "inputs": { ... } }
 *   GET  /api/drafts/:draft                  read a draft back, such as /api/drafts/1
 *   POST /api/drafts/:draft/discard          discard a draft, such as /api/drafts/1/discard
 *   GET  /api/runs?object=P-101&active=true  track background runs, optionally on one object, or only those not ended
 *   GET  /api/runs/:run                      one run, such as /api/runs/1
 *   GET  /api/notifications                  the principal's notifications, newest first
 *   POST /api/notifications/read             mark notifications read; body { "notifications": [...] }, or {} for all
 *   GET  /api/commits                        the history of commits
 *   GET  /api/dev/people                     the seed graph's people and roles (development mode only)
 *   POST /mcp                                the same requests over the Model Context Protocol, for agents
 *
 *   GET  /api/me                             who the request is signed in as, and whether it is a demo deployment
 *   GET  /auth/login, /auth/callback, /auth/logout   sign-in with the deployment's OpenID Connect provider
 *   GET  /healthz                            the gateway is up
 *
 * Identity (platform spec 3.4): with sign-in, every request needs a session. The account acts as its own person, in the
 * role named by X-LSH-Role; in a demo deployment, as any person named by X-LSH-Person. Without sign-in, development mode
 * reads the principal from the X-LSH-Person and X-LSH-Role headers, and otherwise every request is refused.
 * Requests that change anything must be JSON, so another site cannot forge one with the session cookie.
 */

export interface HttpOptions {
  developmentMode: boolean;
  /** Sign-in with the deployment's OpenID Connect provider (deployment.md). */
  signIn?: SignIn;
  /** A demo deployment with synthetic data only: signed-in accounts may act as any person (platform spec 3.4, Identity). */
  demoPersonas?: boolean;
  /** The built page, served from the same origin (deployment.md, Shape). */
  staticDir?: string;
}

/** Accepts full IRIs, or short names in the default namespace: person-chloe, DrugSafetyPhysician. */
const expand = (value: string, namespace: string) => (value.includes('://') ? value : `${namespace}${value}`);

async function principalFrom(gateway: Gateway, req: IncomingMessage, options: HttpOptions): Promise<Principal> {
  const person = req.headers['x-lsh-person'];
  const role = req.headers['x-lsh-role'];
  if (options.signIn) {
    const account = await options.signIn.account(req);
    if (!account) throw new GatewayError(401, ['Sign in to continue.']);
    if (options.demoPersonas) {
      if (typeof person !== 'string' || typeof role !== 'string') throw new GatewayError(400, ['Choose a person to act as (demo deployment)']);
      return { person: expand(person, NS.d), role: expand(role, NS.ls), account: account.email };
    }
    const own = gateway.personWithEmail(account.email);
    if (!own) throw new GatewayError(403, [`No person in the platform has the email ${account.email}.`]);
    const chosen = typeof role === 'string' ? expand(role, NS.ls) : own.roles[0]?.role;
    if (!chosen) throw new GatewayError(403, [`${own.name} has no role in the platform.`]);
    return { person: own.person, role: chosen, account: account.email };
  }
  if (!options.developmentMode) throw new GatewayError(401, ['Authentication is required. No sign-in is configured.']);
  if (typeof person !== 'string' || typeof role !== 'string') throw new GatewayError(401, ['Send X-LSH-Person and X-LSH-Role headers (development mode)']);
  return { person: expand(person, NS.d), role: expand(role, NS.ls) };
}

/** Headers on every response (deployment.md, Shape): no framing by other sites, no referrer elsewhere, no sniffing. */
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'x-frame-options': 'DENY',
  'content-security-policy': "frame-ancestors 'none'",
};

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttl': 'text/turtle; charset=utf-8',
};

/** Serves the built page: a file under the directory, or the page itself for any other path. Hashed assets are cached. */
function serveStatic(dir: string, pathname: string, headOnly: boolean, res: ServerResponse) {
  const root = normalizePath(dir);
  let file = normalizePath(join(root, decodeURIComponent(pathname)));
  if (file !== root && !file.startsWith(root + sep)) throw new GatewayError(404, ['Not found']);
  if (!existsSync(file) || !statSync(file).isFile()) file = join(root, 'index.html');
  const hashed = file.includes(`${sep}assets${sep}`);
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (headOnly) res.end();
  else createReadStream(file).pipe(res);
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
  res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

export async function handle(gateway: Gateway, options: HttpOptions, req: IncomingMessage, res: ServerResponse) {
  try {
    const url = new URL(req.url ?? '/', 'http://gateway');
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (url.pathname === '/healthz') return send(res, 200, { ok: true });
    if (parts[0] === 'auth' && parts.length === 2 && options.signIn) return await auth(options.signIn, parts[1], req, res);
    // Anything that changes state must be JSON: a form on another site cannot send that with the session cookie.
    const reading = req.method === 'GET' || req.method === 'HEAD';
    if (!reading && !(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
      throw new GatewayError(415, ['Send JSON, with Content-Type: application/json']);
    }
    if (parts[0] === 'mcp' && parts.length === 1) return await mcp(gateway, await principalFrom(gateway, req, options), req, res);
    if (parts[0] !== 'api') {
      if (options.staticDir && reading) return serveStatic(options.staticDir, url.pathname, req.method === 'HEAD', res);
      throw new GatewayError(404, ['Not found']);
    }
    if (req.method === 'GET' && parts[1] === 'me' && parts.length === 2) return send(res, 200, await me(gateway, req, options));
    if (req.method === 'GET' && parts[1] === 'dev' && parts[2] === 'people' && parts.length === 3) {
      // The people to act as: in development, or for a signed-in account in a demo deployment.
      const allowed = options.signIn ? options.demoPersonas && (await options.signIn.account(req)) : options.developmentMode;
      if (!allowed) throw new GatewayError(404, ['Not found']);
      return send(res, 200, gateway.people());
    }
    const principal = await principalFrom(gateway, req, options);
    const route = `${req.method} ${parts.slice(1).map((p, i) => (i % 2 === 1 ? ':' : p)).join('/')}`;

    switch (route) {
      case 'GET ontology':
        return send(res, 200, gateway.describe(principal));
      case 'GET navigation':
        return send(res, 200, gateway.navigation(principal));
      case 'GET home':
        return send(res, 200, gateway.home(principal));
      case 'GET todo':
        return send(res, 200, await gateway.todo(principal));
      case 'GET objects': {
        const type = url.searchParams.get('type');
        if (!type) throw new GatewayError(400, ['Give a type, such as ?type=Batch']);
        const state = Object.fromEntries([...url.searchParams].filter(([k]) => k !== 'type').map(([k, v]) => [expand(k, NS.ls), expand(v, NS.lst)]));
        return send(res, 200, gateway.find(principal, expand(type, NS.ls), state));
      }
      case 'POST ask': {
        const { question, earlier, about } = (await body(req)) as { question?: unknown; earlier?: unknown; about?: unknown };
        return send(res, 200, await gateway.ask(principal, typeof question === 'string' ? question : '', checkTurns(earlier), checkAbout(about)));
      }
      case 'GET search':
        return send(res, 200, await gateway.search(principal, url.searchParams.get('q') ?? '', { understand: url.searchParams.get('understand') === 'ontology' ? 'ontology' : 'model' }));
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
      case 'GET types/:/form':
        return send(res, 200, gateway.createForm(principal, expand(parts[2], NS.ls), url.searchParams.get('parent') ?? undefined));
      case 'POST types/:/preview': {
        const given = await body(req);
        return send(res, 200, await gateway.previewCreate(principal, expand(parts[2], NS.ls), checkValues(given), checkParent(given)));
      }
      case 'POST types/:': {
        const given = await body(req);
        return send(res, 201, await gateway.create(principal, expand(parts[2], NS.ls), checkValues(given), checkParent(given)));
      }
      case 'GET objects/:/editable':
        return send(res, 200, { blocks: await gateway.editBlocks(principal, parts[2]) });
      case 'GET objects/:/edit':
        return send(res, 200, await gateway.editForm(principal, parts[2]));
      case 'POST objects/:/edit/:': {
        if (parts[4] !== 'preview') throw new GatewayError(404, ['Not found']);
        return send(res, 200, await gateway.previewEdit(principal, parts[2], checkValues(await body(req))));
      }
      case 'POST objects/:/edit':
        return send(res, 200, await gateway.edit(principal, parts[2], checkValues(await body(req))));
      case 'POST sets':
        return send(res, 200, await gateway.setMethods(principal, checkObjects(await body(req))));
      case 'POST sets/:': {
        return send(res, 200, await gateway.composeSet(principal, checkObjects(await body(req)), expand(parts[2], NS.ls)));
      }
      case 'POST sets/:/preview': {
        const given = await body(req);
        return send(res, 200, await gateway.previewSet(principal, checkObjects(given), expand(parts[2], NS.ls), checkInputs(given)));
      }
      case 'POST sets/:/commit': {
        const given = await body(req);
        return send(res, 201, await gateway.commitSet(principal, checkObjects(given), expand(parts[2], NS.ls), checkInputs(given)));
      }
      case 'GET drafts/:':
        return send(res, 200, gateway.getDraft(principal, parts[2]));
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

/** Who the request is signed in as (design system spec 4.1, Signing in), so the page knows what to show. */
async function me(gateway: Gateway, req: IncomingMessage, options: HttpOptions) {
  if (!options.signIn) {
    if (!options.developmentMode) throw new GatewayError(401, ['Authentication is required. No sign-in is configured.']);
    return { mode: 'development' };
  }
  const account = await options.signIn.account(req);
  if (!account) throw new GatewayError(401, ['Sign in to continue.']);
  if (options.demoPersonas) return { mode: 'demo', account };
  const person = gateway.personWithEmail(account.email);
  if (!person) throw new GatewayError(403, [`No person in the platform has the email ${account.email}.`]);
  return { mode: 'signed-in', account, person };
}

/** The sign-in routes. A refusal goes back to the page, which shows its reason on the sign-in page. */
async function auth(signIn: SignIn, step: string, req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') throw new GatewayError(404, ['Not found']);
  if (step === 'login') return await signIn.start(res);
  if (step === 'logout') return signIn.signOut(res);
  if (step !== 'callback') throw new GatewayError(404, ['Not found']);
  try {
    return await signIn.finish(req, res);
  } catch (error) {
    if (!(error instanceof GatewayError)) throw error;
    res.writeHead(302, { ...SECURITY_HEADERS, location: `/?signin=${encodeURIComponent(error.reasons.join(' '))}`, 'cache-control': 'no-store' });
    res.end();
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

/** The objects of a set, from a request body: identifiers or IRIs (spec 5.4, Acting on a set). */
function checkObjects(given: unknown): string[] {
  const objects = (given as { objects?: unknown })?.objects;
  if (!Array.isArray(objects) || !objects.every((o) => typeof o === 'string') || objects.length > 50) throw new GatewayError(400, ['Give the objects as a list of identifiers']);
  return objects;
}

function checkInputs(given: unknown): Record<string, string> {
  const inputs = (given as { inputs?: unknown })?.inputs ?? {};
  if (typeof inputs !== 'object' || inputs === null || !Object.values(inputs).every((v) => typeof v === 'string')) throw new GatewayError(400, ['Give the inputs as text values']);
  return inputs as Record<string, string>;
}

/** A form's values, from a request body (spec 5.3, Creating and editing objects). */
function checkValues(given: unknown): Record<string, string> {
  const values = (given as { values?: unknown })?.values ?? {};
  if (typeof values !== 'object' || values === null || !Object.values(values).every((v) => typeof v === 'string')) throw new GatewayError(400, ['Give the values as text']);
  return values as Record<string, string>;
}

function checkParent(given: unknown): string | undefined {
  const parent = (given as { parent?: unknown })?.parent;
  if (parent !== undefined && typeof parent !== 'string') throw new GatewayError(400, ['Give the parent as an identifier']);
  return parent;
}
