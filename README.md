# reed-mcp

Model Context Protocol server for the [Reed.co.uk](https://www.reed.co.uk) Jobseeker API. Search and retrieve UK job listings from inside any MCP-compatible AI assistant: Claude Desktop, Claude.ai web, Cursor, Windsurf, ChatGPT, Codex CLI, and more.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https%3A%2F%2Fgithub.com%2Fsoss-lesig%2Freed-mcp)

Two transports from a single codebase:

- **stdio** for local clients (CLI and desktop apps that launch the server as a subprocess).
- **Streamable HTTP** for web clients (Claude.ai web custom connectors, ChatGPT custom MCP).

Bring your own Reed API key. Get one in about thirty seconds at <https://www.reed.co.uk/developers/Jobseeker> (one email confirmation, no account, no dashboard).

## Quick start

### Local clients (stdio)

Add to your client's MCP config. For Claude Desktop, that's `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "reed-mcp": {
      "command": "npx",
      "args": ["reed-mcp"],
      "env": {
        "REED_API_KEY": "your-key-here"
      }
    }
  }
}
```

Restart your client and `search_jobs` / `get_job_details` should appear in the tool list.

### Web clients (HTTP)

Click **Deploy on Railway** above. Railway clones the repo, builds via the Dockerfile, and gives you a public HTTPS URL in about ninety seconds. Set `REED_API_KEY` in the Railway dashboard.

Then in Claude.ai web: Settings → Connectors → Add custom → paste the Railway URL with `/mcp` on the end (e.g. `https://your-app.up.railway.app/mcp`).

For Docker, manual hosting, and other deployment options, see [`docs/deploy.md`](https://github.com/soss-lesig/reed-mcp/blob/main/docs/deploy.md).

## Tools

- **`search_jobs`** — search Reed by keyword, location, salary, contract type, and more. At least one of `keywords` or `locationName` is required to keep queries bounded.
- **`get_job_details`** — fetch the full details (including the complete description) for a single job by ID.

## Configuration

| Variable | Required | Default | Notes |
|---|---|---|---|
| `REED_API_KEY` | yes | — | <https://www.reed.co.uk/developers/Jobseeker> |
| `PORT` | no | `3000` | HTTP transport only. Railway and most platforms inject this automatically. |
| `ALLOWED_ORIGINS` | no | `https://claude.ai,http://localhost` | HTTP transport only. Comma-separated allowlist for the `Origin` header on `POST /mcp` (DNS rebinding protection per the MCP spec). |

For local development, copy `.env.example` to `.env` and fill in your key.

## Requirements

Node 20 or newer. npm 11+ for development if you want supply-chain hygiene via `min-release-age`.

## Prior art

[`@kld3v/reed_jobs_mcp`](https://github.com/kld3v/reed_jobs_mcp) covers the same Reed API with a stdio-only TypeScript implementation distributed via Smithery. reed-mcp differs by supporting both stdio and Streamable HTTP transports, which means it works with web-based MCP clients (Claude.ai, ChatGPT) in addition to local CLI/desktop ones.

## License

MIT. See [LICENSE](LICENSE).
