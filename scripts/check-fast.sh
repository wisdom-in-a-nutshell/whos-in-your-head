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

  if [[ ! -f package-lock.json ]]; then
    echo "check-fast: package-lock.json is required when package.json exists." >&2
    exit 1
  fi

  if [[ ! -d node_modules ]]; then
    echo "check-fast: node_modules is missing. Run npm install before committing." >&2
    exit 1
  fi

  require_npm_script() {
    local script_name="$1"
    node -e "const s=require('./package.json').scripts||{}; if (!s['$script_name']) { console.error('Missing npm script: $script_name'); process.exit(1); }"
  }

  require_npm_script lint
  require_npm_script typecheck
  require_npm_script test

  echo "check-fast: lint"
  npm run lint

  echo "check-fast: typecheck"
  npm run typecheck

  echo "check-fast: tests"
  npm run test
else
  echo "check-fast: package.json not present yet; npm validation will activate after app scaffold"
fi

echo "check-fast: ok"
