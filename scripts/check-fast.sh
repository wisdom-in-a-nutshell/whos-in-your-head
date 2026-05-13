#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

echo "check-fast: repo contract"
test -f AGENTS.md
test -f README.md
test -f docs/architecture/overview.md
test -f docs/projects/whos-in-your-head/tasks.md
test -d tmp

echo "check-fast: secret scan"
if git grep -n -I -E \
  'OPENAI_API_KEY[[:space:]]*=[[:space:]]*["'\'']?sk-|sk-[A-Za-z0-9_-]{20,}' \
  -- . ':(exclude).env.example' ':(exclude)package-lock.json'; then
  echo "Potential secret found in tracked repo files. Move secrets to ignored env files or a secret manager." >&2
  exit 1
fi

if [[ -f package.json ]]; then
  echo "check-fast: package scripts"

  run_npm_script_if_present() {
    local script_name="$1"
    if node -e "const s=require('./package.json').scripts||{}; process.exit(s['$script_name'] ? 0 : 1)"; then
      npm run "$script_name"
    else
      echo "check-fast: npm script '$script_name' not defined; skipping"
    fi
  }

  run_npm_script_if_present lint
  run_npm_script_if_present typecheck
  run_npm_script_if_present test
  run_npm_script_if_present build
else
  echo "check-fast: package.json not present yet; npm validation will activate after app scaffold"
fi

echo "check-fast: ok"
