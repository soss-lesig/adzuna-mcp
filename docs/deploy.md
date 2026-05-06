# Deployment

reed-mcp's HTTP transport runs anywhere that can run a Node 20+ process behind HTTPS: Railway, Fly.io, Render, Cloudflare Containers, your own VPS. The stdio transport runs locally as a subprocess of an MCP client and does not need a deployment story; just add it to your client's config (see the README's Quick start).

Three options are documented below, in rough order of friction.

## Railway (recommended)

Click the **Deploy on Railway** button in the [README](../README.md). Railway will:

1. Clone the repo.
2. Build via the Dockerfile.
3. Issue a public HTTPS URL (something like `https://reed-mcp-production.up.railway.app`).
4. Wait for you to set environment variables in the dashboard.

Set `REED_API_KEY` in the Railway dashboard under your service's Variables tab. Optionally set `ALLOWED_ORIGINS` if you want to call the server from somewhere other than `claude.ai` or `localhost`.

Once the variable is set, Railway will redeploy automatically and the URL will start accepting requests. Add `https://your-url.up.railway.app/mcp` as a custom MCP connector in Claude.ai web (Settings → Connectors → Add custom).

Total time from button click to working connector: about ninety seconds.

## Docker

```bash
docker build -t reed-mcp .
docker run -p 3000:3000 -e REED_API_KEY=your-key reed-mcp
```

The container's HTTP transport listens on port 3000 by default. Override with `-e PORT=...`. To restrict origins, pass `-e ALLOWED_ORIGINS=https://claude.ai,https://your-domain`.

For local testing, point an MCP client at `http://localhost:3000/mcp`. For real deployments, put it behind a reverse proxy that terminates TLS (nginx, Caddy, Cloudflare Tunnel).

## Manual (clone and run)

```bash
git clone https://github.com/soss-lesig/reed-mcp.git
cd reed-mcp
npm install
cp .env.example .env
# edit .env to set REED_API_KEY

# HTTP transport (long-running server):
npm run start:http

# stdio transport (one-shot, for piping into an MCP client):
npm run start:stdio
```

Both `npm run` scripts use Node's `--env-file=.env` flag (no dotenv runtime dependency) and will fail loudly if `.env` is missing or `REED_API_KEY` is not set. The path is resolved relative to the process's current working directory, so run the scripts from the repo root, or pass an absolute path (e.g. `--env-file=/srv/reed-mcp/.env`) when invoking from systemd, cron, or any other launcher with its own `cwd`.

## TLS and reverse proxies

Railway terminates TLS automatically. Self-hosted operators should put the HTTP transport behind a reverse proxy that handles TLS, request logging, and any rate limiting. Two reasonable choices:

- **Caddy** — automatic Let's Encrypt certificates, one-line `Caddyfile` config.
- **Cloudflare Tunnel** — no public IP needed, free TLS, fits the "I just want this reachable from Claude.ai web" use case.

The HTTP transport itself does no TLS, no auth beyond Origin validation, and no rate limiting. Anything beyond bare-process needs to come from the layer in front of it.

## Configuration

See the [README's Configuration table](../README.md#configuration) for the full list of environment variables.
