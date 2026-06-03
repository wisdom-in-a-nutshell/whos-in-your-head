# Agent-Native Workflow

## Operating Model

This repo is optimized for a solo developer setting intent while agents implement code and maintain docs.

Durable context belongs in the repo:

- Root guidance: `AGENTS.md`
- System shape: `docs/architecture/`
- Exact implementation facts: `docs/references/`
- Multi-session project trackers only when active work needs durable execution state.

## Fast Checks

Use the repo-owned checks before ending meaningful implementation work:

```bash
scripts/check-fast.sh
```

`scripts/check-fast.sh` verifies the repo guidance/docs contract, scans for obvious OpenAI secret leaks, and runs quick package health checks suitable for the machine-wide Stop hook.

The package validation scripts are:

- `lint`
- `typecheck`
- `test`

Use the slower entrypoint when a broader local validation pass is useful:

```bash
scripts/check-full.sh
```

`scripts/check-full.sh` runs the fast checks first, then runs the production build smoke.

## Hook Contract

This repo is intended to work with the machine-wide agent Stop hook and shared local Git hook setup. Repo-specific fast validation should stay in `scripts/check-fast.sh`.

Keep `scripts/check-fast.sh` deterministic, local, quick, and actionable. If a check becomes slow or flaky, move it to `scripts/check-full.sh`.

## Branch-First Work

Use short-lived branches for exploratory or multi-step agent work.

Default pattern:

1. Start from `main`.
2. Create a branch named `codex/<short-task-name>` before editing, unless the
   user asks for another branch prefix.
3. Make changes, inspect telemetry, and iterate on that branch.
4. Run `scripts/check-fast.sh` when the change is ready.
5. Merge back to `main` only when the user or repo automation is ready for the
   Stop hook to commit and push.
6. After the merge has been pushed, delete the merged local branch and any
   merged remote branch so stale agent branches do not accumulate.

Reasoning:

- `main` is treated as production-ready, but production updates still require
  installing the local Mac mini launchd service.
- The machine-wide Stop hook may stage, commit, rebase, and push at the end of
  an agent turn.
- Keeping in-progress work off `main` prevents half-finished telemetry,
  prompt, or mechanics changes from being published while an investigation is
  still underway.

Do not manually commit or push during normal work. Let the hook and repo-owned
automation handle sync after the branch has been merged or explicitly handed
off.

## Documentation Rule

When implementation changes durable behavior, update docs in the same change:

- Architecture or module boundaries: `docs/architecture/`
- Environment variables, API contracts, schemas, commands: `docs/references/`
- Active plan/progress/blockers: create a focused tracker under `docs/projects/` only for multi-session project work
