import { askModelFromEnvironment } from './anthropicAsk';
import { drafterFromEnvironment } from './anthropicDrafter';
import { skillModelFromEnvironment } from './anthropicSkill';
import { searchModelFromEnvironment } from './anthropicSearch';
import { signInFromEnvironment } from './auth';
import { agentTokensFromEnvironment } from './agentTokens';
import { createGatewayServer } from './http';
import { openGateway } from './node';

/**
 * Starts the gateway with the ontology, the seed graph and its journal (deployment.md, Configuration).
 *   PORT or LSH_GATEWAY_PORT  port to listen on (default 8787; Cloud Run sets PORT)
 *   LSH_GATEWAY_JOURNAL  journal file (default var/journal.jsonl). Delete it to start again from the seed.
 *   LSH_GATEWAY_DEV=1    development mode, on one's own machine only: principals come from X-LSH-Person and X-LSH-Role headers
 *   LSH_OIDC_CLIENT_ID, LSH_OIDC_CLIENT_SECRET, LSH_PUBLIC_URL, LSH_SESSION_SECRET, LSH_ACCESS_EMAILS, LSH_ACCESS_DOMAINS
 *                        sign-in with Google (platform spec 3.4, Identity)
 *   LSH_DEMO_PERSONAS=1  a demo deployment with synthetic data: signed-in accounts act as any person; development signatures
 *   LSH_STATIC_DIR       the built page, served from the same origin (default: none)
 *   LSH_ANTHROPIC_API_KEY  connects Claude to draft, to understand searches and to answer questions (platform spec 3.4 and 5.2)
 *   LSH_AGENT_TOKEN_ISSUER, LSH_AGENT_TOKEN_JWKS  accept outside agents' access tokens from this identity provider, for the
 *                        audience LSH_PUBLIC_URL/mcp (platform spec 3.4, Outside agents)
 */
const port = Number(process.env.PORT ?? process.env.LSH_GATEWAY_PORT ?? 8787);
const journal = process.env.LSH_GATEWAY_JOURNAL ?? 'var/journal.jsonl';
const developmentMode = process.env.LSH_GATEWAY_DEV === '1';
const demoPersonas = process.env.LSH_DEMO_PERSONAS === '1';
const signIn = signInFromEnvironment();
const staticDir = process.env.LSH_STATIC_DIR?.trim() || undefined;
const agentTokens = agentTokensFromEnvironment();

// A deployment never runs open: outside development mode it needs sign-in (deployment.md, Configuration).
if (!developmentMode && !signIn) {
  console.error('Refusing to start: set LSH_OIDC_CLIENT_ID and the other sign-in settings, or LSH_GATEWAY_DEV=1 on your own machine.');
  process.exit(1);
}
if (developmentMode && signIn) {
  console.error('Refusing to start: development mode and sign-in are exclusive. Unset LSH_GATEWAY_DEV for a deployment.');
  process.exit(1);
}

const drafter = drafterFromEnvironment();
const searchModel = searchModelFromEnvironment();
const askModel = askModelFromEnvironment();
const skillModel = skillModelFromEnvironment();
// Development signatures are never valid; they are taken only on one's own machine or in a demo deployment (platform spec 3.4).
const gateway = openGateway(journal, { developmentSignatures: developmentMode || (Boolean(signIn) && demoPersonas), drafter, searchModel, askModel, skillModel });
const server = createGatewayServer(gateway, { developmentMode, signIn, demoPersonas, staticDir, agentTokens });
server.listen(port, () => {
  console.log(`LS&H gateway on http://localhost:${port} (HTTP at /api, MCP at /mcp${staticDir ? ', the page at /' : ''})`);
  const replayed = gateway.commits().length;
  console.log(`Journal: ${journal}. ${replayed} ${replayed === 1 ? 'commit' : 'commits'} replayed.`);
  console.log(drafter ? `Drafting with ${drafter.model}.` : 'No drafting model is connected: methods that produce drafts are refused.');
  console.log(searchModel ? `Searches understood by ${searchModel.model}.` : 'No search model is connected: searches are read against the ontology.');
  console.log(askModel ? `Questions answered by ${askModel.model}.` : 'No ask model is connected: questions are searched.');
  console.log(skillModel ? `Skills run by ${skillModel.model}.` : 'No skill model is connected: skills run their reference procedures.');
  console.log(agentTokens ? `Outside agents: tokens from ${agentTokens.metadata().authorization_servers[0]}.` : 'No outside agents: no token issuer is set.');
  console.log(
    signIn
      ? `Sign-in with Google${demoPersonas ? ', demo deployment: accounts act as any person, and nothing here is real data' : ''}.`
      : 'Development mode: principals come from request headers. Never use this with real data.',
  );
});
