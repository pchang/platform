import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { readFileSync } from 'node:fs';
import { importPKCS8, SignJWT } from 'jose';

/**
 * How Northbridge's query agent reaches a sponsor's gateway (platform spec 3.4, Outside agents). This is Northbridge's
 * program, not the platform's: it uses only public packages and the gateway's published interface.
 *
 * It gets an access token from the sponsor's identity provider by the client credentials grant, proving itself with a
 * private key Northbridge keeps (private key JWT, RFC 7523). Tokens last minutes, so it asks for a new one shortly before
 * the last expires, and sends it as a bearer token on every request to the gateway's MCP endpoint.
 */

/** What the agent says it is when it connects: the gateway records this name and version with everything it does. */
export const AGENT = { name: 'northbridge-query-agent', version: '1.4.0' };

export interface TokenSettings {
  /** The identity provider's token endpoint. */
  tokenEndpoint: string;
  /** The agent's client identifier at the identity provider, as the sponsor registered it. */
  clientId: string;
  /** Northbridge's private key for this client, PKCS #8 PEM. It never leaves Northbridge. */
  privateKeyPem: string;
  /** The key's algorithm, such as ES256 or RS256. */
  algorithm?: string;
  /** The gateway's resource identifier, the audience the token is for: its /mcp address. */
  resource: string;
}

/** Asks the identity provider for a token, signing a short client assertion with Northbridge's private key. */
async function requestToken(settings: TokenSettings): Promise<{ token: string; expiresAt: number }> {
  const algorithm = settings.algorithm ?? 'ES256';
  const key = await importPKCS8(settings.privateKeyPem, algorithm);
  const assertion = await new SignJWT({})
    .setProtectedHeader({ alg: algorithm })
    .setIssuer(settings.clientId)
    .setSubject(settings.clientId)
    .setAudience(settings.tokenEndpoint)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(key);
  const response = await fetch(settings.tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
      resource: settings.resource,
    }),
  });
  if (!response.ok) throw new Error(`The identity provider refused a token: ${response.status} ${await response.text()}`);
  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error('The identity provider sent no access token');
  return { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 300) * 1000 };
}

/** A fetch that carries a current bearer token, renewed a minute before it expires. */
export function tokenFetch(settings: TokenSettings): typeof fetch {
  let current: { token: string; expiresAt: number } | undefined;
  return async (input, init) => {
    if (!current || current.expiresAt - Date.now() < 60_000) current = await requestToken(settings);
    const headers = new Headers(init?.headers);
    headers.set('authorization', `Bearer ${current.token}`);
    return fetch(input, { ...init, headers });
  };
}

export type Connection =
  /** A deployment: tokens from the sponsor's identity provider. */
  | { kind: 'token'; gateway: string; tokens: Omit<TokenSettings, 'resource'> }
  /** A gateway in development mode on one's own machine: the agent is named in headers, with no proof. Never with real data. */
  | { kind: 'development'; gateway: string; agent: string; role: string };

/** Connects to the gateway's MCP endpoint as the agent. */
export async function connect(connection: Connection): Promise<Client> {
  const url = new URL('/mcp', connection.gateway);
  const transport =
    connection.kind === 'token'
      ? new StreamableHTTPClientTransport(url, { fetch: tokenFetch({ ...connection.tokens, resource: url.toString() }) })
      : new StreamableHTTPClientTransport(url, { requestInit: { headers: { 'x-lsh-person': connection.agent, 'x-lsh-role': connection.role } } });
  const client = new Client(AGENT);
  await client.connect(transport);
  return client;
}

/** The connection from the environment: NB_GATEWAY_URL, then either NB_TOKEN_ENDPOINT, NB_CLIENT_ID and NB_PRIVATE_KEY_FILE, or NB_DEVELOPMENT=1. */
export function connectionFromEnvironment(env = process.env): Connection {
  const gateway = env.NB_GATEWAY_URL?.trim() || 'http://localhost:8787';
  if (env.NB_DEVELOPMENT === '1') return { kind: 'development', gateway, agent: 'agent-northbridge', role: 'ExternalCROAgent' };
  const tokenEndpoint = env.NB_TOKEN_ENDPOINT?.trim();
  const clientId = env.NB_CLIENT_ID?.trim();
  const keyFile = env.NB_PRIVATE_KEY_FILE?.trim();
  if (!tokenEndpoint || !clientId || !keyFile) {
    throw new Error('Set NB_TOKEN_ENDPOINT, NB_CLIENT_ID and NB_PRIVATE_KEY_FILE, or NB_DEVELOPMENT=1 for a gateway in development mode on your own machine.');
  }
  return { kind: 'token', gateway, tokens: { tokenEndpoint, clientId, privateKeyPem: readFileSync(keyFile, 'utf8'), algorithm: env.NB_KEY_ALGORITHM?.trim() || undefined } };
}
