import { Gateway } from './gateway';
import { createGatewayServer } from './http';

/**
 * Starts the gateway with the ontology and the seed graph, in memory.
 *   LSH_GATEWAY_PORT   port to listen on (default 8787)
 *   LSH_GATEWAY_DEV=1  development mode: principals come from X-LSH-Person and X-LSH-Role headers
 */
const port = Number(process.env.LSH_GATEWAY_PORT ?? 8787);
const developmentMode = process.env.LSH_GATEWAY_DEV === '1';

const server = createGatewayServer(Gateway.withSeed(), { developmentMode });
server.listen(port, () => {
  console.log(`LS&H gateway on http://localhost:${port} (HTTP at /api, MCP at /mcp)`);
  console.log(
    developmentMode
      ? 'Development mode: principals come from request headers. Never use this with real data.'
      : 'No identity provider is connected, so every request will be refused. Set LSH_GATEWAY_DEV=1 for development.',
  );
});
