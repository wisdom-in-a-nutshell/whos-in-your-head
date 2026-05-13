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

- `LLM_API_KEY`
- `LLM_API_ENDPOINT`

Optional:

- `LLM_MODEL`
- `LLM_REASONING_EFFORT`
- `LLM_SERVICE_TIER`

The server also accepts the OpenAI SDK names `OPENAI_API_KEY`,
`OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_REASONING_EFFORT`, and
`OPENAI_SERVICE_TIER` as local fallbacks. Deployed Azure runtime should use
`LLM_API_*` app settings backed by Key Vault references so the repo does not
depend on ambient global OpenAI provider routing.

`LLM_REASONING_EFFORT` accepts `none`, `minimal`, `low`, `medium`, `high`, or
`xhigh`; the default is `medium`.

`LLM_SERVICE_TIER` accepts `auto`, `default`, or `priority`; the default is
`priority`. The value is sent as the Responses API request-level `service_tier`,
so the app can choose priority processing per game-master call without changing
the Azure deployment-level setting.

## Scaffold Endpoints

The package scaffold includes these server routes:

- `GET /api/health` returns a basic app health response.
- `GET /api/openai/status` reports whether OpenAI runtime env is configured without exposing secrets.
- `GET /api/openai/status?check=1` attempts a server-side OpenAI-compatible connection check when `LLM_API_KEY` or `OPENAI_API_KEY` is configured.
- `GET /api/game/turn` confirms the game-turn route exists.
- `POST /api/game/turn` accepts these actions:
  - `start`: create a new game with the deterministic opening question, `Is this person alive?`, without calling OpenAI.
  - `answer`: record the answer to the active question and ask OpenAI for the next move.
  - `judge_guess`: mark the final guess as correct or incorrect without calling OpenAI.

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

The MVP route is stateless between HTTP requests. The browser sends the current explicit game state back with each `answer` or `judge_guess` action. The server validates the shape and turn rules before applying the next transition.

## Structured Model Move

Use a root object schema because the OpenAI SDK's Zod text format helper expects a root object for Structured Outputs:

```ts
type AiMove = {
  action: "ask_question" | "make_guess";
  question: string | null;
  guess: string | null;
  shortRationale: string | null;
};
```

The Zod schema then adds semantic validation:

- `ask_question` requires `question` and forbids `guess`.
- `make_guess` requires `guess` and forbids `question`.

For answered turns after the deterministic opener, the server calls
`openai.responses.parse` with `zodTextFormat(aiMoveSchema, ...)` and never
returns the raw OpenAI response to the browser.

The SDK helper generates a strict JSON Schema request through `text.format`.
The current LiteLLM endpoint has been smoke-tested with both Responses
`text.format` and Chat Completions `response_format`; both returned parsed
schema-valid output with `service_tier=priority`.

Structured Outputs can still produce refusal or incomplete edge cases. The game
route retries a failed model move once, logs the server-side cause, and then
uses a deterministic recovery move so a playable round does not break.

OpenAI's GPT-5.5 guidance says to use the Responses API, reasoning controls,
Structured Outputs, prompt caching, and static prompt prefixes for this style of
reasoning workload. The game-master call follows that shape: stable
instructions first, dynamic state last, `zodTextFormat` for the move schema,
`reasoning.effort=medium` by default, `service_tier=priority`, and a stable
`prompt_cache_key`.

## Game-Master Prompt

The game-master prompt lives in `src/lib/game/prompt.ts`. It is intentionally policy-heavy but schema-light:

- stable game behavior goes in `instructions`;
- dynamic state is sent as JSON inside `<game_state>` tags;
- output shape is enforced by Structured Outputs, not prompt prose;
- the Zod schema includes field descriptions so the generated JSON Schema is
  clear to the model and proxy;
- the prompt prioritizes high-information early questions, narrowing middle
  questions, and late discriminating guesses.
- the prompt explicitly asks the model not to apologize or refuse in this
  harmless public-figure game; uncertain states should become a strong
  discriminator or a plausible guess.
- the strategy explicitly covers modern mixed-source fame, including internet
  creators, reality TV, adult entertainment as a tactful public fame-source
  category, controversy-first public figures, and media personalities.
- server-side local strategy nudges cover observed eval weak spots: reality or
  famous-family media personalities, mature-audience public fame sources,
  notoriety/extremism splits, mixed acting/music profiles, Latin/reggaeton
  musicians, and bodybuilding-to-Hollywood crossover celebrities.

## Eval Loop

Use the real self-play eval runner when changing the prompt or local strategy:

```bash
npm run eval:game-master -- --model=gpt-5.5 --effort=medium --service-tier=priority
```

The runner uses the same structured move schema as production and an answer
oracle model to simulate a player. It records misses, schema/runtime failures,
question count, and the last transcript turns for each target. Keep the target
set broad enough to include mixed-source, global, pseudonymous, controversial,
adult-entertainment, and non-admired public figures.

## Tooling Note

The `Yes`, `No`, and `Maybe` controls are app UI choices, not OpenAI function tools for v0.

Use function tools only if the model needs to call app-owned capabilities. For the MVP, the model should return a structured move and the server should apply deterministic game rules.
