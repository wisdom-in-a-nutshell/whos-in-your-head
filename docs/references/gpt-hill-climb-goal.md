# GPT Hill-Climb Goal

This file is the reusable operating contract for improving the GPT default path.
Use it when setting a Codex `/goal`, resuming the work after compaction, or
handing the loop to another agent.

## Copy/Paste Goal

Use this as the `/goal` command:

```text
/goal Improve the Who's In Your Head GPT default path using the repo contract in docs/references/gpt-hill-climb-goal.md. Optimize for fast model turns and correct final guesses. Work on a short-lived branch, use telemetry and live API play to identify concrete failures, make focused prompt/mechanics/client/telemetry changes, validate with repo checks, and merge to main only when the branch is ready for the normal production update path.
```

If a future agent does not automatically read this file, explicitly mention it
in the next prompt:

```text
Read docs/references/gpt-hill-climb-goal.md and follow it as the operating contract for the active /goal.
```

## Objective

Improve the live game loop for the GPT default path.

Primary outcomes:

- Faster model turns.
- More correct final guesses.

Supporting signals:

- Reported-miss rate goes down.
- Route/model error rate stays low.
- Completion rate goes up.
- Drop rate goes down.
- Token/cache efficiency stays healthy.
- Share count is tracked as a secondary product signal, not as the primary
  optimization target.

Do not optimize vague labels like "smart", "fun", or "share-worthy" unless they
are converted into concrete telemetry or observed player behavior. The current
measurable target is speed plus correctness.

## Branch Contract

Do not do exploratory or multi-step edits directly on `main`.

Before editing:

1. Check the current branch with `git branch --show-current`.
2. If on `main`, create a short-lived branch, for example
   `agent/gpt-hill-climb-YYYYMMDD` or `agent/<specific-failure>`.
3. If there are already uncommitted changes on `main`, switch to a new branch
   carrying those changes before continuing.

While working:

- Iterate freely on the branch.
- Do not manually commit or push during normal work unless explicitly asked.
- Do not merge to `main` until the change is validated and ready for the normal
  production update path.

Before merge readiness:

- Run `scripts/check-fast.sh`.
- Summarize exactly what changed, why it should affect speed/correctness, and
  what telemetry should be watched after deploy.

## GPT Path Definition

Treat the GPT workflow as:

- `gpt-chat-latest` turn telemetry.

The public game is intentionally single-model. Ignore stale or unsupported
model rows except as historical telemetry.

Gemini, Claude, and unsupported GPT paths have been removed from the product.
Do not optimize, compare, or route live games through them.

## Telemetry Loop

Start every pass with aggregate telemetry before reading transcripts.

Useful commands:

```bash
npm run telemetry -- summary --plain --minutes 30 --limit 10
npm run telemetry -- summary --plain --minutes 60 --limit 10
npm run telemetry -- dropoffs --plain --minutes 60 --limit 10
npm run telemetry -- token-stats --plain --model gpt --minutes 60 --limit 10
npm run telemetry -- model-results --json --model gpt --minutes 60 --limit 12 --include-transcript
npm run telemetry -- misses --json --minutes 60 --model gpt --limit 8 --include-transcript
```

Use transcripts only after the aggregate read shows a reason:

- GPT correct rate regressed.
- GPT reported misses increased.
- GPT latency increased.
- Model/route failures appeared.
- A repeated failure pattern is visible in recent games.

When reviewing transcripts, classify failures into concrete buckets:

- Premature narrow guess.
- Weak geography, language, field, genre, or role split.
- Nearby-person confusion after a mostly good narrowing path.
- Player likely misremembered an exact date/category.
- Too many `maybe` answers made confidence unstable.
- Stale model routing or invalid model fallback.
- Route/model error unrelated to prompt quality.

Do not edit prompts from one isolated transcript unless it shows a clear rule
violation that is likely to recur.

## Allowed Change Surface

The agent may change whatever is needed on the branch, including:

- Game-master prompt text and runtime directives.
- Game mechanics and state transitions.
- Model routing, fallback behavior, and reasoning schedule.
- Telemetry events, Mongo/Cosmos documents, and indexes.
- CLI clients under `scripts/`.
- Public aggregate stats if they remain safe and transcript-free.
- Private/operator telemetry commands that expose transcripts behind explicit
  flags.
- Private/operator drop-off telemetry that groups incomplete games by last
  question depth, model, and last action.
- Tests and docs that make the loop repeatable.

Constraints:

- Never expose `OPENAI_API_KEY`, `LLM_API_KEY`, Mongo URIs, raw model responses,
  hidden prompts, actual answers, or transcripts to the browser/public stats.
- Keep transcript access private/operator-only through repo tooling.
- Keep public `/stats` aggregate-only.
- Prefer additive telemetry schema changes over breaking existing readers.
- Keep the browser API server-owned; the client only sends sanitized game
  actions and share events.

## Change Strategy

Prefer one focused behavior change per pass.

Good changes:

- A runtime directive for a repeated failure pattern.
- A narrow prompt rule backed by several transcripts.
- A telemetry/client addition that makes the next diagnosis clearer.
- A small mechanics adjustment that prevents early or brittle guesses.

Avoid:

- Broad prompt rewrites without a measured failure.
- Changing several model-routing and prompt behaviors at once.
- Optimizing for subjective impressions instead of speed/correctness.
- Deploying an unvalidated branch because telemetry looked interesting.

## Validation

Minimum validation before considering a branch ready:

```bash
npm run lint
npm run typecheck
npm test
scripts/check-fast.sh
```

Use targeted tests while iterating, for example:

```bash
npm test -- src/lib/game/prompt.test.ts
npm run telemetry -- misses --json --minutes 60 --model gpt --limit 4 --include-transcript
```

Use live API play when behavior changes affect gameplay:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
npm run play:api -- reset
npm run play:api -- start --model gpt-chat-latest
npm run play:api -- answer yes
```

The API play path does not prove accuracy alone; it is for smoke-testing that
the game continues, asks valid questions, routes the expected model, and records
state correctly.

## Automation Role

Automation should watch and report, not edit.

The 30-minute watcher should report:

- GPT speed: route/model duration, cache read rate, token profile.
- GPT accuracy: correct/incorrect counts, reported misses.
- Error signals: route/model failures when visible.
- Secondary product signal: share counts.
- One recommended next investigation or change at most.

If automation detects a problem, a human or active `/goal` session should decide
whether to edit code.

## Done Criteria

A hill-climb pass is ready to merge when:

- It has a specific measured reason.
- The code change is focused and documented.
- Tests and `scripts/check-fast.sh` pass.
- The expected telemetry effect is stated.
- The branch is ready for `main` and the normal production update path.
