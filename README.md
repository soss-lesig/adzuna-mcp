# adzuna-mcp

Model Context Protocol server for the [Adzuna](https://www.adzuna.co.uk) jobs API. Search UK job listings from inside any MCP-compatible AI assistant: Claude Desktop, Claude.ai web, Cursor, Windsurf, ChatGPT, Codex CLI, and more.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https%3A%2F%2Fgithub.com%2Fsoss-lesig%2Fadzuna-mcp)

Two transports from a single codebase:

- **stdio** for local clients (CLI and desktop apps that launch the server as a subprocess).
- **Streamable HTTP** for web clients (Claude.ai web custom connectors, ChatGPT custom MCP).

Bring your own Adzuna credentials. Register at <https://developer.adzuna.com/signup> -- you get an `app_id` and an `app_key`, both required.

> **Sibling project:** [reed-mcp](https://github.com/soss-lesig/reed-mcp) wraps the Reed.co.uk Jobseeker API to the same pattern. Designed to be combined later in an aggregator layer.

## Quick start

### Local clients (stdio)

Add to your client's MCP config. For Claude Desktop, that's `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "adzuna-mcp": {
      "command": "npx",
      "args": ["adzuna-mcp"],
      "env": {
        "ADZUNA_APP_ID": "your-app-id-here",
        "ADZUNA_APP_KEY": "your-app-key-here"
      }
    }
  }
}
```

Restart your client and `search_jobs` should appear in the tool list.

### Web clients (HTTP)

Click **Deploy on Railway** above. Railway clones the repo, builds via the Dockerfile, and gives you a public HTTPS URL in about ninety seconds. Set `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` in the Railway dashboard.

Then in Claude.ai web: Settings → Connectors → Add custom → paste the Railway URL with `/mcp` on the end (e.g. `https://your-app.up.railway.app/mcp`).

For Docker, manual hosting, and other deployment options, see [`docs/deploy.md`](https://github.com/soss-lesig/adzuna-mcp/blob/main/docs/deploy.md).

## Tools

- **`search_jobs`** -- search Adzuna by keyword (six variants), location, salary, contract type, category, and company. Distance is in **kilometres** (not miles). Salaries Adzuna predicted rather than scraped are flagged explicitly. At least one filter is required so the tool never issues an unbounded query.

There is intentionally no `get_job_details` tool: Adzuna's search endpoint already returns every field they expose for a job, so a separate detail tool would be busywork.

## Attribution

Adzuna's [API terms](https://developer.adzuna.com/) require anyone publishing their listings to display **"Jobs by Adzuna"** with their logo and a link back, with specific minimum dimensions and styling. The MCP server bakes the required attribution text into every search response and surfaces each job's `redirect_url`, which is the canonical attribution-compliant click-through.

If you build a UI on top of this server (a chat client rendering the listings, a dashboard, anything user-visible), you must comply with Adzuna's full branding requirements yourself. See <https://developer.adzuna.com/> for the current spec.

## Configuration

| Variable | Required | Default | Notes |
|---|---|---|---|
| `ADZUNA_APP_ID` | yes | -- | <https://developer.adzuna.com/signup> |
| `ADZUNA_APP_KEY` | yes | -- | (same source) |
| `PORT` | no | `3000` | HTTP transport only. Railway and most platforms inject this automatically. |
| `ALLOWED_ORIGINS` | no | `https://claude.ai,http://localhost` | HTTP transport only. Comma-separated allowlist for the `Origin` header on `POST /mcp` (DNS rebinding protection per the MCP spec). |

For local development, copy `.env.example` to `.env` and fill in both fields.

### Rate limits

Adzuna's free tier: **25/min, 250/day, 1000/week, 2500/month**. The server tracks API call count per process and surfaces it in every search response so the LLM and the user can see how many calls have been used in the current session. Exceeding a limit returns a structured `RATE_LIMITED` error with the call count appended.

## Requirements

Node 20 or newer.

## Prior art

[`folathecoder/adzuna-job-search-mcp`](https://github.com/folathecoder/adzuna-job-search-mcp) covers the same Adzuna API with a stdio-only Python (FastMCP) implementation. adzuna-mcp differs by being JavaScript/ESM, supporting both stdio and Streamable HTTP transports (so it works with web-based MCP clients like Claude.ai web and ChatGPT custom MCP), shipping a Railway one-click deploy, and being npm-distributable via `npx adzuna-mcp`.

## License

MIT. See [LICENSE](LICENSE).
