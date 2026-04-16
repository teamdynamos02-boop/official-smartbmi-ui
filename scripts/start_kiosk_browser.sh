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
RENDERER_MODE="${SMARTBMI_KIOSK_RENDERER_MODE:-auto}"
BROWSER_BIN=""

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

unset CHROMIUM_FLAGS
unset CHROME_EXTRA_ARGS
unset CHROMIUM_USER_FLAGS

declare -a RENDERER_FLAGS=()

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

exec env -u CHROMIUM_FLAGS -u CHROME_EXTRA_ARGS -u CHROMIUM_USER_FLAGS "$BROWSER_BIN" \
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
  --disable-sync \
  --disable-features=Translate,PasswordManagerOnboarding,AutofillServerCommunication,MediaRouter,OptimizationHints,NotificationTriggers \
  --disable-notifications \
  --disable-prompt-on-repost \
  --disable-save-password-bubble \
  --disable-restore-session-state \
  --disable-breakpad \
  --disable-crash-reporter \
  --overscroll-history-navigation=0 \
  --use-fake-ui-for-media-stream \
  --check-for-update-interval=31536000 \
  --autoplay-policy=no-user-gesture-required \
  --start-maximized \
  "${RENDERER_FLAGS[@]}" \
  --app="$APP_URL" \
  --kiosk \
  --incognito \
  "$APP_URL"
