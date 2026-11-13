import { drafterFromEnvironment } from './anthropicDrafter';
import { searchModelFromEnvironment } from './anthropicSearch';
import { createGatewayServer } from './http';
import { openGateway } from './node';

/**
 * Starts the gateway with the ontology, the seed graph and its journal.
 *   LSH_GATEWAY_PORT     port to listen on (default 8787)
 *   LSH_GATEWAY_JOURNAL  journal file (default var/journal.jsonl). Delete it to start again from the seed.
 *   LSH_GATEWAY_DEV=1    development mode: principals come from X-LSH-Person and X-LSH-Role headers
 *   LSH_ANTHROPIC_API_KEY  connects Claude to draft and to understand searches (platform spec 3.4 and 5.2)
 */
const port = Number(process.env.LSH_GATEWAY_PORT ?? 8787);
const journal = process.env.LSH_GATEWAY_JOURNAL ?? 'var/journal.jsonl';
const developmentMode = process.env.LSH_GATEWAY_DEV === '1';

const drafter = drafterFromEnvironment();
const searchModel = searchModelFromEnvironment();
const gateway = openGateway(journal, { developmentSignatures: developmentMode, drafter, searchModel });
const server = createGatewayServer(gateway, { developmentMode });
server.listen(port, () => {
  console.log(`LS&H gateway on http://localhost:${port} (HTTP at /api, MCP at /mcp)`);
  const replayed = gateway.commits().length;
  console.log(`Journal: ${journal}. ${replayed} ${replayed === 1 ? 'commit' : 'commits'} replayed.`);
  console.log(drafter ? `Drafting with ${drafter.model}.` : 'No drafting model is connected: methods that produce drafts are refused.');
  console.log(searchModel ? `Searches understood by ${searchModel.model}.` : 'No search model is connected: searches are read against the ontology.');
  console.log(
    developmentMode
      ? 'Development mode: principals come from request headers. Never use this with real data.'
      : 'No identity provider is connected, so every request will be refused. Set LSH_GATEWAY_DEV=1 for development.',
  );
});
