# Who's In Your Head?

A small web game prototype: think of a famous person, answer only yes/no/maybe, and the AI tries to guess who is in your head within 21 questions.

## Current direction

Start simple:

- Text-first web app, not voice-first.
- User answers via buttons: **Yes**, **No**, or **Not sure**.
- Server uses the OpenAI Responses API through the official JavaScript SDK.
- Keep game state explicit in the app/server; do not rely only on the model remembering rules.
- Realtime voice is an optional later layer, not the MVP.

## MVP stack

- Next.js + TypeScript for a small deployable web app.
- Server-side route handlers for OpenAI calls; never expose `OPENAI_API_KEY` in the browser.
- `OPENAI_MODEL` env var, defaulting to a current Responses-capable model.
- OpenAI official JavaScript SDK and Zod for structured model moves.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required env for real OpenAI calls:

```bash
LLM_API_KEY=...
LLM_API_ENDPOINT=...
```

Optional env:

```bash
LLM_MODEL=gpt-5.5
LLM_REASONING_EFFORT=medium
LLM_SERVICE_TIER=priority
```

The server also accepts `OPENAI_API_KEY`, `OPENAI_BASE_URL`,
`OPENAI_MODEL`, `OPENAI_REASONING_EFFORT`, and `OPENAI_SERVICE_TIER` as local
fallback names.
For deployed Azure runtime, prefer `LLM_API_*` app settings backed by Key Vault
references.

The public game is temporarily running a Gemini-only experiment. The start
screen shows `gemini-3.1-flash-lite` as the selectable model; other model names
may remain visible as disabled `busy - back soon` or coming-soon options. The
server also forces submitted game state back to Gemini so old tabs and stale
share links cannot route a live round to another model during the experiment.

Share links can include `?model=gemini-3.1-flash-lite`, but other model query
values fall back to Gemini while the forced experiment is active.

Local validation:

```bash
scripts/check-fast.sh
```

Useful scaffold endpoints:

- `GET /api/health`
- `GET /api/openai/status`
- `GET /api/openai/status?check=1` checks the configured OpenAI-compatible endpoint when `LLM_API_KEY` or `OPENAI_API_KEY` is set.
- `GET /api/game/turn` confirms the game-turn route exists.
- `POST /api/game/turn` accepts `start`, `answer`, and `judge_guess` actions and returns sanitized game state.

## Current implementation state

The repository has a playable frontend wired to a backend game-turn route for
real OpenAI-compatible calls. The first question is deterministic for speed;
later turns use structured model moves. The backend owns game rules, validates
model output, and keeps the OpenAI API key server-side.

## Project History

Use the architecture and reference docs for current implementation facts. The
original MVP tracker has been deleted after the MVP finished. Create a new
focused tracker only for future multi-session project work.
