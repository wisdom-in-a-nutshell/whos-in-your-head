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
- `LLM_FALLBACK_MODELS`
- `LLM_REASONING_EFFORT`
- `LLM_SERVICE_TIER`

The server also accepts the OpenAI SDK names `OPENAI_API_KEY`,
`OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_FALLBACK_MODELS`,
`OPENAI_REASONING_EFFORT`, and `OPENAI_SERVICE_TIER` as local fallbacks.
Deployed Azure runtime should use
`LLM_API_*` app settings backed by Key Vault references so the repo does not
depend on ambient global OpenAI provider routing.

`LLM_FALLBACK_MODELS` is a comma- or newline-separated model chain. It is used
only when the primary Responses call returns `status: "incomplete"` with
`incomplete_details.reason: "content_filter"`. That shape is currently logged
as a successful LiteLLM `/responses` call instead of a router
`ContentPolicyViolationError`, so the app owns this narrow fallback case.

`LLM_REASONING_EFFORT` accepts `none`, `minimal`, `low`, `medium`, `high`, or
`xhigh`; the code default is `high` for this game. The runtime uses a
deterministic per-turn reasoning schedule for snappier play: turns generated
after questions 1-8 use `low`, turns after questions 9-16 use `medium`, and
turns after question 17+ use `LLM_REASONING_EFFORT`. This changes only the
request-level `reasoning.effort`; the stable prompt prefix, `prompt_cache_key`,
and Responses state chain stay the same.

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
  - `start`: create a new game with the deterministic opening question, `Is this person alive?`, without blocking on OpenAI. The server also starts a background warmup for the first post-opener model moves.
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
- `modelResponseId`

The MVP route keeps HTTP handling stateless, but model turns are linked with
the Responses API state chain. After the deterministic opener, the browser sends
the current explicit game state back with each `answer` or `judge_guess` action,
including the last `modelResponseId`. The server validates the shape and turn
rules before applying the next transition, then sends `previous_response_id`
when asking the model for the next move.

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

Structured Outputs can still produce refusal, incomplete, or provider failure
edge cases. The game route retries a failed model move once and logs the
server-side cause. If both attempts fail, it returns a failed-turn response so
the browser can keep the same preserved game state and let the player retry the
same answer. The app does not invent local recovery questions.

The first model-move attempt uses the normal LiteLLM response cache behavior.
If that attempt fails schema parsing or game-rule application, the second
attempt adds a retry marker to the model input and sends LiteLLM cache controls
to bypass response-cache replay and avoid storing the failed retry response.
The retry also ignores `previous_response_id` and rebuilds from the full
transcript, so one bad stored Responses branch cannot trap a game turn. This
keeps the healthy path fast while making recovery intentionally fresh.

If the failed response is specifically an incomplete content-filter response,
the route tries `LLM_FALLBACK_MODELS` before giving up. Fallback model calls use
the same structured output schema, same prompt, and same server-side game-rule
validation, but they rebuild from explicit game state instead of continuing the
primary model's `previous_response_id`. A successful fallback move is applied
to explicit game state, but its response id is not preserved for future primary
model turns; the next turn rebuilds from transcript rather than crossing model
response chains.

OpenAI's GPT-5.5 guidance says to use the Responses API, reasoning controls,
Structured Outputs, conversation state, prompt caching, and static prompt
prefixes for this style of reasoning workload. The game-master call follows
that shape: stable instructions first, dynamic state last, `previous_response_id`
for continued turns, `zodTextFormat` for the move schema,
the low/medium/high reasoning schedule, `service_tier=priority`, and a stable
`prompt_cache_key`. It also requests `prompt_cache_retention=24h` for
GPT-5.5-compatible extended prompt caching.

Do not set a small `max_output_tokens` limit on this call. Reasoning tokens
count against the output budget, and a high-reasoning request can otherwise
spend the entire budget before emitting the structured JSON payload.

Because `previous_response_id` depends on provider-stored Responses state, the
game-master call uses `store: true`. If a future privacy mode requires zero
provider state, switch to manual context management by sending the prior output
items back instead of the response id.

