#!/usr/bin/env bash
set -euo pipefail

APP_URL="http://127.0.0.1:4173"
READY_URL="http://127.0.0.1:4173"
BACKEND_READY_URL="${SMARTBMI_BACKEND_READY_URL:-http://127.0.0.1:5000/face/status}"
CAMERA_READY_URL="${SMARTBMI_CAMERA_READY_URL:-http://127.0.0.1:5000/camera/pi/status}"
SYSTEM_READY_URL="${SMARTBMI_SYSTEM_READY_URL:-http://127.0.0.1:5000/system/status}"
APP_MATCH="--app=${APP_URL}"
LOG_DIR="/home/dynamos/smartbmi-ui/logs"
LOG_FILE="${LOG_DIR}/kiosk-launcher.log"
KIOSK_BROWSER_LOG="${LOG_DIR}/kiosk-browser.log"
LOCK_FILE="/tmp/smartbmi-kiosk.lock"
USE_LIBCAMERIFY="${SMARTBMI_KIOSK_USE_LIBCAMERIFY:-false}"
POST_READY_CAMERA_SETTLE_SECONDS="${SMARTBMI_POST_READY_CAMERA_SETTLE_SECONDS:-4}"

mkdir -p "${LOG_DIR}"
touch "${LOG_FILE}"
touch "${KIOSK_BROWSER_LOG}"
exec >>"${LOG_FILE}" 2>&1

echo
echo "[$(date '+%F %T')] Smart BMI kiosk launcher started"

export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-/home/dynamos/.Xauthority}"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "[$(date '+%F %T')] Kiosk launcher already running. Exiting."
  exit 0
fi

sleep 20

wait_for_url() {
  local url="$1"
  local label="$2"
  local attempts="${3:-60}"

  for i in $(seq 1 "$attempts"); do
    if curl -fsS --max-time 2 "${url}" >/dev/null 2>&1; then
      echo "[$(date '+%F %T')] ${label} is reachable at ${url}"
      return 0
    fi
    echo "[$(date '+%F %T')] Waiting for ${label}... (${i}/${attempts})"
    sleep 2
  done

  echo "[$(date '+%F %T')] ${label} never became ready: ${url}"
  return 1
}

wait_for_url "${BACKEND_READY_URL}" "Backend" 60 || exit 1
if ! wait_for_url "${CAMERA_READY_URL}" "Pi camera" 60; then
  echo "[$(date '+%F %T')] Pi camera not ready yet. Launching kiosk anyway."
fi
if ! wait_for_url "${SYSTEM_READY_URL}" "System status" 60; then
  echo "[$(date '+%F %T')] System status not ready yet. Launching kiosk anyway."
fi
wait_for_url "${READY_URL}" "Frontend" 60 || exit 1

if [[ "${POST_READY_CAMERA_SETTLE_SECONDS}" =~ ^[0-9]+$ ]] && (( POST_READY_CAMERA_SETTLE_SECONDS > 0 )); then
  echo "[$(date '+%F %T')] Allowing camera stack to settle for ${POST_READY_CAMERA_SETTLE_SECONDS}s"
  sleep "${POST_READY_CAMERA_SETTLE_SECONDS}"
fi

if pgrep -af 'chromium|chromium-browser' | grep -F -- "${APP_MATCH}" | grep -q -- '--kiosk'; then
  echo "[$(date '+%F %T')] Smart BMI kiosk is already running. Exiting."
  exit 0
fi

CHROMIUM_BIN=""
for candidate in /usr/lib/chromium/chromium /usr/bin/chromium /usr/bin/chromium-browser chromium-browser chromium; do
  if [[ -x "${candidate}" ]]; then
    CHROMIUM_BIN="${candidate}"
    break
  fi
  if command -v "${candidate}" >/dev/null 2>&1; then
    CHROMIUM_BIN="$(command -v "${candidate}")"
    break
  fi
done

if [[ -z "${CHROMIUM_BIN}" ]]; then
  echo "[$(date '+%F %T')] Chromium not found."
  exit 1
fi

LAUNCH_PREFIX=()
if [[ "${USE_LIBCAMERIFY,,}" == "true" ]] && command -v libcamerify >/dev/null 2>&1; then
  LAUNCH_PREFIX=("$(command -v libcamerify)")
  echo "[$(date '+%F %T')] Launching Chromium through libcamerify."
fi

unset CHROMIUM_FLAGS
unset CHROME_EXTRA_ARGS
unset CHROMIUM_USER_FLAGS
unset CHROME_DESKTOP
unset ELECTRON_RUN_AS_NODE
unset GTK_PATH

exec env -u CHROMIUM_FLAGS -u CHROME_EXTRA_ARGS -u CHROMIUM_USER_FLAGS -u CHROME_DESKTOP -u ELECTRON_RUN_AS_NODE -u GTK_PATH nice -n 5 "${LAUNCH_PREFIX[@]}" "${CHROMIUM_BIN}" \
  --user-data-dir=/home/dynamos/.config/smartbmi-kiosk-browser \
  --password-store=basic \
  --use-mock-keychain \
  --noerrdialogs \
  --no-first-run \
  --no-default-browser-check \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-component-update \
  --disable-background-networking \
  --disable-sync \
  --disable-extensions \
  --disable-features=Translate,PasswordManagerOnboarding,AutofillServerCommunication,MediaRouter,OptimizationHints,NotificationTriggers,WebRtcPipeWireCamera \
  --disable-notifications \
  --disable-prompt-on-repost \
  --disable-save-password-bubble \
  --disable-restore-session-state \
  --disable-breakpad \
  --disable-crash-reporter \
  --overscroll-history-navigation=0 \
  --use-fake-ui-for-media-stream \
  --ozone-platform=x11 \
  --check-for-update-interval=31536000 \
  --autoplay-policy=no-user-gesture-required \
  --start-maximized \
  --app="${APP_URL}" \
  --kiosk \
  --incognito \
  "${APP_URL}" >>"${KIOSK_BROWSER_LOG}" 2>&1
