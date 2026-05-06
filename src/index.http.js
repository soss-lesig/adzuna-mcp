/**
 * Streamable HTTP transport entry point for reed-mcp. Mounts a stateless
 * `POST /mcp` endpoint on Express that wraps a fresh McpServer in a fresh
 * StreamableHTTPServerTransport per request. Reads PORT (Railway injects
 * this; defaults to 3000) and REED_API_KEY (required) from env. Origin
 * header is validated against an allowlist on every /mcp request.
 */

import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';

const apiKey = process.env.REED_API_KEY;
if (!apiKey) {
  console.error('REED_API_KEY environment variable is required.');
  console.error('Get one at https://www.reed.co.uk/developers/Jobseeker');
  process.exit(1);
}

const PORT = process.env.PORT || 3000;

// Origin allowlist for DNS rebinding protection (MCP spec recommendation).
// Default allows Claude.ai and any localhost port for local development.
// Operators can override or extend via ALLOWED_ORIGINS=comma,separated,list.
// See DECISIONS.md (2026-05-05, origin allowlist) for the reasoning.
const DEFAULT_ALLOWED_ORIGINS = ['https://claude.ai', 'http://localhost'];
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : DEFAULT_ALLOWED_ORIGINS;

/**
 * Check whether an Origin header value is in the allowlist. Uses
 * boundary-aware prefix matching so that `http://localhost.evil.com` cannot
 * pass via a literal `http://localhost` allow entry.
 *
 * @param {string|undefined} origin - Origin header value, or undefined.
 * @returns {boolean} True if allowed (or if no Origin was sent at all).
 */
function isOriginAllowed(origin) {
  if (!origin) return true; // server-to-server callers do not send Origin
  return allowedOrigins.some(
    (allowed) =>
      origin === allowed ||
      origin.startsWith(`${allowed}:`) ||
      origin.startsWith(`${allowed}/`),
  );
}

const app = express();
app.use(express.json());

// "What is this" response for / so health pings (e.g. Railway during deploy)
// get a 200 with useful info, not a 404.
app.get('/', (req, res) => {
  res.json({
    name: 'reed-mcp',
    transport: 'streamable-http',
    endpoint: '/mcp',
  });
});

app.post('/mcp', async (req, res) => {
  const origin = req.get('origin');
  if (!isOriginAllowed(origin)) {
    res.status(403).json({ error: `Origin ${origin} not allowed` });
    return;
  }

  try {
    // Stateless: fresh server and transport per request, no session ID.
    // See DECISIONS.md (2026-05-05, HTTP transport stateless mode).
    const server = createServer({ apiKey });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on('close', () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

app.listen(PORT, () => {
  console.error(`reed-mcp HTTP transport listening on port ${PORT}`);
});
