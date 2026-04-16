#!/usr/bin/env python3
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request


ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_env(path):
    if not os.path.exists(path):
        return
    try:
        with open(path, "r", encoding="utf-8") as handle:
            for raw in handle:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip("\"").strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except Exception as exc:
        print(f"[oled] Failed to load env file {path}: {exc}", file=sys.stderr)


load_env(os.path.join(ROOT_DIR, ".env"))


BACKEND_URL = os.getenv("SMARTBMI_BACKEND_URL", "http://127.0.0.1:5000")
SYSTEM_STATUS_ENDPOINT = os.getenv("SMARTBMI_SYSTEM_STATUS_ENDPOINT", "/system/status")
OLED_STATUS_FILE = os.getenv("SMARTBMI_OLED_STATUS_FILE", os.path.join(ROOT_DIR, "oled_status.json"))
OLED_POLL_SECONDS = max(3, int(os.getenv("SMARTBMI_OLED_POLL_SECONDS", "5")))
OLED_REQUEST_TIMEOUT = max(1.0, float(os.getenv("SMARTBMI_REQUEST_TIMEOUT", "4")))
OLED_WIDTH = int(os.getenv("SMARTBMI_OLED_WIDTH", "128"))
OLED_HEIGHT = int(os.getenv("SMARTBMI_OLED_HEIGHT", "64"))
OLED_I2C_PORT = int(os.getenv("SMARTBMI_OLED_I2C_PORT", "1"))
OLED_I2C_ADDRESS_RAW = os.getenv("SMARTBMI_OLED_I2C_ADDRESS", "auto")
OLED_I2C_CANDIDATES = [item.strip().lower() for item in os.getenv("SMARTBMI_OLED_I2C_ADDRESSES", "3c,3d").split(",") if item.strip()]
OLED_ROTATE = int(os.getenv("SMARTBMI_OLED_ROTATE", "0"))
OLED_CONTRAST = int(os.getenv("SMARTBMI_OLED_CONTRAST", "255"))


def now_ms():
    return int(time.time() * 1000)


def parse_i2c_address(raw_value):
    text = str(raw_value or "").strip().lower()
    if not text or text == "auto":
        return None
    return int(text, 16)


def run_command(command, timeout=4):
    try:
        proc = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError:
        return False, "", f"Command not found: {' '.join(command)}"
    except Exception as exc:
        return False, "", str(exc)
    output = (proc.stdout or "") + ("\n" + proc.stderr if proc.stderr else "")
    return proc.returncode == 0, output.strip(), None


def detect_i2c_address():
    manual_address = parse_i2c_address(OLED_I2C_ADDRESS_RAW)
    if manual_address is not None:
        return manual_address, "env"

    if shutil.which("i2cdetect") is None:
        if OLED_I2C_CANDIDATES:
            return int(OLED_I2C_CANDIDATES[0], 16), "candidate-default"
        return 0x3C, "default"

    ok, output, error = run_command(["i2cdetect", "-y", str(OLED_I2C_PORT)], timeout=4)
    if not ok:
        if OLED_I2C_CANDIDATES:
            return int(OLED_I2C_CANDIDATES[0], 16), "candidate-default"
        return 0x3C, "default"

    flattened = output.lower().replace("\n", " ")
    for candidate in OLED_I2C_CANDIDATES:
        if re.search(rf"(^|\s){re.escape(candidate)}(\s|$)", flattened):
            return int(candidate, 16), "i2cdetect"

    if OLED_I2C_CANDIDATES:
        return int(OLED_I2C_CANDIDATES[0], 16), "candidate-default"
    return 0x3C, "default"


def write_status_file(status, detail, lines=None, extra=None):
    payload = {
        "status": status,
        "detail": detail,
        "updatedAt": now_ms(),
        "lines": lines or [],
    }
    if isinstance(extra, dict):
        payload.update(extra)

    tmp_path = f"{OLED_STATUS_FILE}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    os.replace(tmp_path, OLED_STATUS_FILE)


def fetch_json(path):
    url = BACKEND_URL.rstrip("/") + path
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=OLED_REQUEST_TIMEOUT) as response:
        return json.loads(response.read().decode("utf-8"))


