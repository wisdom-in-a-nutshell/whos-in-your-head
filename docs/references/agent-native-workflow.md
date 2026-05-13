# Agent-Native Workflow

## Operating Model

This repo is optimized for a solo developer setting intent while agents implement code and maintain docs.

Durable context belongs in the repo:

- Root guidance: `AGENTS.md`
- System shape: `docs/architecture/`
- Exact implementation facts: `docs/references/`
- Active execution state: `docs/projects/whos-in-your-head/tasks.md`

## Fast Checks

Use the repo-owned checks before ending meaningful implementation work:

```bash
scripts/check-fast.sh
```

`scripts/check-fast.sh` currently verifies the repo guidance/docs contract, scans for obvious OpenAI secret leaks, and runs npm scripts when `package.json` exists.

When the app is scaffolded, define these package scripts so the fast check can pick them up automatically:

- `lint`
- `typecheck`
- `test`
- `build`

Use the slower entrypoint when a broader local validation pass is useful:

```bash
scripts/check-full.sh
```

## Hook Contract

This repo is intended to work with the machine-wide agent Stop hook and shared local Git hook setup. Repo-specific fast validation should stay in `scripts/check-fast.sh`.

Keep `scripts/check-fast.sh` deterministic, local, quick, and actionable. If a check becomes slow or flaky, move it to `scripts/check-full.sh`.

## Documentation Rule

When implementation changes durable behavior, update docs in the same change:

- Architecture or module boundaries: `docs/architecture/`
- Environment variables, API contracts, schemas, commands: `docs/references/`
- Active plan/progress/blockers: `docs/projects/whos-in-your-head/tasks.md`
