#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

"$ROOT_DIR/scripts/check-fast.sh"

if [[ -f package.json ]]; then
  echo "check-full: build"
  npm run build
else
  echo "check-full: app is not scaffolded yet; no package-level full checks available"
fi

echo "check-full: ok"
