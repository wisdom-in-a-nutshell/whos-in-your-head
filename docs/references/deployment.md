# Deployment

`whos-in-your-head` is served on the Mac mini as a launchd-managed Next.js
production service behind the shared Cloudflare Tunnel.

## Local Service

```text
LaunchAgent: com.dobby.whos-in-your-head
Local target: http://127.0.0.1:8794
Health: http://127.0.0.1:8794/api/health
Public hostname: mindreader.adithyan.io
```

The app repo owns the local service process:

```bash
scripts/install-launchd-whos-in-your-head.sh
scripts/install-launchd-whos-in-your-head.sh --status
scripts/install-launchd-whos-in-your-head.sh --logs 150
```

The installer runs `npm run build`, copies `.next/static` into the standalone
Next.js output, and launchd starts `node .next/standalone/server.js` with
`HOSTNAME=127.0.0.1` and `PORT=8794`.

Runtime secrets stay machine-local in the ignored env file loaded by
`scripts/run-local-production.sh`. Do not put LLM keys, OpenAI-compatible proxy
settings, or MongoDB URIs in GitHub Actions secrets or tracked files.

## Public Route

```text
Browser
  -> Cloudflare DNS/proxy
      -> dobby-mobile-gateway Cloudflare Tunnel
          -> 127.0.0.1:8794
              -> launchd
                  -> standalone Next.js server
```

The shared tunnel inventory and cross-service validation commands live in:

```text
~/GitHub/scripts/docs/references/mac-mini-cloudflare-tunnel.md
```

## Deployment Model

There is no GitHub Actions or Azure Web App production deploy path for this
repo. Production updates are local Mac mini builds installed through:

```bash
scripts/install-launchd-whos-in-your-head.sh
```

Use these validation endpoints after a local install or tunnel/DNS change:

```bash
curl -fsS http://127.0.0.1:8794/api/health
curl -fsS https://mindreader.adithyan.io/api/health
curl -fsS https://mindreader.adithyan.io/api/openai/status
```
