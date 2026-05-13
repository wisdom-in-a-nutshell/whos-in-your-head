# Architecture Overview

## Goal

Build a tiny web game where the user thinks of a famous person and the AI tries to guess them within 21 yes/no questions.

## MVP architecture

```mermaid
flowchart TD
  U["User"] --> UI["Browser UI"]
  UI --> API["Server route: /api/game/turn"]
  API --> Rules["Game rules and state transitions"]
  API --> Prompt["Game-master prompt and schema"]
  Prompt --> OpenAI["OpenAI Responses API"]
  OpenAI --> API
  API --> UI
```

## State model

Keep these fields explicit in app/server state:

- `gameId`
- `phase`: `intro | asking | guessing | result`
- `questionCount`
- `maxQuestions`: `21`
- `transcript`: ordered question/answer turns
- `latestQuestion`
- `finalGuess`
- `result`: `unknown | correct | incorrect | gave_up`

The model may reason about the game, but the app owns the rules.

## Server responsibilities

- Hold `OPENAI_API_KEY` server-side only.
- Call the Responses API with the official OpenAI JS SDK.
- Parse structured model moves with Zod-backed Structured Outputs.
- Enforce that the AI asks only one yes/no-compatible question per turn.
- Enforce the 21-question limit independent of model behavior.
- Return sanitized game state, not raw OpenAI responses.

## Browser responsibilities

- Start/reset game.
- Display the current question and count.
- Let the user answer with buttons: Yes, No, Maybe / Not sure.
- Display transcript and final guess.

## Backend turn flow

```mermaid
flowchart TD
  R["POST /api/game/turn"] --> V["Validate action and state"]
  V --> J{"judge_guess?"}
  J -->|yes| Done["Return result state"]
  J -->|no| A["Apply player answer or start new state"]
  A --> M["Request one structured AI move"]
  M --> E["Enforce game rules"]
  E --> S["Return next game state"]
```

The first implementation is stateless between HTTP requests. The browser sends
the current explicit game state; the server validates it, applies one action, and
returns the next state. Server-side persistence can be added later without
changing the model-move schema.

## Later extensions

- Realtime voice mode using `gpt-realtime-2`.
- Shareable result cards.
- Difficulty modes: famous people, fictional characters, founders/builders, animals/objects.
- Optional Image Gen reward card after the final guess.

## References

- `docs/references/openai-runtime-contract.md`
- `docs/references/game-master-strategy.md`
