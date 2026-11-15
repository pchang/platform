// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NS } from '../ontology/ontology';
import { SignIn, signInFromEnvironment } from './auth';
import { createGatewayServer, type HttpOptions } from './http';
import { withSeed } from './node';

// Sign-in (platform spec 3.4, Identity; deployment.md), against a stand-in for Google: its own keys and token endpoint.
vi.setConfig({ testTimeout: 30_000 });

const CLIENT_ID = 'client-123.apps.example';
const SECRET = 'a session secret that is long enough to sign cookies';
const listen = async (server: Server) => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

let provider: { url: string; server: Server; issue: { email: string; verified: boolean; nonce?: string } };
let keys: ReturnType<typeof createLocalJWKSet>;
let privateKey: CryptoKey;
/** What the stand-in provider saw at its authorization endpoint, by code. */
const challenges = new Map<string, { challenge: string; nonce: string }>();

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey as CryptoKey;
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' }] });
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const form = new URLSearchParams(raw);
    const seen = challenges.get(form.get('code') ?? '');
    // PKCE: the verifier must hash to the challenge sent at the start.
    const verifier = form.get('code_verifier') ?? '';
    if (!seen || createHash('sha256').update(verifier).digest('base64url') !== seen.challenge || form.get('client_secret') !== 'shh') {
      res.writeHead(400).end(JSON.stringify({ error: 'invalid_grant' }));
      return;
    }
    const idToken = await new SignJWT({ email: provider.issue.email, email_verified: provider.issue.verified, name: 'Paul Example', nonce: provider.issue.nonce ?? seen.nonce })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(provider.url)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id_token: idToken }));
  });
  provider = { url: await listen(server), server, issue: { email: 'paul@example.com', verified: true } };
});
afterAll(() => provider.server.close());

function signIn() {
  return new SignIn(
    {
      clientId: CLIENT_ID,
      clientSecret: 'shh',
      publicUrl: 'https://lsh.example',
      sessionSecret: SECRET,
      allowedEmails: ['paul@example.com', 'ben@example.com'],
      allowedDomains: ['example.org'],
      provider: { issuer: provider.url, authorizationEndpoint: `${provider.url}/authorize`, tokenEndpoint: `${provider.url}/token`, jwksUri: `${provider.url}/jwks` },
    },
    keys,
  );
}

async function gatewayAt(options: Partial<HttpOptions>, extraTurtle: string[] = []) {
  const gateway = withSeed(extraTurtle, { developmentSignatures: true });
  const server = createGatewayServer(gateway, { developmentMode: false, ...options });
  return { gateway, url: await listen(server), close: () => server.close() };
}

