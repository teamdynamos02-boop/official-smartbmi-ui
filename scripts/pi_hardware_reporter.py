#!/usr/bin/env python3
import json
import os
import re
import shlex
import shutil
import socket
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
        print(f"[pi-monitor] Failed to load env file {path}: {exc}", file=sys.stderr)


load_env(os.path.join(ROOT_DIR, ".env"))


BACKEND_URL = os.getenv("SMARTBMI_BACKEND_URL", "http://127.0.0.1:5000")
OVERRIDE_ENDPOINT = os.getenv("SMARTBMI_OVERRIDE_ENDPOINT", "/system/status/override")
DEVICE_ID = os.getenv("SMARTBMI_DEVICE_ID", os.getenv("DEVICE_ID", "smartbmi-kiosk-1"))
POLL_SECONDS = max(5, int(os.getenv("SMARTBMI_POLL_SECONDS", "15")))
REQUEST_TIMEOUT = max(1.0, float(os.getenv("SMARTBMI_REQUEST_TIMEOUT", "4")))
WIFI_INTERFACE = os.getenv("SMARTBMI_WIFI_INTERFACE", "wlan0")
OLED_I2C_BUS = os.getenv("SMARTBMI_OLED_I2C_BUS", "1")
OLED_I2C_ADDRESSES = [item.strip().lower() for item in os.getenv("SMARTBMI_OLED_I2C_ADDRESSES", "3c,3d").split(",") if item.strip()]
OLED_STATUS_FILE = os.getenv("SMARTBMI_OLED_STATUS_FILE", os.path.join(ROOT_DIR, "oled_status.json"))
OLED_STATUS_MAX_AGE_SECONDS = max(5, int(os.getenv("SMARTBMI_OLED_STATUS_MAX_AGE_SECONDS", "90")))
CAMERA_COMMAND = os.getenv("SMARTBMI_CAMERA_TEST_COMMAND", "").strip()
LOG_VERBOSE = os.getenv("SMARTBMI_LOG_VERBOSE", "true").strip().lower() in {"1", "true", "yes", "on"}


def now_ms():
    return int(time.time() * 1000)


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


