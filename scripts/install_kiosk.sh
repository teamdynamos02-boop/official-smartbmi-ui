#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_USER="${SUDO_USER:-${USER}}"
SYSTEMD_DIR="/etc/systemd/system"
USER_SYSTEMD_DIR="/home/${APP_USER}/.config/systemd/user"
AUTOSTART_DIR="/home/${APP_USER}/.config/lxsession/LXDE-pi"
AUTOSTART_FILE="${AUTOSTART_DIR}/autostart"
DESKTOP_AUTOSTART_DIR="/home/${APP_USER}/.config/autostart"
DESKTOP_AUTOSTART_FILE="${DESKTOP_AUTOSTART_DIR}/smartbmi-kiosk.desktop"
LIGHTDM_DIR="/etc/lightdm/lightdm.conf.d"
LIGHTDM_AUTLOGIN_FILE="${LIGHTDM_DIR}/99-smartbmi-autologin.conf"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

render_template() {
  local src="$1"
  local dest="$2"
  sed \
    -e "s|__APP_DIR__|${APP_DIR}|g" \
    -e "s|__APP_USER__|${APP_USER}|g" \
    "$src" > "$dest"
}

require_cmd npm
require_cmd python3
require_cmd systemctl

cd "$APP_DIR"

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi

.venv/bin/pip install --upgrade pip
.venv/bin/pip install flask flask-cors pyserial numpy pillow gunicorn waitress
if ! .venv/bin/pip install face_recognition ultralytics onnxruntime; then
  echo "Optional ML packages did not fully install. Core kiosk services are still configured." >&2
fi

npm install
npm run build

sudo mkdir -p "$SYSTEMD_DIR"
tmp_backend="$(mktemp)"
tmp_frontend="$(mktemp)"
tmp_kiosk="$(mktemp)"
tmp_monitor="$(mktemp)"
tmp_oled="$(mktemp)"
tmp_lightdm="$(mktemp)"

render_template "${APP_DIR}/scripts/smartbmi-backend.service.template" "$tmp_backend"
render_template "${APP_DIR}/scripts/smartbmi-frontend.service.template" "$tmp_frontend"
render_template "${APP_DIR}/scripts/smartbmi-kiosk.service.template" "$tmp_kiosk"
render_template "${APP_DIR}/scripts/smartbmi-hardware-monitor.service.template" "$tmp_monitor"
render_template "${APP_DIR}/scripts/smartbmi-oled-display.service.template" "$tmp_oled"
render_template "${APP_DIR}/scripts/99-smartbmi-autologin.conf.template" "$tmp_lightdm"

sudo cp "$tmp_backend" "${SYSTEMD_DIR}/smartbmi-backend.service"
sudo cp "$tmp_frontend" "${SYSTEMD_DIR}/smartbmi-frontend.service"
sudo cp "$tmp_monitor" "${SYSTEMD_DIR}/smartbmi-hardware-monitor.service"
sudo cp "$tmp_oled" "${SYSTEMD_DIR}/smartbmi-oled-display.service"
sudo mkdir -p "$LIGHTDM_DIR"
sudo cp "$tmp_lightdm" "$LIGHTDM_AUTLOGIN_FILE"

sudo -u "$APP_USER" mkdir -p "$USER_SYSTEMD_DIR"
sudo -u "$APP_USER" cp "$tmp_kiosk" "${USER_SYSTEMD_DIR}/smartbmi-kiosk.service"

rm -f "$tmp_backend" "$tmp_frontend" "$tmp_kiosk" "$tmp_monitor" "$tmp_oled" "$tmp_lightdm"

chmod +x "${APP_DIR}/scripts/start_kiosk_browser.sh"
chmod +x "${APP_DIR}/scripts/start_kiosk_session.sh"

sudo -u "$APP_USER" mkdir -p "$AUTOSTART_DIR"
sudo -u "$APP_USER" tee "$AUTOSTART_FILE" >/dev/null <<EOF
@xset s off
@xset -dpms
@xset s noblank
@${APP_DIR}/scripts/start_kiosk_session.sh
EOF

sudo -u "$APP_USER" mkdir -p "$DESKTOP_AUTOSTART_DIR"
sudo -u "$APP_USER" tee "$DESKTOP_AUTOSTART_FILE" >/dev/null <<EOF
[Desktop Entry]
Type=Application
Name=SmartBMI Kiosk
Exec=${APP_DIR}/scripts/start_kiosk_session.sh
X-GNOME-Autostart-enabled=true
Terminal=false
EOF

sudo loginctl enable-linger "$APP_USER"
sudo systemctl daemon-reload

if [[ "${SMARTBMI_DISABLE_PACKAGEKIT_ON_KIOSK:-true}" =~ ^([Tt][Rr][Uu][Ee]|1|[Yy][Ee][Ss]|[Oo][Nn])$ ]]; then
  sudo systemctl mask --now packagekit.service >/dev/null 2>&1 || true
  sudo systemctl mask --now packagekit-offline-update.service >/dev/null 2>&1 || true
fi

sudo systemctl enable smartbmi-backend.service
sudo systemctl enable smartbmi-frontend.service
sudo systemctl enable smartbmi-hardware-monitor.service
sudo systemctl enable smartbmi-oled-display.service
sudo systemctl restart smartbmi-backend.service
sudo systemctl restart smartbmi-frontend.service
sudo systemctl restart smartbmi-hardware-monitor.service
sudo systemctl restart smartbmi-oled-display.service

sudo -u "$APP_USER" systemctl --user daemon-reload || true
sudo -u "$APP_USER" systemctl --user enable smartbmi-kiosk.service || true
sudo -u "$APP_USER" systemctl --user restart smartbmi-kiosk.service || true

echo
echo "SmartBMI kiosk install complete."
echo "Backend:  sudo systemctl status smartbmi-backend.service"
echo "Frontend: sudo systemctl status smartbmi-frontend.service"
echo "Monitor:  sudo systemctl status smartbmi-hardware-monitor.service"
echo "OLED:     sudo systemctl status smartbmi-oled-display.service"
echo "Browser:  sudo -u ${APP_USER} systemctl --user status smartbmi-kiosk.service"
echo "Autologin: ${LIGHTDM_AUTLOGIN_FILE}"
