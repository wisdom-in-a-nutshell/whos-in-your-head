# Who's In Your Head?

A small web game prototype: think of a famous person, answer only yes/no/maybe, and the AI tries to guess who is in your head within 21 questions.

## Current direction

Start simple:

- Text-first web app, not voice-first.
- User answers via buttons: **Yes**, **No**, **Maybe / Not sure**, plus optional text note.
- Server uses the OpenAI Responses API through the official JavaScript SDK.
- Keep game state explicit in the app/server; do not rely only on the model remembering rules.
- Realtime voice is an optional later layer, not the MVP.

## Proposed MVP stack

- Next.js + TypeScript for a small deployable web app.
- Server-side route handlers for OpenAI calls; never expose `OPENAI_API_KEY` in the browser.
- `OPENAI_MODEL` env var, defaulting to a current Responses-capable model.

## Setup sketch

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required env:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.5
```

## Project tracker

Durable project instructions live at:

- `docs/projects/whos-in-your-head/tasks.md`

Start there when resuming work.
