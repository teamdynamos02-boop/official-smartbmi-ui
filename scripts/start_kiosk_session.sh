#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${APP_DIR}/logs"
LOG_FILE="${LOG_DIR}/kiosk-browser.log"

mkdir -p "$LOG_DIR"

export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}"
KILL_CODE_ON_START="${SMARTBMI_KIOSK_KILL_CODE_ON_START:-true}"

# Give LXDE a moment to finish session startup.
sleep 2

if [[ "${KILL_CODE_ON_START,,}" == "true" ]]; then
  pkill -f "/usr/share/code/code" >/dev/null 2>&1 || true
  pkill -f "/home/.*/\\.vscode/" >/dev/null 2>&1 || true
  pkill -f "vscode" >/dev/null 2>&1 || true
fi

# Avoid stacking multiple Chromium kiosk windows across session restarts.
pkill -f "chromium.*127.0.0.1:4173" >/dev/null 2>&1 || true
pkill -f "chromium-browser.*127.0.0.1:4173" >/dev/null 2>&1 || true
pkill -f "google-chrome.*127.0.0.1:4173" >/dev/null 2>&1 || true

while true; do
  "${APP_DIR}/scripts/start_kiosk_browser.sh" >>"$LOG_FILE" 2>&1 && exit 0
  echo "Kiosk launcher retrying in 10 seconds..." >>"$LOG_FILE"
  sleep 10
done
