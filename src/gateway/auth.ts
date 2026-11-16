import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTVerifyGetKey } from 'jose';
import { GatewayError } from './gateway';

/**
 * Sign-in (platform spec 3.4, Identity): the gateway runs the OpenID Connect authorization code flow with PKCE against the
 * provider, verifies its ID token, and keeps a signed session in an HttpOnly cookie. The page never holds a token.
 */

export interface OidcProvider {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
}

/** Google's endpoints, from its published discovery document (https://accounts.google.com/.well-known/openid-configuration). */
export const GOOGLE: OidcProvider = {
  issuer: 'https://accounts.google.com',
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
};

export interface SignInOptions {
  clientId: string;
  clientSecret: string;
  /** The service's own address, such as https://example.run.app, for the redirect back from the provider. */
  publicUrl: string;
  /** Signs session cookies; at least 32 bytes. */
  sessionSecret: string;
  /** Who may sign in: exact addresses, and whole email domains. */
  allowedEmails: string[];
  allowedDomains: string[];
  provider?: OidcProvider;
  /** How long a session lasts, in seconds; at most eight hours. */
  sessionSeconds?: number;
  now?: () => Date;
}

/** The signed-in account a request carries. */
export interface Account {
  email: string;
  name: string;
}

const SESSION_COOKIE = 'lsh_session';
const FLOW_COOKIE = 'lsh_signin';
const EIGHT_HOURS = 8 * 60 * 60;
/** The flow cookie lives as long as a person might take on the provider's sign-in page. */
const TEN_MINUTES = 10 * 60;

const base64url = (bytes: Buffer) => bytes.toString('base64url');

function cookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie ?? '';
  return Object.fromEntries(
    header
      .split(';')
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        const at = c.indexOf('=');
        return at < 0 ? [c, ''] : [c.slice(0, at), decodeURIComponent(c.slice(at + 1))];
      }),
  );
}

