#!/usr/bin/env node
/**
 * stdio entry point for adzuna-mcp and the bin target for
 * `npx adzuna-mcp`. Reads ADZUNA_APP_ID and ADZUNA_APP_KEY from env,
 * constructs the server via createServer(), wraps it in
 * StdioServerTransport, and connects. Local MCP clients launch this
 * file as a subprocess and speak MCP over its stdin/stdout.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

// stdout is reserved for the MCP JSON-RPC protocol; all diagnostic
// output goes to stderr (console.error). Never console.log here.

const appId = process.env.ADZUNA_APP_ID;
const appKey = process.env.ADZUNA_APP_KEY;

if (!appId || !appKey) {
  console.error(
    'ADZUNA_APP_ID and ADZUNA_APP_KEY environment variables are both required.',
  );
  console.error('Register for credentials at https://developer.adzuna.com/signup');
  process.exit(1);
}

const server = createServer({ appId, appKey });
const transport = new StdioServerTransport();

try {
  await server.connect(transport);
} catch (error) {
  console.error('Failed to start adzuna-mcp stdio server:', error);
  process.exit(1);
}
