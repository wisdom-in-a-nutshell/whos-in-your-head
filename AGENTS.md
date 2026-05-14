# Repo Agent Guidance — Who's In Your Head?

This repo is for a small playable AI guessing game prototype.

## Product premise

**Who's In Your Head?**

Subtitle: **Think of a famous person. The AI has 21 questions.**

The user thinks of a famous person. The app/AI asks one yes/no-style question at a time and must guess within 21 questions.

## Scope Routing

- For Azure App Service, ACR, GitHub Actions OIDC, Key Vault runtime config, or Cloudflare custom-domain deployment work, use [$azure-webapp-deploy](.agents/skills/azure-webapp-deploy/SKILL.md).

## Current product direction

- Build the MVP as a simple text/web game first.
- Do **not** start with Realtime voice. Treat voice as a later enhancement.
- Use a normal server-side OpenAI integration with the Responses API and official JavaScript/TypeScript SDK.
- The browser should only send user answers and receive game updates; never expose `OPENAI_API_KEY` client-side.
- Make game state explicit and inspectable: question count, transcript, possible answer options, current phase, final guess, win/loss.
- Keep UI playful but extremely clear. The core loop should be understandable in under 5 seconds.

## Implementation bias

- Prefer a small Next.js + TypeScript app unless the tracker is updated with a better choice.
- Prefer route handlers/server actions over adding a separate backend unless needed.
- Keep model prompts and state-transition logic centralized in one server module.
- Validate model output with structured JSON before updating game state.
- Keep the project shippable over clever.

## Agent-native workflow

- Use `docs/references/agent-native-workflow.md` for repo-owned checks and docs maintenance rules.
- Use `docs/references/openai-runtime-contract.md` for the OpenAI integration boundary.
- For exploratory or multi-step implementation work, create a short-lived
  branch before editing so unfinished work is not swept into `main` by the
  machine-wide Stop hook.
- Run `scripts/check-fast.sh` before ending meaningful implementation work.

## Project tracking

The original MVP tracker has been deleted after the MVP finished.
Create a new focused tracker only when a future change becomes multi-session project work.
