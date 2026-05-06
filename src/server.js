/**
 * MCP server factory. Creates an McpServer instance, registers both tools
 * (search_jobs, get_job_details), and returns the configured server. Knows
 * nothing about transports: the two entry points (index.stdio.js,
 * index.http.js) import this and wrap it in their respective transport. The
 * Reed client is constructed here and closed over per-tool so each tool's
 * handler stays (args, client) for testability.
 */

import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import ReedClient from './reed-client.js';
import * as searchJobs from './tools/search-jobs.js';
import * as getJobDetails from './tools/get-job-details.js';

// package.json read via fs rather than `import ... with/assert { type: 'json' }`
// because no single import-attribute syntax covers our declared engines.node
// ">=20.0.0" range: `assert` works on Node 20 but is a SyntaxError on Node 22+,
// `with` works on Node 22+ but not on Node 20.
const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const TOOLS = [searchJobs, getJobDetails];

/**
 * Create an MCP server pre-configured with reed-mcp's tools. The returned
 * server has no transport attached; entry points wrap it before listening.
 *
 * @param {object} options
 * @param {string} options.apiKey - Reed API key used to construct the
 *   ReedClient that all tool handlers share via closure capture.
 * @returns {McpServer} Configured server, ready to be wrapped in a transport.
 */
export function createServer({ apiKey }) {
  const client = new ReedClient({ apiKey });
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
