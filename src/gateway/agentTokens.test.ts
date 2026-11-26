// @vitest-environment node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet, type CryptoKey } from 'jose';
import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NS } from '../ontology/ontology';
import { AgentTokens } from './agentTokens';
import { createGatewayServer, handle, type HttpOptions } from './http';
import { withSeed } from './node';

// Outside agents' authentication (platform spec 3.4, Outside agents): a short-lived token from the deployment's identity
// provider, checked on every request. The identity provider here is a key pair made for the test; the checking is the
// gateway's own.
vi.setConfig({ testTimeout: 60_000 });

const ISSUER = 'https://idp.example.org';
let privateKey: CryptoKey;
let keys: ReturnType<typeof createLocalJWKSet>;
let server: Server | undefined;
afterEach(() => server?.close());

beforeAll(async () => {
  const pair = await generateKeyPair('ES256');
  privateKey = pair.privateKey;
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256' }] });
});

async function start(extraTurtle: string[] = []) {
  const gateway = withSeed(extraTurtle);
  // The audience is this gateway's own /mcp address, known once it listens.
  let options: HttpOptions = { developmentMode: false };
  server = createServer((req, res) => void handle(gateway, options, req, res));
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  options = { developmentMode: false, agentTokens: new AgentTokens({ issuer: ISSUER, audience: `${base}/mcp`, keys }) };
  return { gateway, base };
}

function token(base: string, claims: { client?: string; audience?: string; issuer?: string; lifetime?: number; issuedAgo?: number } = {}) {
  const now = Math.floor(Date.now() / 1000) - (claims.issuedAgo ?? 0);
  return new SignJWT({ client_id: claims.client ?? 'northbridge-query-agent' })
    .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
    .setIssuer(claims.issuer ?? ISSUER)
    .setAudience(claims.audience ?? `${base}/mcp`)
    .setIssuedAt(now)
    .setExpirationTime(now + (claims.lifetime ?? 600))
    .sign(privateKey);
}

async function call(base: string, bearer?: string) {
  const res = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  return { status: res.status, authenticate: res.headers.get('www-authenticate'), body: await res.json() };
}

describe('an outside agent’s token', () => {
  it('tells an agent with no token where to get one', async () => {
    const { base } = await start();
    const metadata = await (await fetch(`${base}/.well-known/oauth-protected-resource`)).json();
    expect(metadata).toEqual({ resource: `${base}/mcp`, authorization_servers: [ISSUER], bearer_methods_supported: ['header'], resource_name: 'LS&H intelligence gateway' });
    const refused = await call(base);
    expect(refused.status).toBe(401);
    expect(refused.authenticate).toBe(`Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`);
  });

  it('lets the registered agent work over MCP, as itself, with the version it declares', async () => {
    const { gateway, base } = await start();
    const bearer = await token(base);
    const client = new Client({ name: 'northbridge-query-agent', version: '1.4.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${bearer}` } } }));
    const answered = await client.callTool({ name: 'commit_method', arguments: { id: 'Q-01', method: 'AnswerQuery', inputs: { answer: 'Confirmed' }, reason: 'The site confirmed it' } });
    expect((answered as { isError?: boolean }).isError).toBeFalsy();
    await client.close();
    const [commit] = gateway.commits();
    expect(commit).toMatchObject({ person: `${NS.d}agent-northbridge`, role: `${NS.ls}ExternalCROAgent` });
  });

  it('is refused when it is not this provider’s, not for this gateway, expired, too long-lived or for no registered agent', async () => {
    const { base } = await start();
    const cases: [string, Promise<string>, number, string][] = [
      ['another issuer', token(base, { issuer: 'https://elsewhere.example.org' }), 401, 'The access token is not valid'],
      ['another audience', token(base, { audience: 'https://other-gateway.example.org/mcp' }), 401, 'The access token is not valid'],
      ['expired', token(base, { issuedAgo: 1200, lifetime: 600 }), 401, 'The access token is not valid'],
      ['an hour long', token(base, { lifetime: 3600 }), 401, 'The access token lives longer than fifteen minutes'],
      ['an unknown client', token(base, { client: 'someone-else' }), 403, 'No agent is registered with the client someone-else'],
    ];
    for (const [name, bearer, status, reason] of cases) {
      const refused = await call(base, await bearer);
      expect(refused.status, name).toBe(status);
      expect(refused.body.reasons[0], name).toContain(reason);
    }
    // A forged signature: the same claims, signed with a key the provider never published.
    const forger = await generateKeyPair('ES256');
    const forged = await new SignJWT({ client_id: 'northbridge-query-agent' }).setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setIssuer(ISSUER).setAudience(`${base}/mcp`).setIssuedAt().setExpirationTime('5m').sign(forger.privateKey);
    expect((await call(base, forged)).status).toBe(401);
  });

  it('stops working the moment the sponsor suspends the agent', async () => {
    const { gateway, base } = await start();
    await gateway.commit({ person: `${NS.d}person-marcus`, role: `${NS.ls}ClinicalOperationsLead` }, 'AG-1', `${NS.p}SuspendAgent`, { reason: 'Audit finding under review' });
    const refused = await call(base, await token(base));
    expect(refused.status).toBe(403);
    expect(refused.body.reasons).toEqual(['This agent is suspended: Audit finding under review']);
  });

  it('is refused where the deployment accepts no outside agents', async () => {
    server = createGatewayServer(withSeed(), { developmentMode: true });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const refused = await call(base, 'anything');
    expect(refused.status).toBe(401);
    expect(refused.body.reasons).toEqual(['This deployment accepts no outside agents']);
  });
});
