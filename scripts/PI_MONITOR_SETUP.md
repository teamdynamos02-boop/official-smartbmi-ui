# Raspberry Pi Hardware Reporter

Run this on the Raspberry Pi so the admin dashboard gets live hardware status.

## What it reports

- Raspberry Pi host health
- Wi-Fi interface status
- Camera module availability
- OLED presence via I2C scan or optional heartbeat file

It posts overrides to `POST /system/status/override`.

## Quick start

1. Start the Flask backend.
2. Run:

```bash
.venv/bin/python scripts/pi_hardware_reporter.py
```

3. Open the admin dashboard:

```text
http://localhost:5173/?view=admin
```

## Optional env vars

These can go in the root `.env`:

```env
SMARTBMI_BACKEND_URL=http://127.0.0.1:5000
SMARTBMI_OVERRIDE_ENDPOINT=/system/status/override
SMARTBMI_DEVICE_ID=smartbmi-kiosk-1
SMARTBMI_POLL_SECONDS=15
SMARTBMI_REQUEST_TIMEOUT=4
SMARTBMI_WIFI_INTERFACE=wlan0
SMARTBMI_OLED_I2C_BUS=1
SMARTBMI_OLED_I2C_ADDRESSES=3c,3d
SMARTBMI_OLED_STATUS_FILE=/home/pi/smartbmi-ui/oled_status.json
SMARTBMI_OLED_STATUS_MAX_AGE_SECONDS=90
SMARTBMI_CAMERA_TEST_COMMAND=
SMARTBMI_LOG_VERBOSE=true
SMARTBMI_SYSTEM_STATUS_ENDPOINT=/system/status
SMARTBMI_OLED_POLL_SECONDS=5
SMARTBMI_OLED_WIDTH=128
SMARTBMI_OLED_HEIGHT=64
SMARTBMI_OLED_I2C_PORT=1
SMARTBMI_OLED_I2C_ADDRESS=auto
SMARTBMI_OLED_ROTATE=0
SMARTBMI_OLED_CONTRAST=255
```

`SMARTBMI_OLED_I2C_ADDRESS=auto` lets the updater scan with `i2cdetect` first and then fall back to the candidate addresses in `SMARTBMI_OLED_I2C_ADDRESSES`.

## OLED heartbeat file

If your OLED code can write a small JSON file, the reporter will use that.

Example:

```json
{
  "status": "ok",
  "detail": "OLED displaying session info"
}
```

## Included OLED updater

This repo now includes [oled_status_display.py](/home/dynamos/smartbmi-ui/scripts/oled_status_display.py), which:

- polls `/system/status`
- renders basic lines to an SSD1306 OLED when `luma.oled` or `adafruit_ssd1306` is available
- always writes `oled_status.json` so the hardware reporter can confirm OLED freshness

Run it manually:

```bash
.venv/bin/python scripts/oled_status_display.py
```

Optional service file:

- [smartbmi-oled-display.service](/home/dynamos/smartbmi-ui/scripts/smartbmi-oled-display.service)

## systemd

1. Copy [smartbmi-hardware-monitor.service](/home/dynamos/smartbmi-ui/scripts/smartbmi-hardware-monitor.service) to `/etc/systemd/system/`
2. Adjust paths if your project lives somewhere else.
3. Enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now smartbmi-hardware-monitor.service
sudo systemctl status smartbmi-hardware-monitor.service
```

For the OLED updater:

```bash
sudo cp scripts/smartbmi-oled-display.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now smartbmi-oled-display.service
sudo systemctl status smartbmi-oled-display.service
```
