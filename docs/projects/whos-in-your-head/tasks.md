# Who's In Your Head?

## Goal

Build a small playable web app where a user thinks of a famous person, answers yes/no-style questions, and the AI guesses the person within 21 questions using the OpenAI Responses API.

## Why / Impact

This is a crisp, shareable AI game demo with a clear interaction loop. It avoids overbuilding voice/Realtimes too early while preserving a path to add Realtime voice later if the text MVP is fun.

## Scope / Non-Goals

### In Scope

- A simple web app named **Who's In Your Head?**
- Subtitle/copy: **Think of a famous person. The AI has 21 questions.**
- Text-first interaction with buttons for `Yes` and `No` in the first public loop.
- Server-side OpenAI Responses API integration using the official JS/TS SDK.
- Explicit game state: question count, transcript, current phase, latest question, final guess, result.
- Structured model output for each turn.
- Basic local setup/run instructions.
- Small, shippable UI that feels playful and can be demoed quickly.

### Out of Scope

- Realtime voice/WebRTC for the first MVP.
- Using the name **Guess Who?** as the product name.
- User accounts, persistence, multiplayer, leaderboards, payments, analytics.
- Complex knowledge-base/tool search unless the base model performance is clearly insufficient.
- Image Gen unless added later as a reward/share-card layer.

## Context / Constraints

- Date started: 2026-05-13
- User originally explored a Realtime 2 voice-agent version, then intentionally narrowed scope to a simpler Responses API web app.
- The app should be useful as a tiny playable demo and possibly extensible later into voice.
- Current preferred name: **Who's In Your Head?**
- The app should not publicly present itself as Hasbro's **Guess Who?** game. It can be described internally as a 20-questions / Guess-Who-like guessing game.
- Keep API keys server-side only.
- Use current OpenAI docs when implementing. Relevant docs discovered on 2026-05-13:
  - OpenAI JS SDK quickstart: `https://developers.openai.com/api/docs/quickstart#install-the-openai-sdk-and-run-an-api-call`
  - SDK libraries: `https://developers.openai.com/api/docs/libraries#install-an-official-sdk`
  - Structured Outputs: `https://developers.openai.com/api/docs/guides/structured-outputs`
  - Prompt engineering / instructions: `https://developers.openai.com/api/docs/guides/prompt-engineering`
  - Conversation state / `previous_response_id`: `https://developers.openai.com/api/docs/guides/conversation-state#passing-context-from-the-previous-response`
  - GPT-5.5 / Responses guidance: `https://developers.openai.com/api/docs/guides/latest-model#using-reasoning-models`
- Runtime contract is recorded in `docs/references/openai-runtime-contract.md`.
- Agent-native repo workflow and checks are recorded in `docs/references/agent-native-workflow.md`.
- Implementation recommendation for first pass: Next.js + TypeScript with server route handlers, unless a later agent has a strong reason to choose differently.

## Done When

- [x] A local web app runs with one command after setup.
- [x] User can start a game, think of a famous person, answer button-based yes/no-style questions, and receive a final guess before or at question 21.
- [x] The server calls the OpenAI Responses API without exposing `OPENAI_API_KEY` to the browser.
- [x] Game rules are enforced by code, not only by prompt.
- [x] Model output is parsed/validated as structured JSON before updating UI state.
- [x] README includes setup/run instructions and env vars.
- [x] Basic validation passes: install/build/lint or equivalent repo-native checks.
- [x] Azure Web App deploy target and GitHub Actions CI/CD are configured without storing runtime secrets in GitHub.

## Milestones

- [x] Milestone 1 — Scaffold the web app. Acceptance: Next.js/TS app or equivalent exists, starts locally, has basic landing page. Validate: `npm run dev` and `npm run build`.
- [x] Milestone 2 — Implement local game state and UI without OpenAI. Acceptance: start/reset, question counter, answer buttons, transcript, and result screen work with mocked AI turns. Validate: manual browser smoke plus build.
- [ ] Milestone 3 — Add Responses API server integration. Acceptance: server route calls OpenAI with API key server-side, returns structured next action, and handles errors gracefully. Validate: one local game reaches final guess with real model. Implementation is in place; real-model smoke is blocked until credentials/base URL are provided.
- [ ] Milestone 4 — Tighten game prompt/rules. Acceptance: AI asks one yes/no-compatible question per turn, respects max 21, makes a final guess, and handles `maybe/not sure`. Validate: 3 manual test games with different famous people. Prompt/rule scaffold is in place; real-model evaluation is blocked until credentials/base URL are provided.
- [ ] Milestone 5 — Polish demo/readme. Acceptance: UI copy is clear, repo has setup/run docs, and app is ready for local demo/deploy. Validate: fresh setup path works from README.

