// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createLocalJWKSet, exportJWK, exportPKCS8, generateKeyPair, jwtVerify, SignJWT, type CryptoKey, type JWK } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NS } from '../ontology/ontology';
import { connect } from '../../examples/northbridge-agent/connect';
import { loadSiteRecords } from '../../examples/northbridge-agent/records';
import { scriptedWork } from '../../examples/northbridge-agent/work';
import { AgentTokens } from './agentTokens';
import { handle, type HttpOptions } from './http';
import { withSeed } from './node';

// The example outside agent (platform spec 3.4, Outside agents; domain spec section 10, External agent), end to end over
// HTTP: Northbridge's program gets a token with its own private key from an identity provider, connects to the gateway's
// MCP endpoint, and does its work. The identity provider is a small one made for the test; the gateway and the agent are
// the real ones. The scripted fallback runs here, as no model is connected.
vi.setConfig({ testTimeout: 90_000 });

const servers: Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

async function listen(handler: Parameters<typeof createServer>[1]): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/**
 * An identity provider that issues tokens by the client credentials grant, authenticated by private key JWT: it knows the
 * client's public key only, checks the client's signed assertion, and signs a ten-minute token for the resource asked.
 */
async function identityProvider(clientId: string, clientPublicKey: JWK) {
  const signing = await generateKeyPair('ES256');
  const published = { keys: [{ ...(await exportJWK(signing.publicKey)), kid: 'idp-1', alg: 'ES256' }] };
  const clientKeys = createLocalJWKSet({ keys: [{ ...clientPublicKey, alg: 'ES256' }] });
  let base = '';
  const issued: string[] = [];
  base = await listen(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const form = new URLSearchParams(Buffer.concat(chunks).toString());
    try {
      if (form.get('grant_type') !== 'client_credentials') throw new Error('unsupported grant');
      await jwtVerify(form.get('client_assertion') ?? '', clientKeys, { issuer: clientId, subject: clientId, audience: `${base}/token` });
      const token = await new SignJWT({ client_id: clientId })
        .setProtectedHeader({ alg: 'ES256', kid: 'idp-1' })
        .setIssuer(base)
        .setAudience(form.get('resource') ?? '')
        .setIssuedAt()
        .setExpirationTime('10m')
        .sign(signing.privateKey as CryptoKey);
      issued.push(token);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ access_token: token, token_type: 'Bearer', expires_in: 600 }));
    } catch (error) {
      res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'invalid_client', error_description: (error as Error).message }));
    }
  });
  return { issuer: base, tokenEndpoint: `${base}/token`, keys: createLocalJWKSet(published), issued };
}

describe('Northbridge’s query agent', () => {
  it('gets a token with its own key, connects, answers the open queries it has records for and proposes closing them', async () => {
    const northbridgeKey = await generateKeyPair('ES256', { extractable: true });
    const idp = await identityProvider('northbridge-query-agent', await exportJWK(northbridgeKey.publicKey));
    const gateway = withSeed();
    let options: HttpOptions = { developmentMode: false };
    const gatewayUrl = await listen((req, res) => void handle(gateway, options, req, res));
    options = { developmentMode: false, agentTokens: new AgentTokens({ issuer: idp.issuer, audience: `${gatewayUrl}/mcp`, keys: idp.keys }) };

    const client = await connect({
      kind: 'token',
      gateway: gatewayUrl,
      tokens: { tokenEndpoint: idp.tokenEndpoint, clientId: 'northbridge-query-agent', privateKeyPem: await exportPKCS8(northbridgeKey.privateKey) },
    });
    const report = await scriptedWork(client, loadSiteRecords());
    await client.close();

    expect(report.by).toContain('scripted fallback');
    expect(report.lines).toEqual([
      'Q-01: answered from the site record for DR-005.',
      'Q-03: answered from the site record for DR-015.',
      'Q-01: proposed closing it (AgentProposal-2), for Mira Castellanos to confirm.',
      'Q-03: proposed closing it (AgentProposal-3), for Mira Castellanos to confirm.',
      expect.stringMatching(/^Q-04: not closed: .*AgentProposal-1 already proposes this and waits for a decision/),
      'Q-05: answered, but no Northbridge site record backs the answer; not closing it.',
      'Q-06: answered, but no Northbridge site record backs the answer; not closing it.',
    ]);
    // One token served the whole run; the third site's open query never existed for the agent.
    expect(idp.issued).toHaveLength(1);
    const ben = { person: `${NS.d}person-ben`, role: `${NS.ls}ClinicalDataManager` };
    expect(gateway.read(ben, 'Q-02').state.Status).toBe('open');
    expect(gateway.read(ben, 'Q-01').properties.answer).toContain('mg/dL');
    // Recorded as the agent, with the version it declared, its reason and who answers for it.
    const [first] = gateway.commits();
    expect(first).toMatchObject({ person: `${NS.d}agent-northbridge`, method: `${NS.ls}AnswerQuery` });
  });

  it('cannot get a token without Northbridge’s private key', async () => {
    const northbridgeKey = await generateKeyPair('ES256', { extractable: true });
    const impostorKey = await generateKeyPair('ES256', { extractable: true });
    const idp = await identityProvider('northbridge-query-agent', await exportJWK(northbridgeKey.publicKey));
    const gateway = withSeed();
    let options: HttpOptions = { developmentMode: false };
    const gatewayUrl = await listen((req, res) => void handle(gateway, options, req, res));
    options = { developmentMode: false, agentTokens: new AgentTokens({ issuer: idp.issuer, audience: `${gatewayUrl}/mcp`, keys: idp.keys }) };
    await expect(
      connect({ kind: 'token', gateway: gatewayUrl, tokens: { tokenEndpoint: idp.tokenEndpoint, clientId: 'northbridge-query-agent', privateKeyPem: await exportPKCS8(impostorKey.privateKey) } }),
    ).rejects.toThrow(/refused a token: 401/);
    expect(gateway.commits()).toEqual([]);
  });
});
