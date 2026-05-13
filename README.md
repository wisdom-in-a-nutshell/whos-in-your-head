# Who's In Your Head?

A small web game prototype: think of a famous person, answer only yes/no/maybe, and the AI tries to guess who is in your head within 21 questions.

## Current direction

Start simple:

- Text-first web app, not voice-first.
- User answers via buttons: **Yes**, **No**, **Maybe / Not sure**, plus optional text note.
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
OPENAI_API_KEY=...
```

Optional env:

```bash
OPENAI_MODEL=gpt-5.5
OPENAI_BASE_URL=
```

Local validation:

```bash
scripts/check-fast.sh
```

Useful scaffold endpoints:

- `GET /api/health`
- `GET /api/openai/status`
- `GET /api/openai/status?check=1` checks the configured OpenAI-compatible endpoint when `OPENAI_API_KEY` is set.
- `GET /api/game/turn` confirms the game-turn route exists. Core game logic is intentionally pending product/UI design.

## Current implementation state

The repository currently has the Next.js/package/backend scaffold only. The playable game UI and core loop are intentionally not implemented yet.

## Project tracker

Durable project instructions live at:

- `docs/projects/whos-in-your-head/tasks.md`

Start there when resuming work.
