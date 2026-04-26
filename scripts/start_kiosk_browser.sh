#!/usr/bin/env bash
set -euo pipefail

APP_URL="${SMARTBMI_APP_URL:-http://127.0.0.1:4173}"
FRONTEND_READY_URL="${SMARTBMI_FRONTEND_READY_URL:-${APP_URL}}"
BACKEND_READY_URL="${SMARTBMI_BACKEND_READY_URL:-http://127.0.0.1:5000/face/status}"
CAMERA_READY_URL="${SMARTBMI_CAMERA_READY_URL:-http://127.0.0.1:5000/camera/pi/status}"
SYSTEM_READY_URL="${SMARTBMI_SYSTEM_READY_URL:-http://127.0.0.1:5000/system/status}"
STARTUP_WAIT_SECONDS="${SMARTBMI_STARTUP_WAIT_SECONDS:-120}"
POST_READY_CAMERA_SETTLE_SECONDS="${SMARTBMI_POST_READY_CAMERA_SETTLE_SECONDS:-4}"
KIOSK_PROFILE_DIR="${SMARTBMI_KIOSK_PROFILE_DIR:-$HOME/.config/smartbmi-kiosk-browser}"
KIOSK_LOCK_FILE="${SMARTBMI_KIOSK_LOCK_FILE:-/tmp/smartbmi-kiosk-browser.lock}"
RENDERER_MODE="${SMARTBMI_KIOSK_RENDERER_MODE:-auto}"
ENABLE_KIOSK_BROWSER="${SMARTBMI_ENABLE_KIOSK_BROWSER:-true}"
HIDE_DESKTOP_ON_START="${SMARTBMI_KIOSK_HIDE_DESKTOP_ON_START:-true}"
BROWSER_WINDOW_MODE="${SMARTBMI_BROWSER_WINDOW_MODE:-kiosk}"
BROWSER_DISABLE_GPU="${SMARTBMI_KIOSK_DISABLE_GPU:-false}"
BROWSER_BIN=""
DESKTOP_WAS_HIDDEN="false"

if [[ ! "${ENABLE_KIOSK_BROWSER}" =~ ^([Tt][Rr][Uu][Ee]|1|[Yy][Ee][Ss]|[Oo][Nn])$ ]]; then
  echo "Chromium auto-launch is disabled for calibration mode."
  exec tail -f /dev/null
fi

exec 9>"${KIOSK_LOCK_FILE}"
if ! flock -n 9; then
  echo "SmartBMI kiosk browser is already running."
  exit 0
fi

for candidate in /usr/lib/chromium/chromium /usr/lib/chromium-browser/chromium-browser chromium-browser chromium google-chrome-stable google-chrome; do
  if [[ -x "$candidate" ]]; then
    BROWSER_BIN="$candidate"
    break
  fi
  if command -v "$candidate" >/dev/null 2>&1; then
    BROWSER_BIN="$(command -v "$candidate")"
    break
  fi
done

if [[ -z "$BROWSER_BIN" ]]; then
  echo "No Chromium/Chrome browser found." >&2
  exit 1
fi

hide_desktop_shell() {
  pkill -f "lwrespawn.*/usr/bin/wf-panel-pi" >/dev/null 2>&1 || true
  pkill -f "lwrespawn.*/usr/bin/lxpanel" >/dev/null 2>&1 || true
  pkill -f "lwrespawn.*/usr/bin/pcmanfm-pi" >/dev/null 2>&1 || true
  pkill -f "lxpanel" >/dev/null 2>&1 || true
  pkill -f "wf-panel-pi" >/dev/null 2>&1 || true
  pkill -f "pcmanfm-pi" >/dev/null 2>&1 || true
  pkill -f "pcmanfm --desktop" >/dev/null 2>&1 || true
}

restore_desktop_shell() {
  if [[ "${DESKTOP_WAS_HIDDEN}" != "true" ]]; then
    return
  fi
  if command -v lxpanelctl >/dev/null 2>&1; then
    lxpanelctl restart >/dev/null 2>&1 || true
  fi
  if command -v pcmanfm >/dev/null 2>&1; then
    pcmanfm --desktop --profile LXDE-pi >/dev/null 2>&1 &
  fi
}

cleanup() {
  restore_desktop_shell
}

trap cleanup EXIT INT TERM

if [[ "${HIDE_DESKTOP_ON_START,,}" == "true" ]]; then
  DESKTOP_WAS_HIDDEN="true"
  hide_desktop_shell
fi

wait_for_url() {
  local url="$1"
  local label="$2"
  local deadline
  deadline=$((SECONDS + STARTUP_WAIT_SECONDS))

  while (( SECONDS < deadline )); do
    if command -v curl >/dev/null 2>&1; then
      if curl --silent --show-error --fail --max-time 2 "$url" >/dev/null 2>&1; then
        echo "$label ready: $url"
        return 0
      fi
    elif command -v wget >/dev/null 2>&1; then
      if wget -q -T 2 -O /dev/null "$url" >/dev/null 2>&1; then
        echo "$label ready: $url"
        return 0
      fi
    else
      echo "Neither curl nor wget is available for readiness checks." >&2
      return 0
    fi
    sleep 1
  done

  echo "Timed out waiting for $label: $url" >&2
  return 1
}