The first public question is local so the round starts instantly. On `start`,
the server asynchronously prewarms shared model responses for the common `yes`
and `no` answers to that opener. If the player spends even a short moment on
the first question, answering `yes` or `no` can reuse the warmed model move and
response id instead of waiting for a fresh model call. The rare `maybe` branch
uses the normal model path. The warmed response ids contain only the generic
opener transcript (`Is this person alive?` plus `yes` or `no`), not a
player-specific target. Player games still keep unique `gameId` values and
branch into unique model response chains after the next answer.

Local smoke on 2026-05-13 showed that prompt caching is supported through the
current LiteLLM/Azure path when a stable user-message prefix is followed by a
varying suffix; later calls reported nonzero `cached_tokens`. Caching is still
provider-routed and should be observed through response usage plus the LiteLLM
dashboard rather than assumed for every individual request.

## Game-Master Prompt

The game-master prompt lives in `src/lib/game/prompt.ts`. It is intentionally policy-heavy but schema-light:

- stable game behavior is sent at the start of the first model input so the
  prefix can participate in prompt caching through the current proxy;
- continued turns use `previous_response_id` plus a small latest-turn input;
- dynamic state is sent as JSON inside `<game_state>` tags on the first model
  turn;
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
- failed model turns are surfaced as retryable question failures. The current
  game state is preserved; no local game-master fallback invents a question.

## Tooling Note

The `Yes`, `No`, and `Maybe` controls are app UI choices, not OpenAI function tools for v0.

Use function tools only if the model needs to call app-owned capabilities. For the MVP, the model should return a structured move and the server should apply deterministic game rules.

## Production Log Client

The app emits structured stdout lines with a `[whiyh]` prefix. These logs include
turn request ids, game ids, model/runtime settings, response ids, token usage,
cache counts, and sanitized error details. They intentionally do not include API
keys or hidden prompt text.

Use the repo client to download and inspect Azure App Service logs:

```bash
npm run logs:prod -- --json --limit 50
npm run logs:prod -- --plain --contains "Tamil film"
npm run logs:prod -- --event game_master_request_failed
```

The default output is a stable JSON envelope with `schema_version`, `status`,
`data`, `error`, and `meta` fields so agents can consume it without scraping
operator prose.

## Game Telemetry

Completed game stats and debugging telemetry are stored in the shared
Mongo/Cosmos runtime database when `MONGODB_URI` is configured and
`GAME_TELEMETRY_ENABLED` is not `false`.

Runtime secret ownership:

- `MONGODB_URI` belongs in Azure Key Vault as `aipodcasting--mongodb-uri`.
- The Web App consumes it through an App Service Key Vault reference.
- Do not store the Mongo URI in GitHub Actions secrets or tracked files.

Collections:

- `whiyh_game_results`: one upserted document per completed game, keyed by
  `gameId`. Stores final correctness, question count, final guess, compact
  answer path, full question/answer transcript, optional player-reported
  actual answer after a wrong guess, and round duration.
- `whiyh_game_events`: append-only turn events. Stores request duration,
  model duration, model/source, fallback source, prompt-cache key, response id,
  input/cached/output/reasoning/total token counts, current question count, and
  the proposed next move. It also records `actual_answer_reported` events when
  a player tells the app who they were thinking of after a missed final guess.
- `whiyh_game_failures`: append-only failure records. Stores request id, game
  id when available, phase, question count, latest question, compact answer
  path, transcript, sanitized action body, and structured error details.

Telemetry writes are non-blocking. If Mongo is missing or unavailable, the game
continues and logs `game_telemetry_write_failed`.

`GET /api/stats` returns only safe aggregate public stats for the result screen:
completed games, correct/wrong counts, correct rate, average questions,
average response duration, average model duration, average reasoning/cache
tokens, fallback counts, started/completed/abandoned counts, and per-model turn
and guess aggregates. It may return the aggregate count of reported misses, but
never returns actual answers or raw transcripts.

`GET /stats` renders those public aggregates as a shareable scoreboard page.
The page is intentionally aggregate-only: it can show how often the game wins,
how many rounds dropped off, how long turns take, and which models took turns or
made guesses, but it does not expose any individual transcript.
