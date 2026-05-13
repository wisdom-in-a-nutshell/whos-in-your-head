# Game Master Strategy

This document records how the backend should make the game feel smart while staying simple enough for a fast public demo.

## Product Loop

The player silently thinks of one famous real person. The app asks one question at a time. The player answers only `yes`, `no`, or `maybe`. The AI must guess who is in the player's head before or at 21 questions.

The browser can be playful, but the backend contract stays strict:

- no free-text hints from the player
- one model move per server turn
- one yes/no-compatible question per question move
- app-owned question count and transcript
- final guess path enforced in code

## Human Play Contract

The player should understand the game in under 5 seconds:

- think of someone famous
- keep the name secret
- answer honestly
- use `maybe` when the question is ambiguous, mixed, or they are not sure
- judge the final guess as correct or incorrect

`maybe` is not a failure state. It is useful signal, and the game master should treat it as weak evidence rather than a contradiction.

## AI Play Strategy

The model should not behave like a chat assistant. It is the hidden game master.

Early game, ask high-information split questions:

- living vs not
- broad fame domain
- era of fame
- geography
- medium or public role
- current cultural prominence

Middle game, narrow the cluster:

- actor, musician, athlete, politician, founder, creator, journalist, activist
- decade of peak fame
- public region or language market
- whether they are known for one iconic work, franchise, team, office, company, or event
- whether the person is more internet-native, television-native, film-native, sports-native, or politics-native

Late game, discriminate or guess:

- avoid broad questions once a small candidate set is likely
- ask about one distinctive public clue
- from question 16 onward, strongly consider guessing when one candidate is clearly ahead
- at the limit, make the best plausible guess instead of refusing

If answers conflict, assume honest human uncertainty. Ask robust recovery questions instead of pointing out the inconsistency.

## Prompting Notes

The OpenAI docs guidance used for this implementation:

- Use the Responses API for GPT-5.5 multi-turn reasoning workflows.
- Put stable behavior and game policy in `instructions`.
- Use Structured Outputs via `text.format` and SDK Zod helpers instead of describing a JSON schema in the prompt.
- Keep stable prompt content before dynamic game state to help prompt caching.
- Use app-owned explicit state as the authority; `previous_response_id` can be added later as a continuity hint, but it should not be the source of truth.

The model receives the current inspectable state as JSON inside `<game_state>` tags, plus a short directive. The output schema allows only:

- `ask_question` with `question`, no `guess`
- `make_guess` with `guess`, no `question`

`shortRationale` is required by the schema but nullable. It exists for server-side debugging and can stay hidden from players.

## Backend Guardrails

The server validates requests and model output in layers:

- request body shape with Zod
- OpenAI structured output with `responses.parse` and `zodTextFormat`
- semantic move checks in `aiMoveSchema`
- deterministic game-rule checks in `applyAiMove`

Code rejects:

- answering when no question is active
- asking more than 21 questions
- open-ended model questions
- multiple questions in one turn
- judging a guess before a guess exists

The current backend is intentionally stateless between HTTP requests. The browser sends the current explicit state back to the server; the server validates it, applies one action, asks OpenAI for one structured move when needed, then returns sanitized state. This keeps the MVP simple and deployable. If the app later needs multiplayer, anti-tamper behavior, or session resume, add server-side persistence without changing the model-move contract.