## Execution Rules

- Keep work scoped to the current milestone unless the tracker explicitly expands scope.
- Run validation after each milestone or risky batch and fix failures before advancing.
- Continue working until the scoped project is done or a true blocker requires human input; do not stop after one completed task if more actionable work remains.
- When `Done When` is satisfied and validation is acceptable, archive the project directly; ask only if completion is materially uncertain.
- Unless repo guidance says otherwise, archiving means moving the tracker to `docs/projects/archive/whos-in-your-head/tasks.md`; create archive folders if missing.
- Update this tracker whenever the plan changes materially or before ending the run.
- Use `Current Batch` as the live execution board and primary resume point.
- If `Current Batch` is empty or stale, rebuild it from remaining milestones/backlog before continuing.
- Keep implementation small and shippable; do not add voice, auth, persistence, or custom infra unless the tracker is intentionally updated.
- Treat the server as the rule authority. The model proposes the next question/guess; code enforces phase, count, and allowed answer flow.

## Decisions

- 2026-05-13 — Use **Who's In Your Head?** as the demo name with the clarifying subtitle **Think of a famous person. The AI has 21 questions.**
- 2026-05-13 — MVP is text-first with the Responses API, not Realtime voice.
- 2026-05-13 — Avoid naming the app **Guess Who?** because that is a known board game/trademark; use the phrase only as internal inspiration.
- 2026-05-13 — Prefer explicit app-owned game state over relying entirely on `previous_response_id`. `previous_response_id` can still be used for conversational continuity if useful, but state must remain inspectable and enforceable.
- 2026-05-13 — Confirmed from OpenAI docs and sub-agent review: use the official OpenAI JS/TS SDK against the Responses API from a server-only Next.js boundary. Do not use Codex App Server, Agents SDK, or Realtime voice for v0.
- 2026-05-13 — Treat `Yes`, `No`, and `Maybe` as app-owned UI controls and game-state inputs, not OpenAI function tools for the MVP.
- 2026-05-13 — Add repo-owned fast checks in `scripts/check-fast.sh`; the machine-wide Stop hook can delegate to this script once app code exists.
- 2026-05-13 — Scaffold uses Next.js 16, React 19, TypeScript, Vitest, ESLint, OpenAI JS SDK, Zod, and `server-only`.
- 2026-05-13 — Add a narrow `package.json` override for `postcss` to avoid the current npm audit finding inherited through Next's transitive dependency.
- 2026-05-13 — Visual direction is clean editorial arcade: off-white surface, black type, restrained red primary action, small yellow accent, no visible transcript during active play.
- 2026-05-13 — Latest copy direction uses first-person host voice: "I get 21 questions. You just say yes or no. Then I guess who's in your head."
- 2026-05-13 — Keep the start screen stripped down for shareability: no maker attribution or extra aside copy in the first moment. Branding can return later on a result/share surface.
- 2026-05-13 — Backend turn route is stateless for the MVP: the browser sends explicit game state, the server validates it, applies one action, and asks OpenAI for one structured move.
- 2026-05-13 — Structured output uses a root object schema with nullable fields plus semantic Zod validation, because the OpenAI SDK Zod text-format helper expects a root object.
- 2026-05-13 — `scripts/check-fast.sh` is optimized for the Stop hook: repo contract, secret scan, lint, typecheck, and tests. Production build lives in `scripts/check-full.sh`.
- 2026-05-13 — Deploy as a standalone Next.js container to Azure Web App `whos-in-your-head-adi` on the shared `ASP-aipodcastinggroup-aef6` plan, with images in `aipodcasting.azurecr.io/whos-in-your-head`.
- 2026-05-13 — Runtime LLM config uses Azure App Service Key Vault references for `LLM_API_ENDPOINT` and `LLM_API_KEY`; GitHub Actions only gets Azure OIDC identifiers as repo variables.
- 2026-05-13 — Use `mindreader.adithyan.io` as the public demo hostname. Cloudflare owns the proxied CNAME; Azure owns the verified hostname binding and SNI binding to the existing `cf-origin-adithyan-io` wildcard origin certificate.
- 2026-05-13 — Keep the opening question deterministic as `Is this person alive?` so starting a round feels instant; use the model for answered turns after the opener.
- 2026-05-13 — Default runtime model calls use request-level `priority` service tier and a deterministic reasoning schedule: low for early turns, medium for middle turns, and configured high reasoning for the final stretch. OpenAI's GPT-5.5 docs call `medium` the model default and recommend using Structured Outputs plus prompt caching for this shape of workload.

