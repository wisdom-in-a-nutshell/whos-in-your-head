# OpenAI Runtime Contract

## Decision

Build the MVP with a normal server-side OpenAI integration:

- Next.js + TypeScript app.
- Server route handlers or server actions.
- Official OpenAI JavaScript/TypeScript SDK.
- Responses API.
- Structured Outputs for model moves.

Do not use Codex App Server, Agents SDK, or Realtime voice for v0.

## Request Boundary

The browser sends only game actions and receives sanitized game state.

The browser must never receive or use:

- `OPENAI_API_KEY`
- Raw OpenAI response objects
- Hidden prompt text
- Server-only model configuration

## Environment

Required:

- `OPENAI_API_KEY`

Optional:

- `OPENAI_MODEL`
- `OPENAI_BASE_URL`

`OPENAI_BASE_URL` exists so local or alternate OpenAI-compatible providers can be tested later without changing app code.

## Scaffold Endpoints

The package scaffold includes these server routes:

- `GET /api/health` returns a basic app health response.
- `GET /api/openai/status` reports whether OpenAI runtime env is configured without exposing secrets.
- `GET /api/openai/status?check=1` attempts a server-side OpenAI-compatible connection check when `OPENAI_API_KEY` is configured.
- `GET /api/game/turn` confirms the game-turn route exists.
- `POST /api/game/turn` validates the future turn request shape and returns `501` until the game design and core loop are implemented.

## Game State Authority

The app owns the game rules. The model proposes the next move.

Code must enforce:

- Maximum 21 questions.
- One yes/no-compatible question per AI turn.
- Allowed answer values: `yes`, `no`, `maybe`.
- Explicit phase transitions.
- Final guess path before or at the question limit.

Keep state inspectable:

- `gameId`
- `phase`
- `questionCount`
- `maxQuestions`
- `transcript`
- `latestQuestion`
- `finalGuess`
- `result`

## Structured Model Move

Prefer a schema shaped like this:

```ts
type AiMove =
  | {
      action: "ask_question";
      question: string;
      guess: null;
      shortRationale?: string;
    }
  | {
      action: "make_guess";
      question: null;
      guess: string;
      shortRationale?: string;
    };
```

Use SDK structured output helpers, such as Zod with `openai.responses.parse`, when implementing the real model call.

## Tooling Note

The `Yes`, `No`, and `Maybe` controls are app UI choices, not OpenAI function tools for v0.

Use function tools only if the model needs to call app-owned capabilities. For the MVP, the model should return a structured move and the server should apply deterministic game rules.
