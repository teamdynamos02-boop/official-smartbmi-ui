# SmartBMI Kiosk Setup

This project now includes a production-style kiosk setup so the machine can boot directly into the SmartBMI app without manually running the frontend or backend.

## What it does

- Runs the Flask backend from `app.py` on `http://127.0.0.1:5000`
- Builds and serves the React frontend from `dist/` on `http://127.0.0.1:4173`
- Runs the Raspberry Pi hardware reporter at boot
- Runs the OLED updater at boot when present
- Can launch Chromium after the graphical session starts when kiosk browser mode is enabled
- Waits for the backend and frontend to answer before opening the browser
- Enables desktop autologin for the kiosk user so no password prompt is needed after reboot
- Lets the Arduino firmware auto-run on power, while the backend claims the serial port and reconnects automatically if the stream stalls

## One-command install

Run this from the project root:

```bash
bash scripts/install_kiosk.sh
```

The installer will:

- create `.venv` if needed
- install backend Python packages
- run `npm install`
- run `npm run build`
- install and enable `systemd` services
- install LXDE autostart kiosk boot logic
- configure LightDM autologin for the kiosk user

## Installed services

- `smartbmi-backend.service`
- `smartbmi-frontend.service`
- `smartbmi-hardware-monitor.service`
- `smartbmi-oled-display.service`
- `smartbmi-kiosk.service`

## Useful commands

```bash
sudo systemctl status smartbmi-backend.service
sudo systemctl status smartbmi-frontend.service
sudo systemctl status smartbmi-hardware-monitor.service
sudo systemctl status smartbmi-oled-display.service
sudo -u "$USER" systemctl --user status smartbmi-kiosk.service
```

```bash
sudo systemctl restart smartbmi-backend.service
sudo systemctl restart smartbmi-frontend.service
sudo systemctl restart smartbmi-hardware-monitor.service
sudo systemctl restart smartbmi-oled-display.service
sudo -u "$USER" systemctl --user restart smartbmi-kiosk.service
```

## Notes

- Backend debug mode is now controlled by env vars and defaults to `false`.
- The browser launcher script automatically looks for `chromium-browser`, `chromium`, or Google Chrome.
- Calibration mode currently defaults `SMARTBMI_ENABLE_KIOSK_BROWSER=false`, so Chromium will not auto-open until that env var is explicitly set to `true`.
- The frontend service uses `npm run serve:prod`, which serves the built `dist/` output.
- The installer also attempts to install the face-recognition and detection packages used by the camera pipeline. Those can take longer on Raspberry Pi hardware.
- You do not need to type or store the Raspberry Pi password for kiosk startup. LightDM autologin signs in the kiosk user automatically.
- The Arduino does not need a Linux service. Its flashed firmware starts automatically when the board powers on. Deployment readiness here means the Pi backend starts on boot, opens `/dev/ttyACM0`, and automatically reconnects if the serial stream stalls.
