/**
 * MCP server factory for adzuna-mcp. Constructs an AdzunaClient,
 * registers each tool against an McpServer instance, and returns the
 * configured server. Knows nothing about transports: the two entry
 * points (index.stdio.js, index.http.js) import this and wrap the
 * returned server in their respective transport. Each tool handler
 * stays a `(args, client)` function for testability; the closure
 * happens inline in the registration loop.
 */

import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import AdzunaClient from './adzuna-client.js';
import * as searchJobs from './tools/search-jobs.js';

// package.json is read via fs rather than `import ... assert/with`
// because no single import-attribute syntax covers our declared
// engines.node ">=20.0.0" range: `assert` works on Node 20 but is a
// SyntaxError on Node 22+, while `with` works on Node 22+ but not
// on Node 20. Same reasoning as reed-mcp.
const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const TOOLS = [searchJobs];

/**
 * Create an MCP server pre-configured with adzuna-mcp's tools. The
 * returned server has no transport attached; entry points wrap it
 * before connecting.
 *
 * @param {object} options
 * @param {string} options.appId - Adzuna application ID. Required.
 * @param {string} options.appKey - Adzuna application key. Required.
 * @param {string} [options.country] - ISO country code, passed through
 *   to AdzunaClient. Defaults to `gb` inside the client when undefined.
 *   Exposed at this layer so entry points can plumb it through later
 *   (e.g., via an `ADZUNA_COUNTRY` env var) without re-wiring.
 * @returns {McpServer} Configured server, ready to be wrapped in a
 *   transport.
 */
export function createServer({ appId, appKey, country }) {
  const client = new AdzunaClient({ appId, appKey, country });
  const server = new McpServer({ name: pkg.name, version: pkg.version });

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.schema },
      (args) => tool.handler(args, client),
    );
  }

  return server;
}