/** A cookie for this service only: HttpOnly, Secure when served over HTTPS, and sent on top-level navigations only. */
function cookie(name: string, value: string, maxAge: number, secure: boolean): string {
  return [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`, ...(secure ? ['Secure'] : [])].join('; ');
}

export class SignIn {
  private readonly provider: OidcProvider;
  private readonly key: Uint8Array;
  private readonly keys: JWTVerifyGetKey;
  private readonly secure: boolean;
  private readonly sessionSeconds: number;

  constructor(private readonly options: SignInOptions, keys?: JWTVerifyGetKey) {
    if (Buffer.byteLength(options.sessionSecret) < 32) throw new Error('The session secret must be at least 32 bytes');
    if (!options.allowedEmails.length && !options.allowedDomains.length) throw new Error('Allow at least one email address or domain to sign in');
    this.provider = options.provider ?? GOOGLE;
    this.key = new TextEncoder().encode(options.sessionSecret);
    this.keys = keys ?? createRemoteJWKSet(new URL(this.provider.jwksUri));
    this.secure = options.publicUrl.startsWith('https://');
    this.sessionSeconds = Math.min(options.sessionSeconds ?? EIGHT_HOURS, EIGHT_HOURS);
  }

  private get redirectUri() {
    return new URL('/auth/callback', this.options.publicUrl).toString();
  }

  private now() {
    return this.options.now?.() ?? new Date();
  }

  /** Sends the person to the provider, with a fresh state, nonce and PKCE verifier kept in a short-lived signed cookie. */
  async start(res: ServerResponse) {
    const state = base64url(randomBytes(24));
    const nonce = base64url(randomBytes(24));
    const verifier = base64url(randomBytes(48));
    const challenge = base64url(createHash('sha256').update(verifier).digest());
    const flow = await new SignJWT({ state, nonce, verifier })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(this.now())
      .setExpirationTime(Math.floor(this.now().getTime() / 1000) + TEN_MINUTES)
      .sign(this.key);
    const url = new URL(this.provider.authorizationEndpoint);
    url.search = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();
    res.writeHead(302, { location: url.toString(), 'set-cookie': cookie(FLOW_COOKIE, flow, TEN_MINUTES, this.secure), 'cache-control': 'no-store' });
    res.end();
  }

  /** Completes the flow: checks the state, exchanges the code, verifies the ID token and the account, and starts a session. */
  async finish(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://gateway');
    const flowToken = cookies(req)[FLOW_COOKIE];
    if (!flowToken) throw new GatewayError(400, ['The sign-in expired or did not start here. Sign in again.']);
    let flow: { state: string; nonce: string; verifier: string };
    try {
      flow = (await jwtVerify(flowToken, this.key, { currentDate: this.now() })).payload as typeof flow;
    } catch {
      throw new GatewayError(400, ['The sign-in expired or did not start here. Sign in again.']);
    }
    if (url.searchParams.get('error')) throw new GatewayError(401, ['The sign-in was cancelled or refused by the provider.']);
    const code = url.searchParams.get('code');
    if (!code || url.searchParams.get('state') !== flow.state) throw new GatewayError(400, ['The sign-in did not match. Sign in again.']);

    const exchanged = await fetch(this.provider.tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        code_verifier: flow.verifier,
      }),
    });
    if (!exchanged.ok) throw new GatewayError(401, ['The provider did not accept the sign-in. Sign in again.']);
    const { id_token: idToken } = (await exchanged.json()) as { id_token?: string };
    if (!idToken) throw new GatewayError(401, ['The provider returned no identity. Sign in again.']);

    let claims: { email?: unknown; email_verified?: unknown; name?: unknown; nonce?: unknown };
    try {
      claims = (await jwtVerify(idToken, this.keys, { issuer: this.provider.issuer, audience: this.options.clientId, currentDate: this.now() })).payload as typeof claims;
    } catch {
      throw new GatewayError(401, ['The identity could not be verified. Sign in again.']);
    }
    if (claims.nonce !== flow.nonce) throw new GatewayError(401, ['The identity could not be verified. Sign in again.']);
    if (typeof claims.email !== 'string' || claims.email_verified !== true) throw new GatewayError(403, ['The account has no verified email address.']);
    const email = claims.email.toLowerCase();
    if (!this.allows(email)) throw new GatewayError(403, [`${email} may not use this deployment.`]);

    const session = await new SignJWT({ email, name: typeof claims.name === 'string' ? claims.name : email })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(this.now())
      .setExpirationTime(Math.floor(this.now().getTime() / 1000) + this.sessionSeconds)
      .sign(this.key);
    res.writeHead(302, {
      location: '/',
      'set-cookie': [cookie(SESSION_COOKIE, session, this.sessionSeconds, this.secure), cookie(FLOW_COOKIE, '', 0, this.secure)],
      'cache-control': 'no-store',
    });
    res.end();
  }

  /** Ends the session. */
  signOut(res: ServerResponse) {
    res.writeHead(302, { location: '/', 'set-cookie': cookie(SESSION_COOKIE, '', 0, this.secure), 'cache-control': 'no-store' });
    res.end();
  }

  /** The account a request is signed in as, or undefined when it has no valid session. */
  async account(req: IncomingMessage): Promise<Account | undefined> {
    const token = cookies(req)[SESSION_COOKIE];
    if (!token) return undefined;
    try {
      const { payload } = await jwtVerify(token, this.key, { currentDate: this.now() });
      if (typeof payload.email !== 'string' || !this.allows(payload.email)) return undefined;
      return { email: payload.email, name: typeof payload.name === 'string' ? payload.name : payload.email };
    } catch {
      return undefined;
    }
  }

  /** Whether an address may use the deployment: listed itself, or in a listed domain. */
  allows(email: string): boolean {
    const address = email.toLowerCase();
    const domain = address.split('@')[1] ?? '';
    return this.options.allowedEmails.some((e) => e.toLowerCase() === address) || this.options.allowedDomains.some((d) => d.toLowerCase() === domain);
  }
}

/** Sign-in from the deployment's environment (deployment.md, Configuration), or undefined when it is not configured. */
export function signInFromEnvironment(env: Record<string, string | undefined> = process.env): SignIn | undefined {
  const clientId = env.LSH_OIDC_CLIENT_ID?.trim();
  if (!clientId) return undefined;
  const list = (value?: string) => (value ?? '').split(',').map((v) => v.trim()).filter(Boolean);
  const required = (name: string) => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`${name} is required when LSH_OIDC_CLIENT_ID is set`);
    return value;
  };
  return new SignIn({
    clientId,
    clientSecret: required('LSH_OIDC_CLIENT_SECRET'),
    publicUrl: required('LSH_PUBLIC_URL'),
    sessionSecret: required('LSH_SESSION_SECRET'),
    allowedEmails: list(env.LSH_ACCESS_EMAILS),
    allowedDomains: list(env.LSH_ACCESS_DOMAINS),
  });
}
