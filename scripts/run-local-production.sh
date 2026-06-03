#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${WHOS_IN_YOUR_HEAD_HOST:-127.0.0.1}"
PORT="${WHOS_IN_YOUR_HEAD_PORT:-8794}"
NPM_BIN="${NPM_BIN:-npm}"
NODE_BIN="${NODE_BIN:-node}"
ENV_FILE="${WHOS_IN_YOUR_HEAD_ENV_FILE:-${ROOT_DIR}/.env.local}"
STANDALONE_SERVER="${ROOT_DIR}/.next/standalone/server.js"

if [[ ! -f "${ROOT_DIR}/.next/BUILD_ID" ]]; then
  echo "Missing production build at ${ROOT_DIR}/.next/BUILD_ID" >&2
  echo "Run scripts/install-launchd-whos-in-your-head.sh to build and install the service." >&2
  exit 1
fi

cd "${ROOT_DIR}"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

export NODE_ENV=production
export NEXT_TELEMETRY_DISABLED=1
export HOSTNAME="${HOST}"
export PORT="${PORT}"

if [[ -f "${STANDALONE_SERVER}" ]]; then
  exec "${NODE_BIN}" "${STANDALONE_SERVER}"
fi

exec "${NPM_BIN}" run start -- --hostname "${HOST}" --port "${PORT}"
