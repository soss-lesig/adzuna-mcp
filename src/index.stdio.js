#!/usr/bin/env node
/**
 * stdio entry point for reed-mcp and the bin target for `npx reed-mcp`.
 * Reads REED_API_KEY from env, constructs the server via createServer(),
 * wraps it in StdioServerTransport, and connects. Local MCP clients launch
 * this file as a subprocess and speak MCP over its stdin/stdout.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

// stdout is reserved for the MCP JSON-RPC protocol; all diagnostic output
// goes to stderr (console.error). Never console.log here.

const apiKey = process.env.REED_API_KEY;
if (!apiKey) {
  console.error('REED_API_KEY environment variable is required.');
  console.error('Get one at https://www.reed.co.uk/developers/Jobseeker');
  process.exit(1);
}

const server = createServer({ apiKey });
const transport = new StdioServerTransport();

try {
  await server.connect(transport);
} catch (error) {
  console.error('Failed to start reed-mcp stdio server:', error);
  process.exit(1);
}
