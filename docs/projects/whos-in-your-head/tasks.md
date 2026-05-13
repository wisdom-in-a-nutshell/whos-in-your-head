# Who's In Your Head?

## Goal

Build a small playable web app where a user thinks of a famous person, answers yes/no-style questions, and the AI guesses the person within 21 questions using the OpenAI Responses API.

## Why / Impact

This is a crisp, shareable AI game demo with a clear interaction loop. It avoids overbuilding voice/Realtimes too early while preserving a path to add Realtime voice later if the text MVP is fun.

## Scope / Non-Goals

### In Scope

- A simple web app named **Who's In Your Head?**
- Subtitle/copy: **Think of a famous person. The AI has 21 questions.**
- Text-first interaction with buttons for `Yes`, `No`, `Maybe / Not sure`.
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
  - Conversation state / `previous_response_id`: `https://developers.openai.com/api/docs/guides/conversation-state#passing-context-from-the-previous-response`
  - GPT-5.5 / Responses guidance: `https://developers.openai.com/api/docs/guides/latest-model#using-reasoning-models`
- Runtime contract is recorded in `docs/references/openai-runtime-contract.md`.
- Agent-native repo workflow and checks are recorded in `docs/references/agent-native-workflow.md`.
- Implementation recommendation for first pass: Next.js + TypeScript with server route handlers, unless a later agent has a strong reason to choose differently.

## Done When

- [ ] A local web app runs with one command after setup.
- [ ] User can start a game, think of a famous person, answer button-based yes/no-style questions, and receive a final guess before or at question 21.
- [ ] The server calls the OpenAI Responses API without exposing `OPENAI_API_KEY` to the browser.
- [ ] Game rules are enforced by code, not only by prompt.
- [ ] Model output is parsed/validated as structured JSON before updating UI state.
- [ ] README includes setup/run instructions and env vars.
- [ ] Basic validation passes: install/build/lint or equivalent repo-native checks.

## Milestones

- [ ] Milestone 1 — Scaffold the web app. Acceptance: Next.js/TS app or equivalent exists, starts locally, has basic landing page. Validate: `npm run dev` and `npm run build`.
- [ ] Milestone 2 — Implement local game state and UI without OpenAI. Acceptance: start/reset, question counter, answer buttons, transcript, and result screen work with mocked AI turns. Validate: manual browser smoke plus build.
- [ ] Milestone 3 — Add Responses API server integration. Acceptance: server route calls OpenAI with API key server-side, returns structured next action, and handles errors gracefully. Validate: one local game reaches final guess with real model.
- [ ] Milestone 4 — Tighten game prompt/rules. Acceptance: AI asks one yes/no-compatible question per turn, respects max 21, makes a final guess, and handles `maybe/not sure`. Validate: 3 manual test games with different famous people.
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

## Open Questions / Blockers

- Which exact model should be the default at implementation time? Use `OPENAI_MODEL` and check latest docs before hardcoding. Current placeholder: `gpt-5.5`.
- Should the first public version restrict to famous real people only, or also support fictional characters? Default for MVP: famous real people only.
- Should answers be buttons only, or buttons plus optional short clarification? Default for MVP: buttons first; optional note can be added if low-friction.
- Product/design direction should be finalized before scaffolding the playable UI. User wants a clever party-game feel and silent chosen-person flow.
- User may later provide a custom OpenAI-compatible base URL and API key. Implementation should support optional `OPENAI_BASE_URL`.

## Current Batch

| Status | Work Item | Role | Resource |
| --- | --- | --- | --- |
| done | Add agent-native repo guardrails and durable runtime notes before app implementation. | parent | `docs/references/agent-native-workflow.md`, `docs/references/openai-runtime-contract.md` |
| todo | Finalize product/visual design direction for the clever party-game loop. | parent | `docs/architecture/overview.md` |
| todo | Scaffold a minimal Next.js + TypeScript app after design direction is agreed. | parent | `README.md`, `docs/architecture/overview.md` |

## Backlog / Remaining Work

- [x] Add agent-native repo check entrypoints.
- [x] Document OpenAI runtime contract and why Codex App Server / Agents SDK / Realtime are out of scope for v0.
- [ ] Add package setup and choose exact app framework if deviating from Next.js.
- [ ] Build landing/start screen: title, subtitle, short instructions, start button.
- [ ] Build game UI: current question, count `n/21`, yes/no/maybe buttons, transcript.
- [ ] Build mocked turn generator to prove UI/state loop independent of model.
- [ ] Add OpenAI server route using official JS SDK and `OPENAI_API_KEY` server-side.
- [ ] Define structured response schema for model output, e.g. `{ phase, question, guess, rationale_short }`.
- [ ] Write prompt/instructions for the game master.
- [ ] Enforce game rules in code: max 21 questions, one question per turn, final guess path, no open-ended user answers required.
- [ ] Add basic error/loading states.
- [ ] Polish UI enough for a 30-second demo.
- [ ] Update README with exact setup/run/deploy steps after implementation choices are real.
- [ ] Run validation and record exact results.
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