## Open Questions / Blockers

- Which exact model should be the default at implementation time? Current default is `gpt-5.5`, based on OpenAI docs checked on 2026-05-13. Keep `OPENAI_MODEL` configurable.
- Should the first public version restrict to famous real people only, or also support fictional characters? Default for MVP: famous real people only.
- Should answers remain strictly `Yes`/`No` long-term? Current backend supports `yes`, `no`, and `maybe`; frontend copy can choose the label.
- User may later provide a custom OpenAI-compatible base URL and API key. Implementation should support optional `OPENAI_BASE_URL`.

## Current Batch

| Status | Work Item | Role | Resource |
| --- | --- | --- | --- |
| done | Add agent-native repo guardrails and durable runtime notes before app implementation. | parent | `docs/references/agent-native-workflow.md`, `docs/references/openai-runtime-contract.md` |
| done | Finalize product/visual design direction for the clever party-game loop. | parent | `docs/architecture/overview.md` |
| done | Scaffold a minimal Next.js + TypeScript app with package scripts and placeholder routes. | parent | `README.md`, `docs/references/openai-runtime-contract.md` |
| done | Implement mocked game loop after design direction is agreed. | parent | `src/app/page.tsx`, `src/app/globals.css` |
| done | Implement backend game-state, structured output, and server-side Responses API turn route. | parent | `src/app/api/game/turn/route.ts`, `src/lib/game/state.ts`, `src/lib/server/game-master.ts` |
| done | Add Azure Web App deployment target, Dockerfile, GitHub Actions workflow, and Key Vault-backed runtime config. | parent | `.github/workflows/deploy.yml`, `Dockerfile`, `docs/references/deployment.md` |
| done | Wire the mocked frontend flow to the server-side Responses API route when the parallel frontend work is ready. | parent | `docs/references/openai-runtime-contract.md` |
| in_progress | Smoke and harden real model games after frontend wiring is complete. | parent | `README.md`, `src/lib/game/prompt.ts` |

## Backlog / Remaining Work

- [x] Add agent-native repo check entrypoints.
- [x] Document OpenAI runtime contract and why Codex App Server / Agents SDK / Realtime are out of scope for v0.
- [x] Add package setup and choose exact app framework if deviating from Next.js.
- [x] Add placeholder app route and server route scaffolding.
- [x] Add OpenAI runtime status endpoint with optional `OPENAI_BASE_URL` support.
- [x] Build landing/start screen: title, subtitle, short instructions, start button.
- [x] Build game UI: current question, count `n/21`, yes/no buttons, no visible transcript during play.
- [x] Build mocked turn generator to prove UI/state loop independent of model.
- [x] Add OpenAI server route using official JS SDK and `OPENAI_API_KEY` server-side.
- [x] Define structured response schema for model output, e.g. `{ action, question, guess, shortRationale }`.
- [x] Write prompt/instructions for the game master.
- [x] Enforce game rules in code: max 21 questions, one question per turn, final guess path, no open-ended user answers required.
- [x] Add backend error states for invalid request, missing OpenAI config, rule violations, and invalid model moves.
- [x] Add deployment workflow and Azure Web App runtime wiring.
- [x] Add frontend loading/error states when wiring the UI to the backend.
- [ ] Polish UI enough for a 30-second demo.
- [ ] Update README with exact setup/run/deploy steps after implementation choices are real.
- [x] Run validation and record exact results.
- [ ] Review and finalize `docs/projects/whos-in-your-head/learnings/README.md` before archive if the project becomes long-running.
- [ ] Close/archive tracker when scoped work is actually done.

## Validation / Test Plan

