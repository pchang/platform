import type { IncomingMessage } from 'node:http';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { GatewayError } from './gateway';

/**
 * Outside agents' tokens (platform spec 3.4, Outside agents, Authentication). The gateway is an OAuth 2.1 protected
 * resource: an agent gets an access token from the deployment's identity provider by the client credentials grant,
 * proving itself with a private key its own organization keeps, and sends it as a bearer token. The gateway checks the
 * token's signature against the provider's published keys, its issuer, its audience, its lifetime and its client, on
 * every request. Who the client is, and whether it may act now, the graph decides.
 */

/** The longest an access token may live, in seconds: a stolen one is worthless within minutes. */
export const MAX_TOKEN_SECONDS = 15 * 60;
/** Clock difference tolerated between the identity provider and the gateway, in seconds. */
const CLOCK_SKEW_SECONDS = 60;

export interface AgentTokenOptions {
  /** The identity provider that issues agents' tokens, as its tokens name it. */
  issuer: string;
  /** This gateway's resource identifier: the audience every token must be issued for, such as https://lsh.example.com/mcp. */
  audience: string;
  /** The identity provider's published keys. */
  jwksUri?: string;
  /** Keys given directly, instead of fetched; for tests. */
  keys?: JWTVerifyGetKey;
  /** The current time, for tests. */
  now?: () => Date;
}

export class AgentTokens {
  private readonly keys: JWTVerifyGetKey;

  constructor(private readonly options: AgentTokenOptions) {
    if (!options.keys && !options.jwksUri) throw new Error('Agent tokens need the identity provider’s keys: set a JWKS address');
    this.keys = options.keys ?? createRemoteJWKSet(new URL(options.jwksUri!));
  }

  /** The protected resource metadata (RFC 9728) that tells an agent where to get a token for this gateway. */
  metadata() {
    return {
      resource: this.options.audience,
      authorization_servers: [this.options.issuer],
      bearer_methods_supported: ['header'],
      resource_name: 'LS&H intelligence gateway',
    };
  }

  /** The bearer token of a request, if it carries one. */
  static bearer(req: IncomingMessage): string | undefined {
    const header = req.headers.authorization;
    if (typeof header !== 'string') return undefined;
    const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
    return match?.[1];
  }

  /**
   * The client a token was issued to, once the token is proven: signed by the identity provider, issued by it, for this
   * gateway, not expired, and living no longer than fifteen minutes. Refuses with 401 and the reason otherwise.
   */
  async clientOf(token: string): Promise<string> {
    const now = this.options.now?.() ?? new Date();
    let payload;
    try {
      ({ payload } = await jwtVerify(token, this.keys, {
        issuer: this.options.issuer,
        audience: this.options.audience,
        algorithms: ['RS256', 'PS256', 'ES256', 'EdDSA'],
        currentDate: now,
        clockTolerance: CLOCK_SKEW_SECONDS,
        requiredClaims: ['exp', 'iat'],
      }));
    } catch (error) {
      throw new GatewayError(401, [`The access token is not valid: ${error instanceof Error ? error.message : 'it could not be verified'}`]);
    }
    if (payload.exp! - payload.iat! > MAX_TOKEN_SECONDS) throw new GatewayError(401, ['The access token lives longer than fifteen minutes. Ask the identity provider for shorter-lived tokens.']);
    const client = [payload.client_id, payload.azp, payload.sub].find((c): c is string => typeof c === 'string' && c.length > 0);
    if (!client) throw new GatewayError(401, ['The access token names no client']);
    return client;
  }
}

/**
 * Agent tokens from the deployment's settings (deployment.md, Configuration): LSH_AGENT_TOKEN_ISSUER, LSH_AGENT_TOKEN_JWKS
 * and LSH_PUBLIC_URL, whose /mcp is the audience. Undefined when the deployment accepts no outside agents.
 */
export function agentTokensFromEnvironment(env = process.env): AgentTokens | undefined {
  const issuer = env.LSH_AGENT_TOKEN_ISSUER?.trim();
  const jwksUri = env.LSH_AGENT_TOKEN_JWKS?.trim();
  const publicUrl = env.LSH_PUBLIC_URL?.trim();
  if (!issuer && !jwksUri) return undefined;
  if (!issuer || !jwksUri || !publicUrl) throw new Error('Outside agents need LSH_AGENT_TOKEN_ISSUER, LSH_AGENT_TOKEN_JWKS and LSH_PUBLIC_URL together');
  return new AgentTokens({ issuer, jwksUri, audience: new URL('/mcp', publicUrl).toString() });
}
