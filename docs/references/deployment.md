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

Azure identifiers are GitHub repo variables:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

Do not put runtime LLM credentials in GitHub Actions secrets.

## Runtime Secrets

Runtime LLM config lives on the Azure Web App as Key Vault references:

- `LLM_API_ENDPOINT` -> `aipodcasting--llm-api-endpoint`
- `LLM_API_KEY` -> `aipodcasting--llm-api-key`

Non-secret runtime defaults:

- `LLM_MODEL=gpt-5.5`
- `LLM_REASONING_EFFORT=medium`

The Web App has a system-assigned managed identity with `Key Vault Secrets User`
on `kv-shared-repos`.

## DNS

DNS/custom-domain binding is intentionally deferred. The basic deployment is
available on the Azure default hostname first:

`https://whos-in-your-head-adi.azurewebsites.net`
