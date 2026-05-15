# Deployment

## Target

Deploy the app as a standalone Next.js container to Azure Web App.

- GitHub repo: `wisdom-in-a-nutshell/whos-in-your-head`
- Azure Web App: `whos-in-your-head-adi`
- Resource group: `ghost`
- App Service Plan: `ASP-aipodcastinggroup-aef6`
- Container registry: `aipodcasting.azurecr.io`
- Image repository: `whos-in-your-head`

## CI/CD

`.github/workflows/deploy.yml` follows the same pattern as `blog-personal`:

1. Install with `npm ci`.
2. Run typecheck, tests, lint, and build.
3. Log in to Azure with GitHub OIDC.
4. Build and push the Docker image to ACR.
5. Update the Azure Web App container image.

Push deploys intentionally ignore docs, tests, and local telemetry/logging
clients. Runtime stats app changes such as `/api/stats`, `/stats`, and
`src/lib/server/game-telemetry.ts` still deploy automatically so the production
stats page reflects app behavior changes. Use `workflow_dispatch` for an
explicit manual deploy when an ignored change should go live.

Azure identifiers are GitHub repo variables:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

Do not put runtime LLM credentials in GitHub Actions secrets.

## Runtime Secrets

Runtime LLM config lives on the Azure Web App as Key Vault references:

- `LLM_API_ENDPOINT` -> `aipodcasting--llm-api-endpoint`
- `LLM_API_KEY` -> `aipodcasting--llm-api-key`
- `MONGODB_URI` -> `aipodcasting--mongodb-uri`

Non-secret runtime defaults:

- `LLM_MODEL=gpt-chat-latest`
- `LLM_FALLBACK_MODELS=` with only GPT-family models if fallback is needed
- `LLM_REASONING_EFFORT=high`
- `LLM_SERVICE_TIER=priority`
- `MONGODB_DB_NAME=content_production`
- `GAME_TELEMETRY_ENABLED=true`
- `GAME_STATS_ABANDON_AFTER_MINUTES=20`

The Web App has a system-assigned managed identity with `Key Vault Secrets User`
on `kv-shared-repos`.

## DNS

Primary public hostname:

`https://mindreader.adithyan.io`

Azure fallback hostname:

`https://whos-in-your-head-adi.azurewebsites.net`

Cloudflare records:

- `mindreader.adithyan.io` CNAME -> `whos-in-your-head-adi.azurewebsites.net`, proxied.
- `asuid.mindreader.adithyan.io` TXT -> the Web App `customDomainVerificationId`.

Azure hostname binding:

- `mindreader.adithyan.io` is verified on `whos-in-your-head-adi`.
- SNI TLS uses the existing `cf-origin-adithyan-io` wildcard Cloudflare Origin
  Certificate in Azure.

When setting up another `adithyan.io` toy app, create the CNAME as DNS-only
first so Azure can verify the hostname, bind the existing wildcard origin cert,
then switch the CNAME to proxied in Cloudflare.