def read_file(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read().strip()
    except Exception:
        return None


def build_component(status, detail, **extra):
    payload = {
        "status": status,
        "detail": detail,
        "detectedAt": now_ms(),
    }
    payload.update(extra)
    return payload


def percent(part, whole):
    if whole <= 0:
        return None
    return round((float(part) / float(whole)) * 100.0, 1)


def get_cpu_temperature_c():
    thermal = read_file("/sys/class/thermal/thermal_zone0/temp")
    if thermal and thermal.isdigit():
        return round(int(thermal) / 1000.0, 1)

    ok, output, _ = run_command(["vcgencmd", "measure_temp"], timeout=2)
    if ok:
        match = re.search(r"([0-9]+(?:\.[0-9]+)?)", output)
        if match:
            return round(float(match.group(1)), 1)
    return None


def get_memory_stats():
    try:
        page_size = os.sysconf("SC_PAGE_SIZE")
        total_pages = os.sysconf("SC_PHYS_PAGES")
        available_pages = os.sysconf("SC_AVPHYS_PAGES")
        total = page_size * total_pages
        available = page_size * available_pages
        used = max(0, total - available)
        return {
            "totalMb": round(total / (1024 * 1024), 1),
            "usedMb": round(used / (1024 * 1024), 1),
            "usagePercent": percent(used, total),
        }
    except Exception:
        return {}


def get_disk_stats(path="/"):
    try:
        stats = os.statvfs(path)
        total = stats.f_frsize * stats.f_blocks
        free = stats.f_frsize * stats.f_bavail
        used = max(0, total - free)
        return {
            "totalGb": round(total / (1024 ** 3), 2),
            "usedGb": round(used / (1024 ** 3), 2),
            "usagePercent": percent(used, total),
        }
    except Exception:
        return {}


def get_ip_address():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except Exception:
        return None


def get_wifi_status():
    operstate = read_file(f"/sys/class/net/{WIFI_INTERFACE}/operstate")
    connected = operstate == "up"
    ssid = None
    signal = None

    ok, output, _ = run_command(["iwgetid", WIFI_INTERFACE, "--raw"], timeout=2)
    if ok and output.strip():
        ssid = output.strip()
        connected = True

    ok, output, _ = run_command(["iwconfig", WIFI_INTERFACE], timeout=2)
    if ok and output:
        match_quality = re.search(r"Link Quality=([0-9]+)/([0-9]+)", output)
        if match_quality:
            signal = percent(int(match_quality.group(1)), int(match_quality.group(2)))
        match_dbm = re.search(r"Signal level=([-0-9]+)\s*dBm", output)
        if match_dbm and signal is None:
            signal = int(match_dbm.group(1))

    if not os.path.exists(f"/sys/class/net/{WIFI_INTERFACE}"):
        return build_component(
            "offline",
            f"Wi-Fi interface {WIFI_INTERFACE} not found.",
            interface=WIFI_INTERFACE,
        )

    if connected:
        detail = f"Connected on {WIFI_INTERFACE}"
        if ssid:
            detail += f" to SSID {ssid}"
        if signal is not None:
            detail += f" with signal {signal}"
            detail += "%" if isinstance(signal, float) else " dBm"
        return build_component(
            "ok",
            detail,
            interface=WIFI_INTERFACE,
            ssid=ssid,
            signal=signal,
            ipAddress=get_ip_address(),
        )

    return build_component(
        "offline",
        f"Wi-Fi interface {WIFI_INTERFACE} is not connected.",
        interface=WIFI_INTERFACE,
    )


def detect_camera():
    if CAMERA_COMMAND:
        ok, output, error = run_command(shlex.split(CAMERA_COMMAND), timeout=6)
        if ok:
            return build_component("ok", output or "Camera test command succeeded.", command=CAMERA_COMMAND)
        return build_component("warning", error or output or "Camera test command failed.", command=CAMERA_COMMAND)

    camera_checks = [
        (["rpicam-hello", "--list-cameras"], "rpicam"),
        (["libcamera-hello", "--list-cameras"], "libcamera"),
        (["vcgencmd", "get_camera"], "vcgencmd"),
    ]
    for command, source in camera_checks:
        if shutil.which(command[0]) is None:
            continue
        ok, output, error = run_command(command, timeout=6)
        text = (output or error or "").strip()
        if source in {"rpicam", "libcamera"} and ok:
            lines = [line.strip() for line in text.splitlines() if line.strip()]
            camera_lines = [line for line in lines if "[" in line or "camera" in line.lower()]
            if camera_lines:
                return build_component("ok", camera_lines[0], source=source)
            return build_component("warning", text or "Camera command returned no camera list.", source=source)
        if source == "vcgencmd" and ok:
            supported = re.search(r"supported=([01])", text)
            detected = re.search(r"detected=([01])", text)
            if supported and detected and detected.group(1) == "1":
                return build_component("ok", text, source=source)
            return build_component("warning", text or "Camera not detected by vcgencmd.", source=source)

    return build_component("unknown", "No camera diagnostic command available on this Pi.")


def detect_oled():
    if os.path.exists(OLED_STATUS_FILE):
        try:
            age_seconds = time.time() - os.path.getmtime(OLED_STATUS_FILE)
            with open(OLED_STATUS_FILE, "r", encoding="utf-8") as handle:
                payload = json.load(handle)
            if age_seconds <= OLED_STATUS_MAX_AGE_SECONDS:
                return build_component(
                    payload.get("status", "ok"),
                    payload.get("detail", "OLED heartbeat file is fresh."),
                    source="status-file",
                    ageSeconds=round(age_seconds, 1),
                )
            return build_component(
                "warning",
                f"OLED status file is stale ({round(age_seconds, 1)}s old).",
                source="status-file",
            )
        except Exception as exc:
            return build_component("warning", f"Could not parse OLED status file: {exc}", source="status-file")

    if shutil.which("i2cdetect") is None:
        return build_component("unknown", "OLED not verified. Install i2c-tools or provide an OLED status file.")

    ok, output, error = run_command(["i2cdetect", "-y", OLED_I2C_BUS], timeout=4)
    if not ok:
        return build_component("warning", error or output or "OLED I2C scan failed.", bus=OLED_I2C_BUS)

    flattened = output.lower().replace("\n", " ")
    for address in OLED_I2C_ADDRESSES:
        if re.search(rf"(^|\s){re.escape(address)}(\s|$)", flattened):
            return build_component(
                "ok",
                f"OLED device detected on I2C bus {OLED_I2C_BUS} at 0x{address}.",
                bus=OLED_I2C_BUS,
                address=f"0x{address}",
                source="i2cdetect",
            )

    return build_component(
        "warning",
        f"No OLED detected on I2C bus {OLED_I2C_BUS} at {', '.join('0x' + a for a in OLED_I2C_ADDRESSES)}.",
        bus=OLED_I2C_BUS,
        source="i2cdetect",
    )


def build_override_payload():
    cpu_temp = get_cpu_temperature_c()
    memory = get_memory_stats()
    disk = get_disk_stats("/")
    hostname = socket.gethostname()

    pi_detail_parts = [f"Pi host {hostname} online"]
    if cpu_temp is not None:
        pi_detail_parts.append(f"CPU {cpu_temp} C")
    if memory.get("usagePercent") is not None:
        pi_detail_parts.append(f"RAM {memory['usagePercent']}%")
    if disk.get("usagePercent") is not None:
        pi_detail_parts.append(f"Disk {disk['usagePercent']}%")

    return {
        "meta": {
            "deviceId": DEVICE_ID,
            "reporter": "pi_hardware_reporter",
            "hostname": hostname,
            "ipAddress": get_ip_address(),
            "cpuTemperatureC": cpu_temp,
            "memory": memory,
            "disk": disk,
        },
        "components": {
            "raspberryPi": build_component(
                "ok",
                " | ".join(pi_detail_parts),
                hostname=hostname,
                cpuTemperatureC=cpu_temp,
                memory=memory,
                disk=disk,
            ),
            "wifi": get_wifi_status(),
            "cameraModule": detect_camera(),
            "oledDisplay": detect_oled(),
        },
    }


def post_override(payload):
    url = BACKEND_URL.rstrip("/") + OVERRIDE_ENDPOINT
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT) as response:
        body = response.read().decode("utf-8", errors="ignore")
        return response.status, body


def main():
    print(f"[pi-monitor] Reporting to {BACKEND_URL.rstrip('/')}{OVERRIDE_ENDPOINT} every {POLL_SECONDS}s for {DEVICE_ID}")
    while True:
        payload = build_override_payload()
        try:
            status, body = post_override(payload)
            if LOG_VERBOSE:
                print(f"[pi-monitor] POST {status} {body[:180]}")
        except urllib.error.HTTPError as exc:
            print(f"[pi-monitor] HTTP error {exc.code}: {exc.read().decode('utf-8', errors='ignore')}", file=sys.stderr)
        except Exception as exc:
            print(f"[pi-monitor] Failed to report hardware status: {exc}", file=sys.stderr)
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("[pi-monitor] Stopped")