def build_lines(snapshot):
    measurements = snapshot.get("measurements") or {}
    components = snapshot.get("components") or {}
    wifi = components.get("wifi") or {}

    mode = "ONLINE" if snapshot.get("mode") == "online" else "OFFLINE"
    weight = measurements.get("weightKg")
    height = measurements.get("heightCm")
    bmi = measurements.get("bmi")
    category = str(measurements.get("category") or "--")
    wifi_label = "WiFi OK" if wifi.get("status") == "ok" else "WiFi OFF"

    return [
        f"SmartBMI {mode}",
        f"W:{weight if weight is not None else '--'}kg H:{height if height is not None else '--'}cm",
        f"BMI:{bmi if bmi is not None else '--'} {category[:10]}",
        wifi_label,
    ]


class DisplayAdapter:
    def __init__(self):
        self.mode = "heartbeat-only"
        self.error = None
        self.device = None
        self.canvas = None
        self.ImageFont = None
        self.font = None
        self.draw_box = None
        self.i2c_address, self.address_source = detect_i2c_address()

        try:
            from luma.core.interface.serial import i2c
            from luma.core.render import canvas
            from luma.oled.device import ssd1306
            from PIL import ImageFont

            serial = i2c(port=OLED_I2C_PORT, address=self.i2c_address)
            self.device = ssd1306(serial, width=OLED_WIDTH, height=OLED_HEIGHT, rotate=OLED_ROTATE)
            try:
                self.device.contrast(OLED_CONTRAST)
            except Exception:
                pass
            self.canvas = canvas
            self.ImageFont = ImageFont
            self.font = ImageFont.load_default()
            self.mode = "luma.oled"
            return
        except Exception as exc:
            self.error = str(exc)

        try:
            import board
            import busio
            from PIL import Image, ImageDraw, ImageFont
            import adafruit_ssd1306

            i2c = busio.I2C(board.SCL, board.SDA)
            self.device = adafruit_ssd1306.SSD1306_I2C(OLED_WIDTH, OLED_HEIGHT, i2c, addr=self.i2c_address)
            self.device.fill(0)
            self.device.show()
            self.Image = Image
            self.ImageDraw = ImageDraw
            self.ImageFont = ImageFont
            self.font = ImageFont.load_default()
            self.mode = "adafruit_ssd1306"
        except Exception as exc:
            self.error = f"{self.error}; {exc}" if self.error else str(exc)

    def render(self, lines):
        if self.mode == "luma.oled":
            with self.canvas(self.device) as draw:
                y = 0
                for line in lines[:4]:
                    draw.text((0, y), line, fill="white", font=self.font)
                    y += 14
            return

        if self.mode == "adafruit_ssd1306":
            image = self.Image.new("1", (OLED_WIDTH, OLED_HEIGHT))
            draw = self.ImageDraw.Draw(image)
            draw.rectangle((0, 0, OLED_WIDTH, OLED_HEIGHT), outline=0, fill=0)
            y = 0
            for line in lines[:4]:
                draw.text((0, y), line, font=self.font, fill=255)
                y += 14
            self.device.image(image)
            self.device.show()
            return

        raise RuntimeError(self.error or "No OLED backend available.")


def main():
    display = DisplayAdapter()
    print(f"[oled] Mode: {display.mode}")

    while True:
        try:
            snapshot = fetch_json(SYSTEM_STATUS_ENDPOINT)
            lines = build_lines(snapshot)

            if display.mode != "heartbeat-only":
                display.render(lines)
                detail = f"OLED updated using {display.mode}."
                status = "ok"
            else:
                detail = f"OLED backend unavailable or hardware not ready; heartbeat only. {display.error or ''}".strip()
                status = "warning"

            write_status_file(
                status,
                detail,
                lines=lines,
                extra={
                    "backend": display.mode,
                    "device": {
                        "width": OLED_WIDTH,
                        "height": OLED_HEIGHT,
                        "i2cPort": OLED_I2C_PORT,
                        "i2cAddress": hex(display.i2c_address),
                        "i2cAddressSource": display.address_source,
                    },
                },
            )
        except urllib.error.URLError as exc:
            lines = ["SmartBMI", "Backend offline", "Check Flask API", time.strftime("%H:%M:%S")]
            write_status_file("warning", f"Backend unavailable: {exc}", lines=lines)
        except Exception as exc:
            lines = ["SmartBMI", "OLED error", str(exc)[:18], time.strftime("%H:%M:%S")]
            write_status_file("warning", f"OLED update failed: {exc}", lines=lines)

        time.sleep(OLED_POLL_SECONDS)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("[oled] Stopped")