wait_for_url "$BACKEND_READY_URL" "Backend"
wait_for_url "$CAMERA_READY_URL" "Pi camera"
wait_for_url "$SYSTEM_READY_URL" "System status"
wait_for_url "$FRONTEND_READY_URL" "Frontend"

if [[ "${POST_READY_CAMERA_SETTLE_SECONDS}" =~ ^[0-9]+$ ]] && (( POST_READY_CAMERA_SETTLE_SECONDS > 0 )); then
  echo "Allowing camera stack to settle for ${POST_READY_CAMERA_SETTLE_SECONDS}s..."
  sleep "$POST_READY_CAMERA_SETTLE_SECONDS"
fi

mkdir -p "$KIOSK_PROFILE_DIR"

pkill -f "chromium.*--user-data-dir=${KIOSK_PROFILE_DIR}" >/dev/null 2>&1 || true
pkill -f "chromium-browser.*--user-data-dir=${KIOSK_PROFILE_DIR}" >/dev/null 2>&1 || true
pkill -f "google-chrome.*--user-data-dir=${KIOSK_PROFILE_DIR}" >/dev/null 2>&1 || true
pkill -f "google-chrome-stable.*--user-data-dir=${KIOSK_PROFILE_DIR}" >/dev/null 2>&1 || true
sleep 1

unset CHROMIUM_FLAGS
unset CHROME_EXTRA_ARGS
unset CHROMIUM_USER_FLAGS

declare -a RENDERER_FLAGS=()
declare -a WINDOW_FLAGS=()
declare -a APP_TARGET_FLAGS=()

case "${RENDERER_MODE,,}" in
  software)
    RENDERER_FLAGS=(
      --disable-gpu
      --disable-gpu-compositing
      --disable-gpu-rasterization
      --disable-accelerated-2d-canvas
      --disable-accelerated-video-decode
      --use-gl=swiftshader
    )
    ;;
  gpu)
    RENDERER_FLAGS=(
      --ignore-gpu-blocklist
    )
    ;;
  *)
    RENDERER_FLAGS=()
    ;;
esac

if [[ "${BROWSER_DISABLE_GPU,,}" == "true" ]]; then
  RENDERER_FLAGS=(
    --disable-gpu
    --disable-gpu-compositing
    --disable-gpu-rasterization
    --disable-accelerated-2d-canvas
  )
fi

case "${BROWSER_WINDOW_MODE,,}" in
  kiosk)
    WINDOW_FLAGS=(--kiosk --start-fullscreen --window-position=0,0)
    APP_TARGET_FLAGS=(--app="$APP_URL")
    ;;
  fullscreen)
    WINDOW_FLAGS=(--start-fullscreen --window-position=0,0)
    APP_TARGET_FLAGS=(--app="$APP_URL")
    ;;
  *)
    WINDOW_FLAGS=(--start-maximized)
    APP_TARGET_FLAGS=(--app="$APP_URL")
    ;;
esac

env -u CHROMIUM_FLAGS -u CHROME_EXTRA_ARGS -u CHROMIUM_USER_FLAGS "$BROWSER_BIN" \
  --user-data-dir="$KIOSK_PROFILE_DIR" \
  --password-store=basic \
  --use-mock-keychain \
  --noerrdialogs \
  --no-first-run \
  --no-default-browser-check \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-component-update \
  --disable-background-networking \
  --disable-background-timer-throttling \
  --disable-backgrounding-occluded-windows \
  --disable-renderer-backgrounding \
  --disable-sync \
  --disable-features=Translate,TranslateUI,PasswordManagerOnboarding,AutofillServerCommunication,MediaRouter,OptimizationHints,NotificationTriggers \
  --disable-notifications \
  --disable-pinch \
  --disable-translate \
  --disable-dev-shm-usage \
  --disable-prompt-on-repost \
  --disable-save-password-bubble \
  --disable-restore-session-state \
  --disable-breakpad \
  --disable-crash-reporter \
  --disable-default-apps \
  --disable-extensions \
  --disable-tab-for-desktop-share-picker \
  --overscroll-history-navigation=0 \
  --use-fake-ui-for-media-stream \
  --allow-file-access-from-files \
  --allow-insecure-localhost \
  --unsafely-treat-insecure-origin-as-secure=http://127.0.0.1:4173,http://localhost:4173,http://127.0.0.1:5000,http://localhost:5000 \
  --check-for-update-interval=31536000 \
  --autoplay-policy=no-user-gesture-required \
  "${APP_TARGET_FLAGS[@]}" \
  "${WINDOW_FLAGS[@]}" \
  "${RENDERER_FLAGS[@]}" \
  --incognito

exit $?
