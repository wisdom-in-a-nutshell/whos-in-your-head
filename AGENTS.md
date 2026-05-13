# Repo Agent Guidance — Who's In Your Head?

This repo is for a small playable AI guessing game prototype.

## Product premise

**Who's In Your Head?**

Subtitle: **Think of a famous person. The AI has 21 questions.**

The user thinks of a famous person. The app/AI asks one yes/no-style question at a time and must guess within 21 questions.

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

## Project tracking

Use `docs/projects/whos-in-your-head/tasks.md` as the canonical active project tracker.
Update it before ending a meaningful work session.
