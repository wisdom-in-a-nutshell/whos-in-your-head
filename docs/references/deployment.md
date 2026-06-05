# Deployment

`whos-in-your-head` has no active production hosting path.

## Retired Hosting

The previous Mac mini service and public hostname were retired on 2026-06-05:

- LaunchAgent `com.dobby.whos-in-your-head` was unloaded.
- `~/Library/LaunchAgents/com.dobby.whos-in-your-head.plist` was removed.
- `mindreader.adithyan.io` was removed from `~/.cloudflared/config.yml`.
- The Cloudflare DNS record for `mindreader.adithyan.io` was deleted.
- The stale Azure `Microsoft.Web/certificates/mindreader.adithyan.io`
  resource in resource group `ghost` was deleted.
- The repo-local launchd and production log helper scripts were removed.

## Current Model

Use the app locally through the normal Next.js development path:

```bash
npm run dev
```

There is no GitHub Actions, Azure Web App, Mac mini launchd, or Cloudflare
Tunnel production route for this repo. If hosting is reintroduced, update this
document and the relevant shared inventory in `~/GitHub/scripts` in the same
change.

Runtime secrets must stay in ignored local env files or the owning hosting
provider's secret store. Do not put LLM keys, OpenAI-compatible proxy settings,
or MongoDB URIs in tracked files.
