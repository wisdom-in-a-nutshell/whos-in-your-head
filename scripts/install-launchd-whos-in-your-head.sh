#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_SCRIPT="${ROOT_DIR}/scripts/run-local-production.sh"

LABEL="com.${USER}.whos-in-your-head"
HOST="127.0.0.1"
PORT="8794"
NPM_BIN="${NPM_BIN:-npm}"
NODE_BIN="${NODE_BIN:-node}"
ENV_FILE="${ROOT_DIR}/.env.local"
BUILD_NOW=1
INSTALL_DEPS=0
UNINSTALL=0
STATUS_ONLY=0
LOG_LINES=0

usage() {
  cat <<USAGE
Usage: $(basename "$0") [options]

Install/update the Mac mini launchd service for whos-in-your-head.

Options:
  --label <value>       LaunchAgent label (default: com.<user>.whos-in-your-head)
  --host <host>         Bind host (default: 127.0.0.1)
  --port <n>            Bind port (default: 8794)
  --npm <path>          npm binary path (default: npm)
  --node <path>         node binary path (default: node)
  --env-file <path>     Runtime env file (default: .env.local)
  --install-deps        Run npm ci before building
  --skip-build-now      Skip one-time build during install
  --uninstall           Unload and remove LaunchAgent plist
  --status              Print launchctl status and local health
  --logs [n]            Tail launchd logs (default lines: 80)
  -h, --help            Show help
USAGE
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

is_int() {
  [[ "${1:-}" =~ ^[0-9]+$ ]]
}

xml_escape() {
  local value="$1"
  value="${value//&/&amp;}"
  value="${value//</&lt;}"
  value="${value//>/&gt;}"
  printf '%s' "$value"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --label)
      LABEL="${2:-}"
      shift 2
      ;;
    --host)
      HOST="${2:-}"
      shift 2
      ;;
    --port)
      PORT="${2:-}"
      shift 2
      ;;
    --npm)
      NPM_BIN="${2:-}"
      shift 2
      ;;
    --node)
      NODE_BIN="${2:-}"
      shift 2
      ;;
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --install-deps)
      INSTALL_DEPS=1
      shift
      ;;
    --skip-build-now)
      BUILD_NOW=0
      shift
      ;;
    --uninstall)
      UNINSTALL=1
      shift
      ;;
    --status)
      STATUS_ONLY=1
      shift
      ;;
    --logs)
      if [[ -n "${2:-}" && "${2:-}" != --* ]]; then
        LOG_LINES="$2"
        shift 2
      else
        LOG_LINES=80
        shift
      fi
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

[[ -n "$LABEL" ]] || die "missing --label"
[[ -n "$HOST" ]] || die "missing --host"
is_int "$PORT" || die "invalid --port: $PORT"
is_int "$LOG_LINES" || die "invalid --logs value: $LOG_LINES"
command -v "$NPM_BIN" >/dev/null 2>&1 || [[ -x "$NPM_BIN" ]] || die "missing npm binary: $NPM_BIN"
command -v "$NODE_BIN" >/dev/null 2>&1 || [[ -x "$NODE_BIN" ]] || die "missing node binary: $NODE_BIN"
[[ -x "$RUN_SCRIPT" ]] || die "missing run script: $RUN_SCRIPT"

PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${HOME}/.local/state/whos-in-your-head/log"
OUT_LOG="${LOG_DIR}/whos-in-your-head.out.log"
ERR_LOG="${LOG_DIR}/whos-in-your-head.err.log"
DOMAIN="gui/$(id -u)"
LOCAL_HEALTH_URL="http://${HOST}:${PORT}/api/health"

print_status() {
  if ! launchctl list "${LABEL}" 2>/dev/null; then
    echo "LaunchAgent not loaded: ${LABEL}"
  fi

  if curl -fsS "${LOCAL_HEALTH_URL}" >/dev/null 2>&1; then
    echo "Local health: ok"
  else
    echo "Local health: unavailable"
  fi
  echo "Local URL: http://${HOST}:${PORT}/"
}

render_plist() {
  cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>$(xml_escape "$LABEL")</string>
    <key>ProgramArguments</key>
    <array>
      <string>$(xml_escape "$RUN_SCRIPT")</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$(xml_escape "$ROOT_DIR")</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>60</integer>
    <key>StandardOutPath</key>
    <string>$(xml_escape "$OUT_LOG")</string>
    <key>StandardErrorPath</key>
    <string>$(xml_escape "$ERR_LOG")</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>PATH</key>
      <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
      <key>HOME</key>
      <string>$(xml_escape "$HOME")</string>
      <key>NODE_ENV</key>
      <string>production</string>
      <key>NEXT_TELEMETRY_DISABLED</key>
      <string>1</string>
      <key>WHOS_IN_YOUR_HEAD_HOST</key>
      <string>$(xml_escape "$HOST")</string>
      <key>WHOS_IN_YOUR_HEAD_PORT</key>
      <string>$(xml_escape "$PORT")</string>
      <key>WHOS_IN_YOUR_HEAD_ENV_FILE</key>
      <string>$(xml_escape "$ENV_FILE")</string>
      <key>NPM_BIN</key>
      <string>$(xml_escape "$NPM_BIN")</string>
      <key>NODE_BIN</key>
      <string>$(xml_escape "$NODE_BIN")</string>
    </dict>
  </dict>
</plist>
PLIST
}

if [[ "${STATUS_ONLY}" -eq 1 ]]; then
  print_status
  exit 0
fi

if [[ "${LOG_LINES}" -gt 0 ]]; then
  echo "[logs] stdout: ${OUT_LOG}"
  tail -n "${LOG_LINES}" "${OUT_LOG}" 2>/dev/null || true
  echo "[logs] stderr: ${ERR_LOG}"
  tail -n "${LOG_LINES}" "${ERR_LOG}" 2>/dev/null || true
  exit 0
fi

if [[ "${UNINSTALL}" -eq 1 ]]; then
  launchctl bootout "${DOMAIN}" "${PLIST_PATH}" >/dev/null 2>&1 || true
  rm -f "${PLIST_PATH}"
  echo "Uninstalled ${LABEL}"
  echo "Plist removed: ${PLIST_PATH}"
  exit 0
fi

if [[ "${BUILD_NOW}" -eq 1 ]]; then
  cd "${ROOT_DIR}"
  if [[ "${INSTALL_DEPS}" -eq 1 || ! -d node_modules ]]; then
    "${NPM_BIN}" ci
  fi
  "${NPM_BIN}" run build
  rm -rf .next/standalone/public .next/standalone/.next/static
  if [[ -d public ]]; then
    cp -R public .next/standalone/public
  fi
  mkdir -p .next/standalone/.next
  cp -R .next/static .next/standalone/.next/static
fi

mkdir -p "$(dirname "${PLIST_PATH}")" "${LOG_DIR}"
render_plist >"${PLIST_PATH}"
chmod 0644 "${PLIST_PATH}"

launchctl bootout "${DOMAIN}" "${PLIST_PATH}" >/dev/null 2>&1 || true
launchctl bootstrap "${DOMAIN}" "${PLIST_PATH}"
launchctl kickstart -k "${DOMAIN}/${LABEL}" >/dev/null 2>&1 || true

echo "Loaded ${LABEL} from ${PLIST_PATH}"
echo "Logs:"
echo "  ${OUT_LOG}"
echo "  ${ERR_LOG}"
print_status
