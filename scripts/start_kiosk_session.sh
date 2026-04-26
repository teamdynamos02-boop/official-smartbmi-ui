#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${APP_DIR}/logs"
LOG_FILE="${LOG_DIR}/kiosk-browser.log"

mkdir -p "$LOG_DIR"

export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}"
KILL_CODE_ON_START="${SMARTBMI_KIOSK_KILL_CODE_ON_START:-true}"
HIDE_DESKTOP_ON_START="${SMARTBMI_KIOSK_HIDE_DESKTOP_ON_START:-false}"
ENABLE_KIOSK_BROWSER="${SMARTBMI_ENABLE_KIOSK_BROWSER:-true}"

if [[ ! "${ENABLE_KIOSK_BROWSER}" =~ ^([Tt][Rr][Uu][Ee]|1|[Yy][Ee][Ss]|[Oo][Nn])$ ]]; then
  echo "[$(date '+%F %T')] Chromium auto-launch skipped because calibration mode is active." >>"$LOG_FILE"
  exit 0
fi

# Give LXDE a moment to finish session startup.
sleep 2

if [[ "${KILL_CODE_ON_START,,}" == "true" ]]; then
  pkill -f "/usr/share/code/code" >/dev/null 2>&1 || true
  pkill -f "/home/.*/\\.vscode/" >/dev/null 2>&1 || true
  pkill -f "vscode" >/dev/null 2>&1 || true
fi

if [[ "${HIDE_DESKTOP_ON_START,,}" == "true" ]]; then
  pkill -f "lwrespawn.*/usr/bin/wf-panel-pi" >/dev/null 2>&1 || true
  pkill -f "lwrespawn.*/usr/bin/lxpanel" >/dev/null 2>&1 || true
  pkill -f "lwrespawn.*/usr/bin/pcmanfm-pi" >/dev/null 2>&1 || true
  pkill -f "lxpanel" >/dev/null 2>&1 || true
  pkill -f "wf-panel-pi" >/dev/null 2>&1 || true
  pkill -f "pcmanfm-pi" >/dev/null 2>&1 || true
  pkill -f "pcmanfm --desktop" >/dev/null 2>&1 || true
fi

# Avoid stacking multiple Chromium kiosk windows across session restarts.
pkill -f "chromium.*127.0.0.1:4173" >/dev/null 2>&1 || true
pkill -f "chromium-browser.*127.0.0.1:4173" >/dev/null 2>&1 || true
pkill -f "google-chrome.*127.0.0.1:4173" >/dev/null 2>&1 || true

"${APP_DIR}/scripts/start_kiosk_browser.sh" >>"$LOG_FILE" 2>&1