- Repo setup validation: `npm install` then `npm run build` once package files exist.
- Agent-native repo validation: `scripts/check-fast.sh`.
- Local smoke: `npm run dev`, open local app, start a game, click through answers, reach final guess.
- Model smoke: with `OPENAI_API_KEY` set, play at least 3 rounds with different people and record whether the AI follows constraints.
- Regression checks to add if project grows: unit tests for game state reducer and server output parser.

## Progress Log

- 2026-05-13: [DONE] Created local repo folder and project tracker for a text-first Responses API version of Who's In Your Head?.
- 2026-05-13: [DONE] Added bootstrap brief and handoff instructions; no app implementation started yet.
- 2026-05-13: [DONE] Added agent-native repo guardrails: `scripts/check-fast.sh`, `scripts/check-full.sh`, `docs/references/agent-native-workflow.md`, and `docs/references/openai-runtime-contract.md`. App implementation still intentionally not started pending product/design direction.
- 2026-05-13: [DONE] Scaffolded the Next.js package and backend shell: package scripts, TypeScript, ESLint, Vitest, placeholder app page, `/api/health`, `/api/openai/status`, `/api/game/turn`, OpenAI server client factory, and AI move schema/tests. Core game UI/logic still intentionally pending design direction.
- 2026-05-13: [DONE] Implemented the approved clean editorial arcade frontend as a clickable mocked game loop in `src/app/page.tsx` and `src/app/globals.css`. Browser-smoked start, question, final guess, result, and mobile question screens. Validation: `npm run typecheck` and `npm run build` passed.
- 2026-05-13: [DONE] Documented the parallel design/backend direction and implemented the backend game-master scaffold: explicit game state, structured OpenAI move parsing with `responses.parse` + `zodTextFormat`, server route actions, prompt strategy, rule enforcement, and unit tests. Real model smoke remains blocked until the user provides API key/base URL.
- 2026-05-13: [DONE] Validation after backend scaffold: `scripts/check-fast.sh` passed with repo contract, secret scan, lint, typecheck, and 9 Vitest tests; `scripts/check-full.sh` passed with production `next build`.
- 2026-05-13: [DONE] Added Azure Web App deployment scaffolding: Docker standalone build, GitHub Actions OIDC/ACR/Web App workflow, repo-level Azure variables, Web App `whos-in-your-head-adi`, managed identity with `AcrPull` and `Key Vault Secrets User`, and Key Vault-backed `LLM_API_*` app settings. Validation: `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`, and `scripts/check-fast.sh` passed. The GitHub Actions deploy run `25792126358` completed successfully, pushed `aipodcasting.azurecr.io/whos-in-your-head:cc530b073a5da5f00a3a33b9702e5627c25bd1b5`, and `https://whos-in-your-head-adi.azurewebsites.net/api/health` plus `/api/openai/status?check=1` returned `ok: true`.
- 2026-05-13: [DONE] Added custom domain `mindreader.adithyan.io`: Cloudflare CNAME + Azure `asuid` TXT verification, Azure hostname binding, SNI binding with the existing `cf-origin-adithyan-io` wildcard origin cert, and proxied Cloudflare CNAME. Verified through Cloudflare with trusted edge TLS by forcing a Cloudflare IP: `/api/health` and `/api/openai/status?check=1` returned `ok: true`. Local macOS resolver cache still temporarily resolved the pre-proxy Azure origin path during setup.
- 2026-05-13: [DONE] Added request-level `service_tier` support for Responses API calls, changed the default runtime to `gpt-5.5` with `medium` reasoning and `priority` service tier, and made the opening question deterministic so a new game starts without model latency.
- 2026-05-13: [DONE] Investigated late-game local failures. Server logs showed the LiteLLM endpoint sometimes returned plain refusal text (`I'm sorry, ...`) where structured JSON was expected. Verified the current endpoint supports exact schemas with both Responses `text.format` and Chat Completions `response_format`, then hardened the route with one model-move retry, server-side error logging, a duplicate-submit guard in the client, and stronger game-master strategy/refusal instructions. Validation: `scripts/check-fast.sh` passed and a local real answered turn returned a parsed structured move with `actualServiceTier=priority`.
- 2026-05-13: [DONE] Removed local recovery-question generation and switched failed model turns to a retryable question-failed state. The browser keeps the existing game state so the player can submit the same answer again, while LiteLLM/provider retry and Responses state preservation handle recovery instead of app-invented questions.
- 2026-05-13: [DONE] Added background warmup for the common first post-opener `yes` and `no` model moves. The deterministic opener still appears instantly, and if the user pauses briefly on it, answering the first question can reuse a warmed structured model response id. Local smoke showed the warmed path returning in about 9-12ms with a valid `modelResponseId`; immediate answers and rare `maybe` answers still fall back to the normal model path.
- 2026-05-13: [DONE] Added structured production logging and an agent-friendly `npm run logs:prod` client. The app now emits `[whiyh]` JSON lines for game turns and game-master calls, and the client downloads Azure App Service logs into `tmp/`, extracts those events, and returns a stable JSON envelope by default.
- 2026-05-13: [DONE] Investigated production late-turn question failures. The failing Responses calls used high reasoning and consumed the entire capped output budget as reasoning tokens, leaving no structured JSON to parse. Removed the game-master `max_output_tokens` cap and aligned the local default reasoning level to `high` so local and production use the same strategy setting.
- 2026-05-13: [DONE] Added regression coverage for the high-reasoning game-master request contract: no output-token cap, high reasoning by default, and retry-only LiteLLM response-cache bypass. The second model-move attempt now adds a retry marker plus `cache.no-cache`/`cache.no-store` and rebuilds from the full transcript without `previous_response_id`, so one malformed cached response or stored Responses branch cannot replay forever.
- 2026-05-13: [DONE] Added an app-layer fallback chain for provider `status="incomplete"` / `incomplete_details.reason="content_filter"` Responses results. LiteLLM currently treats that native `/responses` shape as a successful call rather than a router content-policy exception, so the route now detects it, logs it, rebuilds from explicit game state, and retries configured `LLM_FALLBACK_MODELS` through the same structured schema and rule validation. The fallback parser handles chat-completion-shaped LiteLLM responses and ignores reasoning blocks when extracting the final JSON move.
- 2026-05-13: [DONE] Added Mongo/Cosmos-backed game telemetry scaffolding. The app now records non-blocking start, turn, result, and failure telemetry when `MONGODB_URI` is configured; stores correctness, question counts, compact answer paths, transcripts, latency, model path, fallback usage, response ids, and token usage; and exposes safe aggregate public stats through `/api/stats` and `/stats`, including started/completed/dropped counts and per-model turn/guess aggregates.
- 2026-05-13: [DONE] Polished the public stats surface and result-page stats link. `/stats` now has a designed empty state for local/no-data environments, a clear play entrypoint, and result pages link to the live scoreboard without crowding the game ending. Validation: `npm run typecheck`, `npm run lint`, `scripts/check-fast.sh`, and browser checks for `/stats` plus `/?preview=result` passed locally.
- 2026-05-13: [DONE] Added the per-game reasoning experiment and hardened the active 502 path. Each game could be assigned one random reasoning effort, model turns logged that effort, `/stats` grouped model rows by reasoning level and correctness, and content-filter failures continued to retry with a cache-bypassed primary request if no fallback succeeded. This was later replaced by a deterministic low/medium/high turn schedule.
- 2026-05-13: [DONE] Wired production telemetry settings to the shared Mongo Key Vault secret and made Cosmos/Mongo index initialization tolerate already-created collections so stats never fail on index setup. The game-master prompt handles historical life-science branches more carefully by testing genetics/heredity before overcommitting to a Darwin/Wallace natural-selection cluster.
- 2026-05-13: [DONE] Bootstrapped the reusable `azure-webapp-deploy` skill into this repo via `.agents/skills/azure-webapp-deploy` and added repo routing guidance so future deployment work uses the shared Azure/App Service/Cloudflare workflow.
- 2026-05-13: [DONE] Added a missed-guess feedback loop. When the final guess is wrong, the result screen now asks who the player was thinking of and records that answer in Mongo against the game id for later debugging; public stats expose only the aggregate reported-miss count, not individual answers or transcripts.
- 2026-05-13: [DONE] Replaced the random per-game reasoning mix with a deterministic snappy schedule: turns after questions 1-8 use `low`, turns after questions 9-16 use `medium`, and turns after question 17+ use the configured `LLM_REASONING_EFFORT` (`high` in production). The prompt/cache key and Responses state chain stay unchanged, while telemetry continues to record the actual per-turn reasoning effort.
