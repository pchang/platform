import { connect, connectionFromEnvironment } from './connect';
import { loadSiteRecords } from './records';
import { modelWork, scriptedWork } from './work';

/**
 * Northbridge CRO's query agent: an example of an outside organization bringing its own agent to the platform (platform
 * spec 3.4, Outside agents; domain spec section 10, External agent). Run it with:
 *
 *   npx tsx examples/northbridge-agent/main.ts
 *
 * Settings, all Northbridge's own:
 *   NB_GATEWAY_URL         the sponsor's gateway (default http://localhost:8787)
 *   NB_TOKEN_ENDPOINT, NB_CLIENT_ID, NB_PRIVATE_KEY_FILE, NB_KEY_ALGORITHM
 *                          how it gets tokens from the sponsor's identity provider
 *   NB_DEVELOPMENT=1       for a gateway in development mode on your own machine instead: no tokens, never real data
 *   NB_ANTHROPIC_API_KEY   Northbridge's Claude API key. Without it, the scripted fallback runs, and says so.
 *   NB_MODEL               the Claude model (default claude-opus-5-5)
 */
const client = await connect(connectionFromEnvironment());
try {
  const records = loadSiteRecords();
  const apiKey = process.env.NB_ANTHROPIC_API_KEY?.trim();
  const report = apiKey ? await modelWork(client, records, { apiKey, model: process.env.NB_MODEL?.trim() || undefined }) : await scriptedWork(client, records);
  console.log(`Northbridge query agent, run by ${report.by}:`);
  for (const line of report.lines) console.log(`- ${line}`);
} finally {
  await client.close();
}