const cookieFrom = (res: Response, name: string) =>
  res.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${name}=`))
    ?.split(';')[0];

/** Runs the whole sign-in as the provider would, and returns the session cookie, or the page's address after a refusal. */
async function signInAs(url: string, tamper: { state?: string } = {}) {
  const login = await fetch(`${url}/auth/login`, { redirect: 'manual' });
  expect(login.status).toBe(302);
  const to = new URL(login.headers.get('location')!);
  expect(to.origin + to.pathname).toBe(`${provider.url}/authorize`);
  expect(Object.fromEntries(to.searchParams)).toMatchObject({ client_id: CLIENT_ID, response_type: 'code', scope: 'openid email profile', code_challenge_method: 'S256', redirect_uri: 'https://lsh.example/auth/callback' });
  const flow = cookieFrom(login, 'lsh_signin')!;
  expect(login.headers.getSetCookie()[0]).toMatch(/HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
  const code = `code-${Math.random()}`;
  challenges.set(code, { challenge: to.searchParams.get('code_challenge')!, nonce: to.searchParams.get('nonce')! });
  const callback = await fetch(`${url}/auth/callback?code=${code}&state=${tamper.state ?? to.searchParams.get('state')}`, { headers: { cookie: flow }, redirect: 'manual' });
  expect(callback.status).toBe(302);
  return { session: cookieFrom(callback, 'lsh_session'), location: callback.headers.get('location')! };
}

describe('signing in with the deployment’s provider', () => {
  it('runs the code flow with PKCE, verifies the identity, and keeps a signed session the page never sees', async () => {
    const g = await gatewayAt({ signIn: signIn(), demoPersonas: true });
    try {
      expect((await fetch(`${g.url}/api/me`)).status).toBe(401);
      const { session, location } = await signInAs(g.url);
      expect(location).toBe('/');
      expect(session).toMatch(/^lsh_session=/);
      const me = await fetch(`${g.url}/api/me`, { headers: { cookie: session! } });
      expect(await me.json()).toEqual({ mode: 'demo', account: { email: 'paul@example.com', name: 'Paul Example' } });
      expect(me.headers.get('x-frame-options')).toBe('DENY');
      expect(me.headers.get('cache-control')).toBe('no-store');
    } finally {
      g.close();
    }
  });

  it('in a demo deployment, an account acts as any person, and its commits and audited reads record the account', async () => {
    const g = await gatewayAt({ signIn: signIn(), demoPersonas: true });
    try {
      const { session } = await signInAs(g.url);
      const as = { cookie: session!, 'x-lsh-person': 'person-ben', 'x-lsh-role': 'ClinicalDataManager' };
      expect((await fetch(`${g.url}/api/dev/people`, { headers: { cookie: session! } })).status).toBe(200);
      expect((await fetch(`${g.url}/api/todo`, { headers: as })).status).toBe(200);
      expect((await fetch(`${g.url}/api/objects/PT-03`, { headers: as })).status).toBe(200);
      const commit = await fetch(`${g.url}/api/objects/AE-003/methods/ReportToSafety`, {
        method: 'POST',
        headers: { ...as, 'content-type': 'application/json' },
        body: JSON.stringify({ inputs: { note: 'Seen at the week 4 visit.' } }),
      });
      expect(commit.status).toBe(201);
      expect(g.gateway.commits().at(-1)).toMatchObject({ person: `${NS.d}person-ben`, account: 'paul@example.com' });
      expect(g.gateway.reads().at(-1)).toMatchObject({ object: `${NS.d}PT-03`, account: 'paul@example.com' });
    } finally {
      g.close();
    }
  });

  it('otherwise, an account acts as the person with its email, in one of their roles, and nobody else', async () => {
    const ben = `@prefix p: <${NS.p}> . @prefix d: <${NS.d}> . d:person-ben p:email "Ben@Example.com" .`;
    const g = await gatewayAt({ signIn: signIn() }, [ben]);
    try {
      provider.issue = { email: 'ben@example.com', verified: true };
      const { session } = await signInAs(g.url);
      const me = await (await fetch(`${g.url}/api/me`, { headers: { cookie: session! } })).json();
      expect(me).toMatchObject({ mode: 'signed-in', account: { email: 'ben@example.com' }, person: { person: `${NS.d}person-ben`, name: 'Ben Okafor' } });
      expect((await fetch(`${g.url}/api/todo`, { headers: { cookie: session! } })).status).toBe(200);
      // Naming another person is ignored: the account is Ben. Naming a role he does not hold is refused.
      const other = await fetch(`${g.url}/api/todo`, { headers: { cookie: session!, 'x-lsh-person': 'person-chloe', 'x-lsh-role': 'DrugSafetyPhysician' } });
      expect(other.status).toBe(403);
      expect((await fetch(`${g.url}/api/dev/people`, { headers: { cookie: session! } })).status).toBe(404);

      provider.issue = { email: 'paul@example.com', verified: true };
      const { session: paul } = await signInAs(g.url);
      expect(await (await fetch(`${g.url}/api/me`, { headers: { cookie: paul! } })).json()).toEqual({ reasons: ['No person in the platform has the email paul@example.com.'] });
    } finally {
      provider.issue = { email: 'paul@example.com', verified: true };
      g.close();
    }
  });

  it('refuses accounts it does not allow, unverified emails, mismatched states and nonces, and says why on the page', async () => {
    const g = await gatewayAt({ signIn: signIn(), demoPersonas: true });
    try {
      provider.issue = { email: 'someone@elsewhere.com', verified: true };
      expect(await signInAs(g.url)).toEqual({ session: undefined, location: `/?signin=${encodeURIComponent('someone@elsewhere.com may not use this deployment.')}` });
      provider.issue = { email: 'anyone@example.org', verified: true };
      expect((await signInAs(g.url)).session).toBeDefined();
      provider.issue = { email: 'paul@example.com', verified: false };
      expect((await signInAs(g.url)).location).toContain(encodeURIComponent('no verified email'));
      provider.issue = { email: 'paul@example.com', verified: true, nonce: 'replayed' };
      expect((await signInAs(g.url)).location).toContain(encodeURIComponent('could not be verified'));
      provider.issue = { email: 'paul@example.com', verified: true };
      expect((await signInAs(g.url, { state: 'forged' })).location).toContain(encodeURIComponent('did not match'));
      const noFlow = await fetch(`${g.url}/auth/callback?code=x&state=y`, { redirect: 'manual' });
      expect(noFlow.headers.get('location')).toContain(encodeURIComponent('did not start here'));
    } finally {
      provider.issue = { email: 'paul@example.com', verified: true };
      g.close();
    }
  });

  it('refuses a tampered or ended session, and a change that is not JSON; sign-out ends the session', async () => {
    const g = await gatewayAt({ signIn: signIn(), demoPersonas: true });
    try {
      const { session } = await signInAs(g.url);
      const tampered = session!.slice(0, -4) + 'AAAA';
      expect((await fetch(`${g.url}/api/me`, { headers: { cookie: tampered } })).status).toBe(401);
      const form = await fetch(`${g.url}/api/objects/AE-003/methods/ReportToSafety`, {
        method: 'POST',
        headers: { cookie: session!, 'x-lsh-person': 'person-ben', 'x-lsh-role': 'ClinicalDataManager', 'content-type': 'application/x-www-form-urlencoded' },
        body: 'note=forged',
      });
      expect(form.status).toBe(415);
      const out = await fetch(`${g.url}/auth/logout`, { headers: { cookie: session! }, redirect: 'manual' });
      expect(out.headers.getSetCookie()[0]).toMatch(/^lsh_session=; .*Max-Age=0/);
    } finally {
      g.close();
    }
  });

  it('without sign-in or development mode, refuses everything but its health check', async () => {
    const g = await gatewayAt({});
    try {
      expect((await fetch(`${g.url}/api/todo`, { headers: { 'x-lsh-person': 'person-ben', 'x-lsh-role': 'ClinicalDataManager' } })).status).toBe(401);
      expect((await fetch(`${g.url}/api/me`)).status).toBe(401);
      expect(await (await fetch(`${g.url}/healthz`)).json()).toEqual({ ok: true });
    } finally {
      g.close();
    }
  });

  it('reads its settings from the environment, and will not run half-configured', () => {
    expect(signInFromEnvironment({})).toBeUndefined();
    expect(() => signInFromEnvironment({ LSH_OIDC_CLIENT_ID: 'x' })).toThrow('LSH_OIDC_CLIENT_SECRET is required');
    const env = { LSH_OIDC_CLIENT_ID: 'x', LSH_OIDC_CLIENT_SECRET: 'y', LSH_PUBLIC_URL: 'https://a.example', LSH_SESSION_SECRET: SECRET };
    expect(() => signInFromEnvironment(env)).toThrow('Allow at least one email address or domain');
    expect(() => signInFromEnvironment({ ...env, LSH_SESSION_SECRET: 'short', LSH_ACCESS_EMAILS: 'a@b.c' })).toThrow('at least 32 bytes');
    expect(signInFromEnvironment({ ...env, LSH_ACCESS_DOMAINS: 'example.org' })?.allows('X@Example.org')).toBe(true);
  });
});

describe('serving the page', () => {
  it('serves the built page from the same origin, falls back to it for the app’s paths, caches hashed assets, and keeps to its directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lsh-static-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>LS&H</title>');
    writeFileSync(join(dir, 'assets', 'app-1a2b.js'), 'console.log(1)');
    const g = await gatewayAt({ developmentMode: true, staticDir: dir });
    try {
      const page = await fetch(`${g.url}/`);
      expect(await page.text()).toContain('<title>LS&H</title>');
      expect(page.headers.get('cache-control')).toBe('no-cache');
      expect(page.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
      const asset = await fetch(`${g.url}/assets/app-1a2b.js`);
      expect(asset.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
      expect(asset.headers.get('cache-control')).toContain('immutable');
      expect(await (await fetch(`${g.url}/type/Batch`)).text()).toContain('<title>LS&H</title>');
      expect((await fetch(`${g.url}/..%2f..%2fetc%2fpasswd`)).status).toBe(404);
    } finally {
      g.close();
    }
  });
});
