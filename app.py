import os
import time
import threading
import io
import json
import base64
import math
import socket
import urllib.parse
import urllib.request
import glob
import re
from collections import deque

from flask import Flask, jsonify, request
try:
    from flask_cors import CORS
except Exception:
    CORS = None


def _load_local_env(path=".env"):
    try:
        if not os.path.exists(path):
            return
        with open(path, "r", encoding="utf-8") as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip("\"").strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except Exception as e:
        print(f"Failed to load env file {path}: {e}") 


_load_local_env()

try:
    import serial
except Exception:
    serial = None

try:
    from serial.tools import list_ports
except Exception:
    list_ports = None

try:
    import numpy as np
except Exception:
    np = None

try:
    from PIL import Image
except Exception:
    Image = None

# face_recognition can trigger SystemExit at import time if model package is missing.
try:
    import face_recognition
except BaseException:
    face_recognition = None

try:
    from ultralytics import YOLO
except Exception:
    YOLO = None

try:
    import onnxruntime as ort
except Exception:
    ort = None

try:
    import insightface
except Exception:
    insightface = None

app = Flask(__name__)
if CORS is not None:
    CORS(app, resources={r"/*": {"origins": "*"}})
else:
    @app.after_request
    def _fallback_cors(resp):
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
        resp.headers["Access-Control-Allow-Methods"] = "GET,POST,DELETE,OPTIONS"
        return resp

# ---------- Config ----------
# SERIAL / ARDUINO CUSTOMIZATION HERE
# Change these when your Arduino port, baud rate, or serial timeout is different.
SERIAL_PORT = os.getenv("SERIAL_PORT", "/dev/ttyACM0")
SERIAL_PORT_CANDIDATES = [
    item.strip()
    for item in os.getenv("SERIAL_PORT_CANDIDATES", "/dev/ttyACM0,/dev/ttyACM1,/dev/ttyUSB0,/dev/ttyUSB1").split(",")
    if item.strip()
]
BAUD_RATE = int(os.getenv("BAUD_RATE", "115200"))
SERIAL_TIMEOUT = float(os.getenv("SERIAL_TIMEOUT", "1"))
SERIAL_STARTUP_GRACE_MS = int(os.getenv("SERIAL_STARTUP_GRACE_MS", "20000"))
SERIAL_STALE_REOPEN_MS = int(os.getenv("SERIAL_STALE_REOPEN_MS", "60000"))
SERIAL_COLD_BOOT_SUPPRESS_REOPEN_MS = int(os.getenv("SERIAL_COLD_BOOT_SUPPRESS_REOPEN_MS", "90000"))
SERIAL_POST_RESET_WAIT_MS = int(os.getenv("SERIAL_POST_RESET_WAIT_MS", "3500"))

# TOF SENSOR CUSTOMIZATION HERE
# Set the exact distance from the LiDAR sensor down to the standing platform/scale.
# Height is computed as: platform-reference height minus measured distance to the head.
# `SENSOR_TO_FLOOR_CM` is still accepted as a legacy fallback env var.
SENSOR_TO_PLATFORM_CM = float(
    os.getenv(
        "SENSOR_TO_PLATFORM_CM",
        os.getenv("SENSOR_TO_FLOOR_CM", "201"),
    )
)
HEIGHT_CALIBRATION_OFFSET_CM = float(os.getenv("HEIGHT_CALIBRATION_OFFSET_CM", "0"))
MIN_HEIGHT_CM = float(os.getenv("MIN_HEIGHT_CM", "50"))
MAX_HEIGHT_CM = float(os.getenv("MAX_HEIGHT_CM", "250"))
HEIGHT_FILTER_WINDOW = int(os.getenv("HEIGHT_FILTER_WINDOW", "5"))
HEIGHT_STABLE_MIN_SAMPLES = int(os.getenv("HEIGHT_STABLE_MIN_SAMPLES", "4"))
HEIGHT_STABLE_RANGE_CM = float(os.getenv("HEIGHT_STABLE_RANGE_CM", "1.5"))
HEIGHT_HOLD_RANGE_CM = float(os.getenv("HEIGHT_HOLD_RANGE_CM", "1.5"))
HEIGHT_UPDATE_INTERVAL_MS = int(os.getenv("HEIGHT_UPDATE_INTERVAL_MS", "1000"))
HEIGHT_MIN_VISIBLE_LOCK_MS = int(os.getenv("HEIGHT_MIN_VISIBLE_LOCK_MS", "120"))
HEIGHT_LOCK_LIVE_MATCH_TOLERANCE_CM = float(os.getenv("HEIGHT_LOCK_LIVE_MATCH_TOLERANCE_CM", "4.0"))
HEIGHT_TRUSTED_PEAK_OVERRIDE_CM = float(os.getenv("HEIGHT_TRUSTED_PEAK_OVERRIDE_CM", "0.0"))
HEIGHT_CANDIDATE_PEAK_TOLERANCE_CM = float(os.getenv("HEIGHT_CANDIDATE_PEAK_TOLERANCE_CM", "999.0"))
HEIGHT_LOCK_MIN_PEAK_MARGIN_CM = float(os.getenv("HEIGHT_LOCK_MIN_PEAK_MARGIN_CM", "999.0"))
HEIGHT_STANDING_MIN_CM = float(os.getenv("HEIGHT_STANDING_MIN_CM", "145.0"))
HEIGHT_PEAK_REBASE_DELTA_CM = float(os.getenv("HEIGHT_PEAK_REBASE_DELTA_CM", "10.0"))
HEIGHT_DROP_REJECT_CM = float(os.getenv("HEIGHT_DROP_REJECT_CM", "12.0"))
WEIGHT_FILTER_WINDOW = int(os.getenv("WEIGHT_FILTER_WINDOW", "7"))
WEIGHT_STABLE_MIN_SAMPLES = int(os.getenv("WEIGHT_STABLE_MIN_SAMPLES", "4"))
WEIGHT_STABLE_RANGE_KG = float(os.getenv("WEIGHT_STABLE_RANGE_KG", "0.25"))
WEIGHT_UPDATE_INTERVAL_MS = int(os.getenv("WEIGHT_UPDATE_INTERVAL_MS", "250"))
WEIGHT_STABLE_HOLD_MS = int(os.getenv("WEIGHT_STABLE_HOLD_MS", "700"))
WEIGHT_EMPTY_THRESHOLD_KG = float(os.getenv("WEIGHT_EMPTY_THRESHOLD_KG", "8.0"))
WEIGHT_SPIKE_REJECT_KG = float(os.getenv("WEIGHT_SPIKE_REJECT_KG", "1.8"))
WEIGHT_CALIBRATION_OFFSET_KG = float(os.getenv("WEIGHT_CALIBRATION_OFFSET_KG", "0"))
WEIGHT_CALIBRATION_FILE = os.getenv("WEIGHT_CALIBRATION_FILE", "weight_calibration.json")
HEIGHT_CALIBRATION_FILE = os.getenv("HEIGHT_CALIBRATION_FILE", "height_calibration.json")
WEIGHT_ENTRY_SETTLE_MS = int(os.getenv("WEIGHT_ENTRY_SETTLE_MS", "1200"))
HEIGHT_STABLE_HOLD_MS = int(os.getenv("HEIGHT_STABLE_HOLD_MS", "700"))
WEIGHT_FORCE_LOCK_MS = int(os.getenv("WEIGHT_FORCE_LOCK_MS", "3500"))
HEIGHT_FORCE_LOCK_MS = int(os.getenv("HEIGHT_FORCE_LOCK_MS", "2800"))
WEIGHT_FORCE_LOCK_MAX_RANGE_KG = float(os.getenv("WEIGHT_FORCE_LOCK_MAX_RANGE_KG", "0.30"))
HEIGHT_FORCE_LOCK_MAX_RANGE_CM = float(os.getenv("HEIGHT_FORCE_LOCK_MAX_RANGE_CM", "1.8"))

# FACE RECOGNITION CUSTOMIZATION HERE
# Most face-matching, liveness, and calibration thresholds are controlled below.
FACE_DB_FILE = os.getenv("FACE_DB_FILE", "face_db.json")
FACE_TOLERANCE = float(os.getenv("FACE_TOLERANCE", "0.40"))
FACE_RECOGNITION_ENGINE = str(os.getenv("FACE_RECOGNITION_ENGINE", "auto")).strip().lower()
FACE_DUPLICATE_TOLERANCE = float(os.getenv("FACE_DUPLICATE_TOLERANCE", "0.38"))
FACE_MIN_MARGIN = float(os.getenv("FACE_MIN_MARGIN", "0.12"))
FACE_SINGLE_USER_TOLERANCE = float(os.getenv("FACE_SINGLE_USER_TOLERANCE", "0.32"))
FACE_DUPLICATE_SINGLE_USER_TOLERANCE = float(os.getenv("FACE_DUPLICATE_SINGLE_USER_TOLERANCE", "0.20"))
FACE_ENFORCE_SINGLE_USER_DUPLICATE_CHECK = str(os.getenv("FACE_ENFORCE_SINGLE_USER_DUPLICATE_CHECK", "false")).strip().lower() in {"1", "true", "yes", "on"}
FACE_REGISTER_MIN_SAMPLES = int(os.getenv("FACE_REGISTER_MIN_SAMPLES", "5"))
FACE_DETECTION_MODEL = os.getenv("FACE_DETECTION_MODEL", "cnn")
FACE_DETECTION_FALLBACK_MODEL = os.getenv("FACE_DETECTION_FALLBACK_MODEL", "hog")
FACE_ENROLL_NUM_JITTERS = int(os.getenv("FACE_ENROLL_NUM_JITTERS", "3"))
FACE_IDENTIFY_NUM_JITTERS = int(os.getenv("FACE_IDENTIFY_NUM_JITTERS", "2"))
FACE_MIN_FACE_SIZE_PX = int(os.getenv("FACE_MIN_FACE_SIZE_PX", "110"))
FACE_REGISTER_MAX_SAMPLE_DISTANCE = float(os.getenv("FACE_REGISTER_MAX_SAMPLE_DISTANCE", "0.33"))
FACE_BLINK_EAR_THRESHOLD = float(os.getenv("FACE_BLINK_EAR_THRESHOLD", "0.23"))
FACE_LIVENESS_MODEL_PATH = os.getenv("FACE_LIVENESS_MODEL_PATH", "")
FACE_LIVENESS_THRESHOLD = float(os.getenv("FACE_LIVENESS_THRESHOLD", "0.55"))
FACE_LIVENESS_INPUT_SIZE = int(os.getenv("FACE_LIVENESS_INPUT_SIZE", "112"))
FACE_CALIBRATION_ENABLED = str(os.getenv("FACE_CALIBRATION_ENABLED", "true")).strip().lower() in {"1", "true", "yes", "on"}
FACE_CALIBRATION_LOG_FILE = os.getenv("FACE_CALIBRATION_LOG_FILE", "face_calibration_log.jsonl")
FACE_INSIGHTFACE_MODEL_PACK = os.getenv("FACE_INSIGHTFACE_MODEL_PACK", "buffalo_l")
FACE_INSIGHTFACE_DET_WIDTH = int(os.getenv("FACE_INSIGHTFACE_DET_WIDTH", "640"))
FACE_INSIGHTFACE_DET_HEIGHT = int(os.getenv("FACE_INSIGHTFACE_DET_HEIGHT", "640"))

# RESTRICTION DETECTION CUSTOMIZATION HERE
# Update these if you replace the model or want a different confidence threshold.
RESTRICTION_MODEL_PATH = os.getenv("RESTRICTION_MODEL_PATH", "models/restrictions.pt")
RESTRICTION_CONFIDENCE = float(os.getenv("RESTRICTION_CONFIDENCE", "0.35"))
LOCAL_DATA_FILE = os.getenv("LOCAL_DATA_FILE", "local_data.json")

# SYSTEM MONITORING CUSTOMIZATION HERE
# These values control device identity, internet checks, and freshness windows.
DEVICE_ID = os.getenv("DEVICE_ID", "smartbmi-kiosk-1")
SYSTEM_CONNECTIVITY_HOST = os.getenv("SYSTEM_CONNECTIVITY_HOST", "8.8.8.8")
SYSTEM_CONNECTIVITY_PORT = int(os.getenv("SYSTEM_CONNECTIVITY_PORT", "53"))
SYSTEM_CONNECTIVITY_TIMEOUT = float(os.getenv("SYSTEM_CONNECTIVITY_TIMEOUT", "0.35"))
SYSTEM_COMPONENT_FRESH_MS = int(os.getenv("SYSTEM_COMPONENT_FRESH_MS", "15000"))

# FIREBASE MONITORING SYNC CUSTOMIZATION HERE
# Backend monitoring writes to RTDB using these settings.
FIREBASE_SYNC_ENABLED = str(os.getenv("FIREBASE_SYNC_ENABLED", "true")).strip().lower() in {"1", "true", "yes", "on"}
FIREBASE_RTDB_URL = os.getenv("FIREBASE_RTDB_URL", "https://smartbmi-demo-default-rtdb.firebaseio.com").strip().rstrip("/")
FIREBASE_RTDB_AUTH = os.getenv("FIREBASE_RTDB_AUTH", "").strip()
FIREBASE_SYNC_INTERVAL_MS = int(os.getenv("FIREBASE_SYNC_INTERVAL_MS", "15000"))
FIREBASE_HISTORY_INTERVAL_MS = int(os.getenv("FIREBASE_HISTORY_INTERVAL_MS", "60000"))

# ---------- Shared data ----------
sensor_data = {
    "weightKg": None,
    "heightCm": None,
    "liveWeightKg": None,
    "liveHeightCm": None,
    "finalWeightKg": None,
    "finalHeightCm": None,
    "weightStable": False,
    "heightStable": False,
    "measurementLocked": False,
    "weightPhase": "idle",
    "heightPhase": "idle",
    "statusMessage": "Step on the scale",
    "bmi": None,
    "category": "--",
    "rawDistanceCm": None,
    "updatedAt": None,
}
weight_samples = deque(maxlen=max(4, WEIGHT_FILTER_WINDOW))
height_distance_samples = deque(maxlen=max(3, HEIGHT_FILTER_WINDOW))
serial_line_history = deque(maxlen=80)
weight_filter_state = {
    "lastPublishedAt": None,
    "bestCandidateWeightKg": None,
    "bestCandidateRangeKg": None,
    "fallbackCandidateWeightKg": None,
    "fallbackCandidateRangeKg": None,
    "stableSince": None,
    "measurementStartedAt": None,
}
height_filter_state = {
    "lastPublishedAt": None,
    "bestCandidateHeightCm": None,
    "bestCandidateDistanceCm": None,
    "bestCandidateRangeCm": None,
    "peakLiveHeightCm": None,
    "trustedPeakHeightCm": None,
    "trustedPeakSeenAt": None,
    "firstValidLiveAt": None,
    "fallbackCandidateHeightCm": None,
    "fallbackCandidateDistanceCm": None,
    "fallbackCandidateRangeCm": None,
    "stableSince": None,
    "measurementStartedAt": None,
}
data_lock = threading.Lock()
face_lock = threading.Lock()
face_db = {}
insightface_lock = threading.Lock()
insightface_app = None
insightface_status = {
    "loaded": False,
    "detail": "InsightFace not initialized.",
}
local_data_lock = threading.Lock()
restriction_lock = threading.Lock()
restriction_model = None
liveness_lock = threading.Lock()
liveness_session = None
liveness_input_name = None
calibration_lock = threading.Lock()
weight_calibration_state = {
    "offsetKg": WEIGHT_CALIBRATION_OFFSET_KG,
    "updatedAt": None,
    "source": "env",
}
height_calibration_state = {
    "sensorToPlatformCm": SENSOR_TO_PLATFORM_CM,
    "offsetCm": HEIGHT_CALIBRATION_OFFSET_CM,
    "updatedAt": None,
    "source": "env",
}
ser = None
app_started_at_ms = int(time.time() * 1000)
serial_state = {
    "connected": False,
    "port": None,
    "lastError": None,
    "lastConnectedAt": None,
    "lastReconnectAt": None,
    "lastLineAt": None,
    "lastWeightAt": None,
    "lastHeightAt": None,
    "lastLiveWeightAt": None,
    "lastLiveHeightAt": None,
}
system_status_overrides = {
    "components": {},
    "meta": {},
    "updatedAt": None,
}
firebase_sync_state = {
    "status": "unknown",
    "detail": "Backend Firebase sync has not run yet.",
    "detectedAt": None,
    "lastSuccessAt": None,
    "lastAttemptAt": None,
    "historySignature": None,
    "lastHistoryAt": None,
}


def _load_local_data_payload():
    try:
        if not os.path.exists(LOCAL_DATA_FILE):
            return {"users": {}}
        with open(LOCAL_DATA_FILE, "r", encoding="utf-8") as f:
            payload = json.load(f)
        if isinstance(payload, dict):
            payload.setdefault("users", {})
            if isinstance(payload["users"], dict):
                return payload
    except Exception as e:
        print(f"Failed to load local data file {LOCAL_DATA_FILE}: {e}")
    return {"users": {}}


def _save_local_data_payload(payload):
    folder = os.path.dirname(os.path.abspath(LOCAL_DATA_FILE))
    if folder:
        os.makedirs(folder, exist_ok=True)
    tmp_path = f"{LOCAL_DATA_FILE}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")
    os.replace(tmp_path, LOCAL_DATA_FILE)


def _ensure_local_user_record(payload, user_id):
    users = payload.setdefault("users", {})
    record = users.setdefault(str(user_id), {})
    if not isinstance(record, dict):
        record = {}
        users[str(user_id)] = record
    record.setdefault("profile", {})
    record.setdefault("measurements", [])
    if not isinstance(record["measurements"], list):
        record["measurements"] = []
    return record


def _normalize_local_measurement_entry(entry):
    if not isinstance(entry, dict):
        return None
    captured_at = int(entry.get("capturedAt") or 0)
    return {
        "id": str(entry.get("id") or ""),
        "weightKg": entry.get("weightKg"),
        "heightCm": entry.get("heightCm"),
        "bmi": entry.get("bmi"),
        "category": entry.get("category") or "",
        "capturedAt": captured_at,
        "capturedAtFormatted": entry.get("capturedAtFormatted") or "",
        "capturedDate": entry.get("capturedDate") or "",
        "capturedTime": entry.get("capturedTime") or "",
    }
system_load_samples = deque(maxlen=72)
system_alerts = deque(maxlen=40)
startup_lock = threading.Lock()
startup_complete = False

RESTRICTION_KEYS = [
    "shoes",
    "cap",
    "glasses",
    "mask",
    "bag",
    "heavy_item",
]

RESTRICTION_LABELS = {
    "shoes": "No Shoes",
    "cap": "No Cap",
    "glasses": "No Glasses",
    "mask": "No Mask",
    "bag": "No Bag",
    "heavy_item": "No Heavy Item",
}


def _load_weight_calibration_state():
    if not WEIGHT_CALIBRATION_FILE:
        return
    try:
        if not os.path.exists(WEIGHT_CALIBRATION_FILE):
            return
        with open(WEIGHT_CALIBRATION_FILE, "r", encoding="utf-8") as f:
            payload = json.load(f)
        offset_value = payload.get("offsetKg")
        if isinstance(offset_value, str):
            offset_value = float(offset_value)
        if isinstance(offset_value, (int, float)) and math.isfinite(float(offset_value)):
            weight_calibration_state["offsetKg"] = float(offset_value)
            weight_calibration_state["updatedAt"] = int(payload.get("updatedAt") or now_ms())
            weight_calibration_state["source"] = "file"
    except Exception as e:
        print(f"Failed to load weight calibration file {WEIGHT_CALIBRATION_FILE}: {e}")


def _persist_weight_calibration_state_locked():
    if not WEIGHT_CALIBRATION_FILE:
        return
    payload = {
        "offsetKg": round(float(weight_calibration_state["offsetKg"]), 4),
        "updatedAt": int(weight_calibration_state["updatedAt"] or now_ms()),
        "source": weight_calibration_state.get("source") or "runtime",
    }
    folder = os.path.dirname(os.path.abspath(WEIGHT_CALIBRATION_FILE))
    if folder:
        os.makedirs(folder, exist_ok=True)
    with open(WEIGHT_CALIBRATION_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")


def _get_weight_calibration_offset_kg():
    return float(weight_calibration_state.get("offsetKg") or 0.0)


def _apply_weight_calibration(raw_weight_kg):
    raw_weight = max(0.0, float(raw_weight_kg))
    if raw_weight < WEIGHT_EMPTY_THRESHOLD_KG:
        return raw_weight
    return max(0.0, raw_weight + _get_weight_calibration_offset_kg())


def _estimate_raw_weight_kg(calibrated_weight_kg):
    return float(calibrated_weight_kg) - _get_weight_calibration_offset_kg()


def _set_weight_calibration_offset_locked(offset_kg, *, source="runtime"):
    weight_calibration_state["offsetKg"] = float(offset_kg)
    weight_calibration_state["updatedAt"] = now_ms()
    weight_calibration_state["source"] = source
    _persist_weight_calibration_state_locked()


def _load_height_calibration_state():
    if not HEIGHT_CALIBRATION_FILE:
        return
    try:
        if not os.path.exists(HEIGHT_CALIBRATION_FILE):
            return
        with open(HEIGHT_CALIBRATION_FILE, "r", encoding="utf-8") as f:
            payload = json.load(f)

        platform_value = payload.get("sensorToPlatformCm")
        offset_value = payload.get("offsetCm")
        if isinstance(platform_value, str):
            platform_value = float(platform_value)
        if isinstance(offset_value, str):
            offset_value = float(offset_value)

        if isinstance(platform_value, (int, float)) and math.isfinite(float(platform_value)) and float(platform_value) > 0:
            height_calibration_state["sensorToPlatformCm"] = float(platform_value)
        if isinstance(offset_value, (int, float)) and math.isfinite(float(offset_value)):
            height_calibration_state["offsetCm"] = float(offset_value)
        height_calibration_state["updatedAt"] = int(payload.get("updatedAt") or now_ms())
        height_calibration_state["source"] = payload.get("source") or "file"
    except Exception as e:
        print(f"Failed to load height calibration file {HEIGHT_CALIBRATION_FILE}: {e}")


def _persist_height_calibration_state_locked():
    if not HEIGHT_CALIBRATION_FILE:
        return
    payload = {
        "sensorToPlatformCm": round(float(height_calibration_state["sensorToPlatformCm"]), 4),
        "offsetCm": round(float(height_calibration_state["offsetCm"]), 4),
        "updatedAt": int(height_calibration_state["updatedAt"] or now_ms()),
        "source": height_calibration_state.get("source") or "runtime",
    }
    folder = os.path.dirname(os.path.abspath(HEIGHT_CALIBRATION_FILE))
    if folder:
        os.makedirs(folder, exist_ok=True)
    with open(HEIGHT_CALIBRATION_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")


def _get_height_sensor_to_platform_cm():
    return float(height_calibration_state.get("sensorToPlatformCm") or SENSOR_TO_PLATFORM_CM)


def _get_height_calibration_offset_cm():
    return float(height_calibration_state.get("offsetCm") or 0.0)


def _apply_height_calibration(distance_cm):
    return _get_height_sensor_to_platform_cm() - float(distance_cm) + _get_height_calibration_offset_cm()


def _set_height_calibration_locked(*, sensor_to_platform_cm=None, offset_cm=None, source="runtime"):
    if sensor_to_platform_cm is not None:
        height_calibration_state["sensorToPlatformCm"] = float(sensor_to_platform_cm)
    if offset_cm is not None:
        height_calibration_state["offsetCm"] = float(offset_cm)
    height_calibration_state["updatedAt"] = now_ms()
    height_calibration_state["source"] = source
    _persist_height_calibration_state_locked()


def _latest_live_distance_cm_locked():
    live_distance = sensor_data.get("rawDistanceCm")
    if live_distance is None:
        return None
    live_ts = serial_state.get("lastLiveHeightAt")
    if not _is_recent(live_ts, max(2500, SYSTEM_COMPONENT_FRESH_MS)):
        return None
    return float(live_distance)


def _latest_live_raw_weight_kg_locked():
    live_weight = sensor_data.get("liveWeightKg")
    if live_weight is None:
        return None
    live_ts = serial_state.get("lastLiveWeightAt")
    if not _is_recent(live_ts, max(2500, SYSTEM_COMPONENT_FRESH_MS)):
        return None
    return _estimate_raw_weight_kg(live_weight)

RESTRICTION_ALIASES = {
    "shoes": {"shoe", "shoes", "sneaker", "sneakers", "sandals", "sandal", "slipper", "slippers", "boot", "boots", "footwear"},
    "cap": {"cap", "hat", "helmet", "beanie", "headwear"},
    "glasses": {"glasses", "eyeglasses", "sunglasses", "goggles", "spectacles"},
    "mask": {"mask", "face mask", "respirator", "surgical mask", "n95"},
    "bag": {"bag", "backpack", "handbag", "purse", "tote", "luggage bag"},
    "heavy_item": {"heavy item", "suitcase", "luggage", "box", "carton", "duffel bag"},
}


def get_bmi_category(bmi):
    if bmi < 18.5:
        return "Underweight"
    if bmi < 25.0:
        return "Normal"
    if bmi < 30.0:
        return "Overweight"
    return "Obese"


def recompute_bmi_locked():
    w = sensor_data["weightKg"]
    h = sensor_data["heightCm"]
    if w is None or h is None or h <= 0:
        sensor_data["bmi"] = None
        sensor_data["category"] = "--"
        return

    h_m = h / 100.0
    bmi = w / (h_m ** 2)
    sensor_data["bmi"] = round(bmi, 1)
    sensor_data["category"] = get_bmi_category(bmi)


def _build_live_measurement_snapshot_locked():
    weight_kg = sensor_data.get("liveWeightKg")
    height_cm = sensor_data.get("liveHeightCm")
    bmi = None
    category = "--"

    if weight_kg is not None and height_cm is not None and height_cm > 0:
        height_m = height_cm / 100.0
        bmi = round(float(weight_kg) / (height_m ** 2), 1)
        category = get_bmi_category(bmi)

    return {
        "weightKg": weight_kg,
        "heightCm": height_cm,
        "bmi": bmi,
        "category": category,
    }


def _build_system_measurement_snapshot_locked():
    final_weight_kg = sensor_data.get("weightKg")
    final_height_cm = sensor_data.get("heightCm")
    live_weight_kg = sensor_data.get("liveWeightKg")
    live_height_cm = sensor_data.get("liveHeightCm")
    raw_weight_kg = None
    if live_weight_kg is not None:
        raw_weight_kg = round(_estimate_raw_weight_kg(live_weight_kg), 3)
    weight_kg = final_weight_kg if final_weight_kg is not None else live_weight_kg
    height_cm = final_height_cm
    display_weight_kg = final_weight_kg if final_weight_kg is not None else live_weight_kg
    display_height_cm = final_height_cm if final_height_cm is not None else live_height_cm

    bmi = sensor_data.get("bmi")
    category = sensor_data.get("category")

    if (bmi is None or not category or category == "--") and weight_kg is not None and height_cm is not None and height_cm > 0:
        height_m = height_cm / 100.0
        bmi = round(float(weight_kg) / (height_m ** 2), 1)
        category = get_bmi_category(bmi)

    return {
        "weightKg": weight_kg,
        "heightCm": height_cm,
        "displayWeightKg": display_weight_kg,
        "displayHeightCm": display_height_cm,
        "liveWeightKg": live_weight_kg,
        "liveHeightCm": live_height_cm,
        "rawWeightKg": raw_weight_kg,
        "finalWeightKg": final_weight_kg,
        "finalHeightCm": final_height_cm,
        "bmi": bmi,
        "category": category or "--",
        "rawDistanceCm": sensor_data.get("rawDistanceCm"),
        "weightPhase": sensor_data.get("weightPhase", "idle"),
        "heightPhase": sensor_data.get("heightPhase", "idle"),
        "weightStable": bool(sensor_data.get("weightStable")),
        "heightStable": bool(sensor_data.get("heightStable")),
        "weightReadyForLock": bool(live_weight_kg is not None and float(live_weight_kg) >= WEIGHT_EMPTY_THRESHOLD_KG),
        "measurementLocked": bool(sensor_data.get("measurementLocked", False)),
        "statusMessage": sensor_data.get("statusMessage") or "",
        "serialConnected": bool(serial_state.get("connected")),
        "serialReceivingData": _is_recent(serial_state.get("lastLineAt")),
        "liveWeightFresh": _is_recent(serial_state.get("lastLiveWeightAt"), max(2500, SYSTEM_COMPONENT_FRESH_MS)),
        "liveHeightFresh": _is_recent(serial_state.get("lastLiveHeightAt"), max(2500, SYSTEM_COMPONENT_FRESH_MS)),
    }


def _median(values):
    ordered = sorted(values)
    n = len(ordered)
    if n == 0:
        return None
    mid = n // 2
    if n % 2 == 1:
        return float(ordered[mid])
    return float((ordered[mid - 1] + ordered[mid]) / 2.0)


def _trimmed_values(values):
    ordered = sorted(float(v) for v in values)
    if len(ordered) < 5:
        return ordered
    return ordered[1:-1]


def _trimmed_mean(values):
    core = _trimmed_values(values)
    if not core:
        return None
    return float(sum(core) / len(core))


def _trimmed_median(values):
    core = _trimmed_values(values)
    if not core:
        return None
    return _median(core)


def _buffer_range(values):
    core = _trimmed_values(values)
    if not core:
        return None
    return float(max(core) - min(core))


def _sync_measurement_flags_locked(status_message=None):
    sensor_data["measurementLocked"] = bool(sensor_data["weightStable"] and sensor_data["heightStable"])
    if status_message:
        sensor_data["statusMessage"] = status_message
    sensor_data["updatedAt"] = int(time.time())


def _reset_weight_measurement_locked(message="Step on the scale", clear_final=False):
    weight_samples.clear()
    weight_filter_state["lastPublishedAt"] = None
    weight_filter_state["bestCandidateWeightKg"] = None
    weight_filter_state["bestCandidateRangeKg"] = None
    weight_filter_state["fallbackCandidateWeightKg"] = None
    weight_filter_state["fallbackCandidateRangeKg"] = None
    weight_filter_state["stableSince"] = None
    weight_filter_state["measurementStartedAt"] = None
    if clear_final:
        sensor_data["liveWeightKg"] = None
    sensor_data["weightKg"] = None
    sensor_data["finalWeightKg"] = None
    sensor_data["weightStable"] = False
    sensor_data["weightPhase"] = "idle"
    recompute_bmi_locked()
    _sync_measurement_flags_locked(message)


def _start_weight_measurement_locked(now_ts, live_weight=None):
    weight_samples.clear()
    weight_filter_state["lastPublishedAt"] = None
    weight_filter_state["bestCandidateWeightKg"] = None
    weight_filter_state["bestCandidateRangeKg"] = None
    weight_filter_state["fallbackCandidateWeightKg"] = None
    weight_filter_state["fallbackCandidateRangeKg"] = None
    weight_filter_state["stableSince"] = None
    weight_filter_state["measurementStartedAt"] = now_ts
    current_weight = sensor_data.get("liveWeightKg")
    if live_weight is not None:
        current_weight = round(_apply_weight_calibration(float(live_weight)), 1)
    sensor_data["liveWeightKg"] = current_weight
    sensor_data["weightKg"] = None
    sensor_data["finalWeightKg"] = None
    sensor_data["weightStable"] = False
    sensor_data["measurementLocked"] = False
    sensor_data["weightPhase"] = "active"
    sensor_data["statusMessage"] = "Reading live load cell"


def _reset_height_measurement_locked(message="Stand under sensor"):
    height_distance_samples.clear()
    height_filter_state["lastPublishedAt"] = None
    height_filter_state["bestCandidateHeightCm"] = None
    height_filter_state["bestCandidateDistanceCm"] = None
    height_filter_state["bestCandidateRangeCm"] = None
    height_filter_state["peakLiveHeightCm"] = None
    height_filter_state["trustedPeakHeightCm"] = None
    height_filter_state["trustedPeakSeenAt"] = None
    height_filter_state["firstValidLiveAt"] = None
    height_filter_state["fallbackCandidateHeightCm"] = None
    height_filter_state["fallbackCandidateDistanceCm"] = None
    height_filter_state["fallbackCandidateRangeCm"] = None
    height_filter_state["stableSince"] = None
    height_filter_state["measurementStartedAt"] = None
    sensor_data["liveHeightCm"] = None
    sensor_data["heightCm"] = None
    sensor_data["finalHeightCm"] = None
    sensor_data["heightStable"] = False
    sensor_data["heightPhase"] = "idle"
    recompute_bmi_locked()
    _sync_measurement_flags_locked(message)


def now_ms():
    return int(time.time() * 1000)


def _is_recent(ts_ms, max_age_ms=SYSTEM_COMPONENT_FRESH_MS):
    if ts_ms is None:
        return False
    return (now_ms() - int(ts_ms)) <= max_age_ms


def _merge_dict(base, override):
    merged = dict(base or {})
    for key, value in (override or {}).items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _merge_dict(merged[key], value)
        else:
            merged[key] = value
    return merged


def build_component(status, detail, detected_at=None, **extra):
    payload = {
        "status": status,
        "detail": detail,
        "detectedAt": detected_at,
    }
    payload.update(extra)
    return payload


def _firebase_url(path):
    normalized = str(path or "").strip("/")
    base = f"{FIREBASE_RTDB_URL}/{normalized}.json"
    if FIREBASE_RTDB_AUTH:
        return f"{base}?auth={urllib.parse.quote(FIREBASE_RTDB_AUTH, safe='')}"
    return base


def _firebase_request(method, path, payload):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        _firebase_url(path),
        data=body,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        raw = resp.read().decode("utf-8", errors="ignore").strip()
        if not raw:
            return None
        try:
            return json.loads(raw)
        except Exception:
            return raw


def _append_system_alert(kind, title, message, severity="info"):
    ts = now_ms()
    alert = {
        "kind": kind,
        "title": title,
        "message": message,
        "severity": severity,
        "createdAt": ts,
    }
    existing = list(system_alerts)
    if existing:
        latest = existing[-1]
        if latest.get("kind") == kind and latest.get("title") == title and latest.get("message") == message:
            return
    system_alerts.append(alert)


def _uptime_percent():
    uptime_seconds = max(0, (now_ms() - app_started_at_ms) / 1000.0)
    if uptime_seconds <= 0:
        return 100.0
    downtime_penalty = 0.0 if firebase_sync_state.get("status") == "ok" else 0.2
    return round(max(0.0, min(100.0, 100.0 - downtime_penalty)), 1)


def _health_score(component):
    status = str((component or {}).get("status") or "unknown").lower()
    if status == "ok":
        return 99.5
    if status == "warning":
        return 95.2
    if status == "offline":
        return 72.0
    return 88.0


def _format_relative_time(ts_ms):
    if not ts_ms:
        return "just now"
    diff_seconds = max(0, int((now_ms() - int(ts_ms)) / 1000))
    if diff_seconds < 60:
        return f"{diff_seconds} sec ago"
    if diff_seconds < 3600:
        return f"{diff_seconds // 60} min ago"
    return f"{diff_seconds // 3600} hr ago"


def _load_percent():
    try:
        load1, _, _ = os.getloadavg()
        cpu_count = max(1, os.cpu_count() or 1)
        return round(min(100.0, max(0.0, (load1 / cpu_count) * 100.0)), 1)
    except Exception:
        return 0.0


def _record_system_load_sample(load_percent):
    ts = now_ms()
    last = system_load_samples[-1] if system_load_samples else None
    if last and (ts - int(last.get("capturedAt", 0))) < max(60000, FIREBASE_SYNC_INTERVAL_MS):
        last["value"] = load_percent
        last["capturedAt"] = ts
        last["label"] = time.strftime("%H:%M", time.localtime(ts / 1000.0))
        return
    system_load_samples.append({
        "capturedAt": ts,
        "label": time.strftime("%H:%M", time.localtime(ts / 1000.0)),
        "value": load_percent,
    })


def build_dashboard_payload(snapshot):
    components = snapshot.get("components") or {}
    firebase_component = components.get("firebaseSync") or {}
    load_percent = _load_percent()
    _record_system_load_sample(load_percent)

    if str((components.get("oledDisplay") or {}).get("status")) == "warning":
        _append_system_alert(
            "oled_warning",
            "OLED Display Warning",
            (components.get("oledDisplay") or {}).get("detail") or "OLED response needs attention.",
            severity="warning",
        )
    if firebase_component.get("status") == "ok":
        _append_system_alert(
            "firebase_sync",
            "System Backup Completed",
            "Automated backup of monitoring data completed successfully.",
            severity="info",
        )

    hardware_status = []
    for key, label in (
        ("raspberryPi", "Raspberry Pi"),
        ("arduinoUno", "Arduino Uno"),
        ("tofSensor", "ToF Sensor"),
        ("loadCell", "Load Cell"),
        ("cameraModule", "Camera Module"),
        ("oledDisplay", "OLED Display"),
    ):
        component = components.get(key) or {}
        hardware_status.append({
            "id": key,
            "label": label,
            "status": component.get("status") or "unknown",
            "healthPercent": _health_score(component),
            "lastCheckAt": component.get("detectedAt"),
            "lastCheckLabel": _format_relative_time(component.get("detectedAt")),
            "detail": component.get("detail") or "",
        })

    firebase_attempt = firebase_component.get("lastAttemptAt")
    firebase_success = firebase_component.get("lastSuccessAt") or firebase_attempt
    avg_response_ms = 45 if firebase_component.get("status") == "ok" else 180

    return {
        "title": "System Monitoring",
        "subtitle": "System Status",
        "statusLabel": "Operational" if snapshot.get("overall") == "ok" else "Degraded",
        "overview": {
            "systemStatus": {
                "label": "System Status",
                "value": "Operational" if snapshot.get("overall") == "ok" else "Degraded",
                "status": snapshot.get("overall"),
            },
            "network": {
                "label": "Network",
                "value": 98.5 if (components.get("wifi") or {}).get("status") == "ok" else 0.0,
                "unit": "%",
            },
            "uptime": {
                "label": "Uptime",
                "value": _uptime_percent(),
                "unit": "%",
            },
            "database": {
                "label": "Database",
                "value": avg_response_ms,
                "unit": "ms",
            },
            "avgResponse": {
                "label": "Avg Response",
                "value": avg_response_ms,
                "unit": "ms",
            },
            "serverLoad": {
                "label": "Server Load",
                "value": load_percent,
                "unit": "%",
            },
        },
        "hardwareStatus": hardware_status,
        "systemLoad": {
            "title": "System Load (Last 6 Hours)",
            "currentPercent": load_percent,
            "points": list(system_load_samples),
        },
        "systemAlerts": list(system_alerts)[-10:][::-1],
        "generatedAt": now_ms(),
        "firebaseLastSuccessAt": firebase_success,
    }


def _monitor_signature(snapshot):
    components = snapshot.get("components") or {}
    simplified = {}
    for key, value in components.items():
        if not isinstance(value, dict):
            continue
        simplified[key] = {
            "status": value.get("status"),
            "detail": value.get("detail"),
        }
    return json.dumps({
        "overall": snapshot.get("overall"),
        "mode": snapshot.get("mode"),
        "components": simplified,
    }, sort_keys=True)


def sync_system_status_to_firebase(force_history=False):
    if not FIREBASE_SYNC_ENABLED or not FIREBASE_RTDB_URL:
        with data_lock:
            firebase_sync_state["status"] = "disabled"
            firebase_sync_state["detail"] = "Backend Firebase sync is disabled."
            firebase_sync_state["detectedAt"] = now_ms()
        return False

    snapshot = build_system_status()
    ts = now_ms()
    history_signature = _monitor_signature(snapshot)

    with data_lock:
        last_signature = firebase_sync_state.get("historySignature")
        last_history_at = firebase_sync_state.get("lastHistoryAt")
        firebase_sync_state["lastAttemptAt"] = ts
        firebase_sync_state["status"] = "syncing"
        firebase_sync_state["detail"] = "Syncing monitoring status to Firebase..."
        firebase_sync_state["detectedAt"] = ts

    should_write_history = force_history or history_signature != last_signature
    if not should_write_history and last_history_at is not None:
        should_write_history = (ts - int(last_history_at)) >= max(5000, FIREBASE_HISTORY_INTERVAL_MS)

    payload_current = dict(snapshot)
    payload_current["lastSeenAt"] = ts
    payload_current["source"] = "backend"
    dashboard_payload = build_dashboard_payload(snapshot)
    payload_current_components = dict(payload_current.get("components") or {})
    payload_current_components["firebaseSync"] = build_component(
        "ok",
        "Backend sync to Firebase succeeded.",
        detected_at=ts,
        lastAttemptAt=ts,
        lastSuccessAt=ts,
    )
    payload_current["components"] = payload_current_components

    try:
        _firebase_request("PUT", f"systemMonitoring/{DEVICE_ID}/current", payload_current)
        _firebase_request("PATCH", f"systemMonitoring/{DEVICE_ID}/dashboard", dashboard_payload)
        if should_write_history:
            payload_history = dict(payload_current)
            payload_history["archivedAt"] = ts
            _firebase_request("POST", f"systemMonitoring/{DEVICE_ID}/history", payload_history)

        with data_lock:
            firebase_sync_state["status"] = "ok"
            firebase_sync_state["detail"] = "Backend sync to Firebase succeeded."
            firebase_sync_state["detectedAt"] = ts
            firebase_sync_state["lastSuccessAt"] = ts
            if should_write_history:
                firebase_sync_state["historySignature"] = history_signature
                firebase_sync_state["lastHistoryAt"] = ts
        return True
    except Exception as e:
        with data_lock:
            firebase_sync_state["status"] = "offline"
            firebase_sync_state["detail"] = f"Backend sync to Firebase failed: {e}"
            firebase_sync_state["detectedAt"] = ts
        print(f"Firebase monitoring sync failed: {e}")
        return False


def firebase_sync_loop():
    sleep_seconds = max(5, FIREBASE_SYNC_INTERVAL_MS / 1000.0)
    while True:
        try:
            sync_system_status_to_firebase(force_history=False)
        except Exception as e:
            print(f"Firebase monitoring sync loop error: {e}")
        time.sleep(sleep_seconds)


def get_network_status():
    try:
        with socket.create_connection(
            (SYSTEM_CONNECTIVITY_HOST, SYSTEM_CONNECTIVITY_PORT),
            timeout=SYSTEM_CONNECTIVITY_TIMEOUT,
        ):
            return {
                "status": "ok",
                "detail": f"Internet reachable via {SYSTEM_CONNECTIVITY_HOST}:{SYSTEM_CONNECTIVITY_PORT}",
                "online": True,
            }
    except Exception as e:
        return {
            "status": "offline",
            "detail": f"Internet check failed: {e}",
            "online": False,
        }


def build_system_status():
    with data_lock:
        snapshot = dict(sensor_data)
        serial_snapshot = dict(serial_state)
        overrides = _merge_dict({}, system_status_overrides)
        firebase_state = dict(firebase_sync_state)

    network = get_network_status()
    serial_connected = bool(serial_snapshot.get("connected"))
    weight_recent = _is_recent(serial_snapshot.get("lastWeightAt"))
    height_recent = _is_recent(serial_snapshot.get("lastHeightAt"))
    live_weight_recent = _is_recent(serial_snapshot.get("lastLiveWeightAt"))
    live_height_recent = _is_recent(serial_snapshot.get("lastLiveHeightAt"))
    serial_recent = _is_recent(serial_snapshot.get("lastLineAt"))

    components = {
        "raspberryPi": build_component(
            "ok",
            "Backend process running.",
            detected_at=now_ms(),
            uptimeSeconds=max(0, (now_ms() - app_started_at_ms) // 1000),
        ),
        "arduinoUno": build_component(
            "ok" if (serial_connected and serial_recent) else ("warning" if serial_connected else "offline"),
            (
                f"Serial stream active on {serial_snapshot.get('port') or SERIAL_PORT} @ {BAUD_RATE}"
                if (serial_connected and serial_recent)
                else (
                    f"Serial connected on {serial_snapshot.get('port') or SERIAL_PORT}, but no recent Arduino data."
                    if serial_connected
                    else (serial_snapshot.get("lastError") or f"Serial disconnected from {serial_snapshot.get('port') or SERIAL_PORT}")
                )
            ),
            detected_at=serial_snapshot.get("lastConnectedAt") or serial_snapshot.get("lastLineAt"),
            port=serial_snapshot.get("port") or SERIAL_PORT,
            baudRate=BAUD_RATE,
            receivingData=bool(serial_recent),
        ),
        "tofSensor": build_component(
            "ok" if snapshot.get("heightCm") is not None and height_recent else ("warning" if (serial_recent or live_height_recent) else "offline"),
            (
                f"Latest height {snapshot.get('heightCm')} cm"
                if snapshot.get("heightCm") is not None and height_recent
                else ("ToF sensor connected. Waiting for a person to measure." if (serial_recent or live_height_recent) else ("Arduino serial is connected but no recent ToF height data is arriving." if serial_connected else "No recent ToF height reading."))
            ),
            detected_at=serial_snapshot.get("lastHeightAt") or serial_snapshot.get("lastLiveHeightAt"),
            valueCm=snapshot.get("heightCm"),
            liveValueCm=snapshot.get("liveHeightCm"),
            rawDistanceCm=snapshot.get("rawDistanceCm"),
        ),
        "loadCell": build_component(
            "ok" if snapshot.get("weightKg") is not None and weight_recent else ("warning" if (serial_recent or live_weight_recent) else "offline"),
            (
                f"Latest weight {snapshot.get('weightKg')} kg"
                if snapshot.get("weightKg") is not None and weight_recent
                else ("Load cell connected. Waiting for someone to step on the scale." if (serial_recent or live_weight_recent) else ("Arduino serial is connected but no recent load-cell data is arriving." if serial_connected else "No recent load-cell reading."))
            ),
            detected_at=serial_snapshot.get("lastWeightAt") or serial_snapshot.get("lastLiveWeightAt"),
            valueKg=snapshot.get("weightKg"),
            liveValueKg=snapshot.get("liveWeightKg"),
        ),
        "cameraModule": build_component(
            "unknown",
            "Camera is managed by the browser. Frontend heartbeat can override this status.",
            detected_at=None,
        ),
        "oledDisplay": build_component(
            "unknown",
            "OLED status not yet reported. Post an override from the Pi service when available.",
            detected_at=None,
        ),
        "wifi": build_component(
            network["status"],
            network["detail"],
            detected_at=now_ms(),
            online=network["online"],
        ),
        "firebaseSync": build_component(
            firebase_state.get("status") or "unknown",
            firebase_state.get("detail") or "Backend Firebase sync has not run yet.",
            detected_at=firebase_state.get("detectedAt"),
            lastSuccessAt=firebase_state.get("lastSuccessAt"),
            lastAttemptAt=firebase_state.get("lastAttemptAt"),
        ),
    }

    override_components = overrides.get("components") or {}
    for key, value in override_components.items():
        if isinstance(value, dict):
            components[key] = _merge_dict(components.get(key, {}), value)

    if any((components.get(name) or {}).get("status") == "offline" for name in ("arduinoUno", "loadCell", "tofSensor")):
        overall = "degraded"
    elif any((component or {}).get("status") == "warning" for component in components.values()):
        overall = "warning"
    else:
        overall = "ok"

    mode = "online" if network["online"] else "offline"
    return {
        "ok": True,
        "deviceId": DEVICE_ID,
        "mode": mode,
        "overall": overall,
        "capturedAt": now_ms(),
        "backendStartedAt": app_started_at_ms,
        "serialConnected": bool(serial_snapshot.get("connected")),
        "serialPort": serial_snapshot.get("port") or SERIAL_PORT,
        "measurements": snapshot,
        "components": components,
        "overrideMeta": overrides.get("meta") or {},
        "overrideUpdatedAt": overrides.get("updatedAt"),
    }


def _serial_port_candidates():
    seen = set()
    candidates = []

    def add_candidate(value):
        path = str(value or "").strip()
        if not path or path in seen:
            return
        seen.add(path)
        candidates.append(path)

    for pattern in ("/dev/serial/by-id/*", "/dev/serial/by-path/*"):
        for match in sorted(glob.glob(pattern)):
            add_candidate(match)

    add_candidate(SERIAL_PORT)
    for item in SERIAL_PORT_CANDIDATES:
        add_candidate(item)

    for pattern in ("/dev/ttyACM*", "/dev/ttyUSB*"):
        for match in sorted(glob.glob(pattern)):
            add_candidate(match)

    if list_ports is not None:
        preferred = []
        fallback = []
        for port in list_ports.comports():
            device = str(getattr(port, "device", "") or "").strip()
            if not device:
                continue
            descriptor = " ".join([
                str(getattr(port, "manufacturer", "") or ""),
                str(getattr(port, "product", "") or ""),
                str(getattr(port, "description", "") or ""),
                str(getattr(port, "hwid", "") or ""),
            ]).lower()
            if any(token in descriptor for token in ("arduino", "ch340", "cp210", "usb serial", "usb-serial")):
                preferred.append(device)
            else:
                fallback.append(device)
        for device in preferred + fallback:
            add_candidate(device)

    return candidates


def open_serial():
    global ser
    if serial is None:
        print("pyserial not installed. Run: pip install pyserial")
        with data_lock:
            serial_state["connected"] = False
            serial_state["port"] = None
            serial_state["lastError"] = "pyserial is not installed."
        return

    last_error = None
    for port in _serial_port_candidates():
        try:
            ser = serial.Serial(port, BAUD_RATE, timeout=SERIAL_TIMEOUT)
            try:
                # Force an Arduino-class USB serial device to cleanly reset and
                # resume streaming after cold boots or prior stalled sessions.
                ser.dtr = False
                ser.rts = False
                time.sleep(0.25)
                ser.reset_input_buffer()
                ser.reset_output_buffer()
                ser.dtr = True
                ser.rts = True
                time.sleep(max(0.5, SERIAL_POST_RESET_WAIT_MS / 1000.0))
            except Exception:
                pass
            time.sleep(0.25)
            print(f"Serial connected: {port} @ {BAUD_RATE}")
            with data_lock:
                serial_state["connected"] = True
                serial_state["port"] = port
                serial_state["lastError"] = None
                serial_state["lastConnectedAt"] = now_ms()
            return
        except Exception as e:
            last_error = e
            ser = None

    message = str(last_error) if last_error is not None else f"No serial device found. Tried: {', '.join(_serial_port_candidates())}"
    print(f"Could not open serial port: {message}")
    with data_lock:
        serial_state["connected"] = False
        serial_state["port"] = None
        serial_state["lastError"] = message


def close_serial(reason=None):
    global ser
    try:
        if ser and ser.is_open:
            ser.close()
    except Exception:
        pass
    ser = None
    with data_lock:
        serial_state["connected"] = False
        serial_state["port"] = None
        serial_state["lastReconnectAt"] = now_ms()
        if reason:
            serial_state["lastError"] = str(reason)


def _face_recognition_deps_ready():
    return face_recognition is not None and np is not None and Image is not None


def _insightface_deps_ready():
    return insightface is not None and ort is not None and np is not None and Image is not None


def load_insightface_app():
    global insightface_app
    if not _insightface_deps_ready():
        insightface_status["loaded"] = False
        insightface_status["detail"] = "InsightFace dependencies missing (install insightface and onnxruntime)."
        return insightface_status["detail"]

    if insightface_app is not None:
        insightface_status["loaded"] = True
        insightface_status["detail"] = f"InsightFace model pack '{FACE_INSIGHTFACE_MODEL_PACK}' loaded."
        return None

    with insightface_lock:
        if insightface_app is not None:
            insightface_status["loaded"] = True
            insightface_status["detail"] = f"InsightFace model pack '{FACE_INSIGHTFACE_MODEL_PACK}' loaded."
            return None
        try:
            app_obj = insightface.app.FaceAnalysis(
                name=FACE_INSIGHTFACE_MODEL_PACK,
                providers=["CPUExecutionProvider"],
            )
            app_obj.prepare(ctx_id=-1, det_size=(FACE_INSIGHTFACE_DET_WIDTH, FACE_INSIGHTFACE_DET_HEIGHT))
            insightface_app = app_obj
            insightface_status["loaded"] = True
            insightface_status["detail"] = f"InsightFace model pack '{FACE_INSIGHTFACE_MODEL_PACK}' loaded."
            return None
        except Exception as e:
            insightface_app = None
            insightface_status["loaded"] = False
            insightface_status["detail"] = f"Could not load InsightFace: {e}"
            return insightface_status["detail"]


def _resolve_face_engine():
    requested = FACE_RECOGNITION_ENGINE
    if requested == "insightface":
        return "insightface" if load_insightface_app() is None else None
    if requested == "face_recognition":
        return "face_recognition" if _face_recognition_deps_ready() else None
    if load_insightface_app() is None:
        return "insightface"
    if _face_recognition_deps_ready():
        return "face_recognition"
    return None


@app.get("/face/status")
def face_status():
    selected_engine = _resolve_face_engine()
    return jsonify({
        "ok": True,
        "ready": selected_engine is not None,
        "engine": selected_engine,
        "requestedEngine": FACE_RECOGNITION_ENGINE,
        "deps": {
            "face_recognition": face_recognition is not None,
            "insightface": insightface is not None,
            "onnxruntime": ort is not None,
            "numpy": np is not None,
            "pillow": Image is not None,
        },
        "insightface": {
            "loaded": bool(insightface_status.get("loaded")),
            "detail": insightface_status.get("detail"),
            "modelPack": FACE_INSIGHTFACE_MODEL_PACK,
            "detSize": [FACE_INSIGHTFACE_DET_WIDTH, FACE_INSIGHTFACE_DET_HEIGHT],
        },
        "enrolledUserCount": len(face_db),
        "tolerance": FACE_TOLERANCE,
        "duplicateTolerance": FACE_DUPLICATE_TOLERANCE,
        "minMargin": FACE_MIN_MARGIN,
    })


@app.get("/camera/pi/status")
def camera_pi_status():
    return jsonify({
        "ok": True,
        "available": False,
        "mode": "browser_managed",
        "detail": "Pi camera backend is not configured in this build. The frontend should use browser camera fallback.",
    })


def _restriction_deps_ready():
    return YOLO is not None and np is not None and Image is not None


def _liveness_deps_ready():
    return ort is not None and np is not None and Image is not None and bool(FACE_LIVENESS_MODEL_PATH)


def _normalize_label(name):
    return str(name or "").strip().lower().replace("-", " ").replace("_", " ")


def _map_detection_to_restriction(label):
    normalized = _normalize_label(label)
    for key, aliases in RESTRICTION_ALIASES.items():
        if normalized in aliases:
            return key
    return None


def load_restriction_model():
    global restriction_model
    if not _restriction_deps_ready():
        return "Ultralytics/Pillow/Numpy dependencies are missing."
    if not os.path.exists(RESTRICTION_MODEL_PATH):
        return f"Restriction model not found at {RESTRICTION_MODEL_PATH}"
    try:
        restriction_model = YOLO(RESTRICTION_MODEL_PATH)
        return None
    except Exception as e:
        restriction_model = None
        return f"Could not load restriction model: {e}"


def load_liveness_model():
    global liveness_session, liveness_input_name
    if not _liveness_deps_ready():
        return "Liveness model is not configured."
    if not os.path.exists(FACE_LIVENESS_MODEL_PATH):
        return f"Liveness model not found at {FACE_LIVENESS_MODEL_PATH}"
    try:
        liveness_session = ort.InferenceSession(FACE_LIVENESS_MODEL_PATH, providers=["CPUExecutionProvider"])
        inputs = liveness_session.get_inputs()
        if not inputs:
            liveness_session = None
            liveness_input_name = None
            return "Liveness model has no inputs."
        liveness_input_name = inputs[0].name
        return None
    except Exception as e:
        liveness_session = None
        liveness_input_name = None
        return f"Could not load liveness model: {e}"


def detect_restrictions(rgb):
    if restriction_model is None:
        raise RuntimeError("Restriction model is not loaded.")

    results = restriction_model.predict(source=rgb, conf=RESTRICTION_CONFIDENCE, verbose=False)
    result = results[0]
    names = result.names if hasattr(result, "names") else {}
    blocked = {k: False for k in RESTRICTION_KEYS}
    matches = {k: [] for k in RESTRICTION_KEYS}

    boxes = result.boxes
    if boxes is None or len(boxes) == 0:
        return blocked, matches

    class_ids = boxes.cls.tolist()
    for cls_id in class_ids:
        cls_index = int(cls_id)
        label = names.get(cls_index, str(cls_index)) if isinstance(names, dict) else str(cls_index)
        key = _map_detection_to_restriction(label)
        if key is None:
            continue
        blocked[key] = True
        matches[key].append(_normalize_label(label))

    return blocked, matches


def _face_locations_with_fallback(rgb):
    try:
        return face_recognition.face_locations(rgb, model=FACE_DETECTION_MODEL)
    except Exception:
        if FACE_DETECTION_FALLBACK_MODEL and FACE_DETECTION_FALLBACK_MODEL != FACE_DETECTION_MODEL:
            return face_recognition.face_locations(rgb, model=FACE_DETECTION_FALLBACK_MODEL)
        raise


def _softmax(values):
    arr = np.array(values, dtype=np.float64)
    arr = arr - np.max(arr)
    ex = np.exp(arr)
    denom = np.sum(ex)
    if denom <= 0:
        return ex
    return ex / denom


def _sigmoid(x):
    return float(1.0 / (1.0 + np.exp(-x)))


def _point_mean(points):
    if not isinstance(points, list) or not points:
        return None
    sx = 0.0
    sy = 0.0
    count = 0
    for p in points:
        if not isinstance(p, tuple) or len(p) != 2:
            continue
        sx += float(p[0])
        sy += float(p[1])
        count += 1
    if count == 0:
        return None
    return (sx / count, sy / count)


def _point_dist(a, b):
    return float(math.hypot(float(a[0]) - float(b[0]), float(a[1]) - float(b[1])))


def _eye_aspect_ratio(eye_points):
    if not isinstance(eye_points, list) or len(eye_points) < 6:
        return None
    p1, p2, p3, p4, p5, p6 = eye_points[:6]
    horiz = _point_dist(p1, p4)
    if horiz <= 1e-6:
        return None
    vert = _point_dist(p2, p6) + _point_dist(p3, p5)
    return float(vert / (2.0 * horiz))


def compute_face_pose_metrics(rgb):
    locations = _face_locations_with_fallback(rgb)
    if len(locations) != 1:
        raise ValueError(f"Expected 1 face, found {len(locations)}")

    top, right, bottom, left = locations[0]
    width = max(0, right - left)
    height = max(0, bottom - top)
    if width < FACE_MIN_FACE_SIZE_PX or height < FACE_MIN_FACE_SIZE_PX:
        raise ValueError(f"Face too small. Move closer to camera (min {FACE_MIN_FACE_SIZE_PX}px).")

    landmarks_list = face_recognition.face_landmarks(rgb, face_locations=locations)
    if not landmarks_list:
        raise ValueError("Face detected but landmarks were not found. Hold still and retry.")

    lm = landmarks_list[0]
    left_eye_pts = lm.get("left_eye") or []
    right_eye_pts = lm.get("right_eye") or []
    nose_tip_pts = lm.get("nose_tip") or lm.get("nose_bridge") or []
    left_eye = _point_mean(left_eye_pts)
    right_eye = _point_mean(right_eye_pts)
    nose_tip = _point_mean(nose_tip_pts)
    if left_eye is None or right_eye is None or nose_tip is None:
        raise ValueError("Required face landmarks missing. Keep full face visible.")

    eye_mid = ((left_eye[0] + right_eye[0]) / 2.0, (left_eye[1] + right_eye[1]) / 2.0)
    eye_dist = max(_point_dist(left_eye, right_eye), 1.0)
    yaw = float((nose_tip[0] - eye_mid[0]) / eye_dist)
    pitch = float((nose_tip[1] - eye_mid[1]) / eye_dist)

    left_ear = _eye_aspect_ratio(left_eye_pts)
    right_ear = _eye_aspect_ratio(right_eye_pts)
    ear_candidates = []
    if left_ear is not None:
        ear_candidates.append(left_ear)
    if right_ear is not None:
        ear_candidates.append(right_ear)
    avg_ear = float(sum(ear_candidates) / len(ear_candidates)) if ear_candidates else None
    blink_detected = avg_ear is not None and avg_ear <= FACE_BLINK_EAR_THRESHOLD

    return {
        "yaw": yaw,
        "pitch": pitch,
        "ear": avg_ear,
        "blinkDetected": bool(blink_detected),
        "faceBox": {"top": int(top), "right": int(right), "bottom": int(bottom), "left": int(left)},
    }


def run_liveness_inference(rgb):
    if liveness_session is None or liveness_input_name is None:
        raise RuntimeError("Liveness model is not loaded.")

    resized = Image.fromarray(rgb).resize((FACE_LIVENESS_INPUT_SIZE, FACE_LIVENESS_INPUT_SIZE))
    arr = np.array(resized, dtype=np.float32) / 255.0
    if arr.ndim == 2:
        arr = np.stack([arr, arr, arr], axis=-1)
    if arr.shape[-1] > 3:
        arr = arr[:, :, :3]
    tensor = np.transpose(arr, (2, 0, 1))[None, :, :, :].astype(np.float32)

    outputs = liveness_session.run(None, {liveness_input_name: tensor})
    if not outputs:
        raise RuntimeError("Liveness model returned no outputs.")

    out = np.array(outputs[0])
    score_live = 0.0
    if out.ndim >= 2 and out.shape[-1] >= 2:
        probs = _softmax(out[0][:2])
        score_live = float(probs[1])
    elif out.size >= 2:
        flat = out.flatten()
        probs = _softmax(flat[:2])
        score_live = float(probs[1])
    else:
        scalar = float(out.flatten()[0])
        score_live = _sigmoid(scalar)

    return score_live >= FACE_LIVENESS_THRESHOLD, score_live


def load_face_db():
    global face_db
    try:
        if not os.path.exists(FACE_DB_FILE):
            face_db = {}
            return
        with open(FACE_DB_FILE, "r", encoding="utf-8") as f:
            payload = json.load(f)
        if isinstance(payload, dict):
            users_by_id = payload.get("usersById") if "usersById" in payload else payload
            face_db = users_by_id if isinstance(users_by_id, dict) else {}
        else:
            face_db = {}
    except Exception as e:
        print(f"Failed to load face DB ({FACE_DB_FILE}): {e}")
        face_db = {}


def save_face_db():
    tmp_path = f"{FACE_DB_FILE}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump({"usersById": face_db}, f, indent=2)
    os.replace(tmp_path, FACE_DB_FILE)


def formatted_timestamp_parts(epoch_ms=None):
    ts = int(epoch_ms if epoch_ms is not None else time.time() * 1000)
    dt = time.localtime(ts / 1000.0)
    return {
        "epochMs": ts,
        "date": time.strftime("%m/%d/%Y", dt),
        "time": time.strftime("%H:%M:%S", dt),
        "datetime": time.strftime("%m/%d/%Y %H:%M:%S", dt),
    }


def append_calibration_log(event):
    if not FACE_CALIBRATION_ENABLED:
        return
    try:
        with calibration_lock:
            with open(FACE_CALIBRATION_LOG_FILE, "a", encoding="utf-8") as f:
                f.write(json.dumps(event, ensure_ascii=True) + "\n")
    except Exception as e:
        print(f"Failed to append calibration log: {e}")


def _calc_percentile(values, percentile):
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    rank = (len(ordered) - 1) * (percentile / 100.0)
    lo = int(math.floor(rank))
    hi = int(math.ceil(rank))
    if lo == hi:
        return float(ordered[lo])
    frac = rank - lo
    return float(ordered[lo] + (ordered[hi] - ordered[lo]) * frac)


def decode_image_data_url(image_data: str):
    if not isinstance(image_data, str) or not image_data.strip():
        raise ValueError("imageData must be a non-empty string")

    # Accept both data URLs and plain base64 payloads.
    b64 = image_data.split(",", 1)[1] if "," in image_data else image_data
    raw = base64.b64decode(b64)
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    return np.array(img)


def _normalize_vector(vector):
    arr = np.array(vector, dtype=np.float64)
    norm = float(np.linalg.norm(arr))
    if norm <= 1e-12:
        return arr
    return arr / norm


def _record_engine(rec):
    engine = str((rec or {}).get("engine") or "").strip().lower()
    if engine:
        return engine
    if isinstance((rec or {}).get("embeddings"), list) or isinstance((rec or {}).get("embedding"), list):
        return "insightface"
    return "face_recognition"


def _record_vectors(rec):
    engine = _record_engine(rec)
    raw_vectors = rec.get("encodings") if engine == "face_recognition" else rec.get("embeddings")
    vectors = []
    if isinstance(raw_vectors, list):
        for item in raw_vectors:
            if isinstance(item, list) and item:
                vectors.append(item)
    fallback_key = "encoding" if engine == "face_recognition" else "embedding"
    fallback_vector = rec.get(fallback_key)
    if not vectors and isinstance(fallback_vector, list) and fallback_vector:
        vectors.append(fallback_vector)
    return engine, vectors


def _embedding_distance(a, b, engine):
    probe = np.array(a, dtype=np.float64)
    candidate = np.array(b, dtype=np.float64)
    if engine == "insightface":
        probe = _normalize_vector(probe)
        candidate = _normalize_vector(candidate)
        return float(1.0 - np.clip(np.dot(probe, candidate), -1.0, 1.0))
    if face_recognition is not None:
        try:
            distances = face_recognition.face_distance(np.array([candidate], dtype=np.float64), probe)
            if distances is not None and len(distances) > 0:
                return float(distances[0])
        except Exception:
            pass
    return float(np.linalg.norm(probe - candidate))


def find_best_face_match(probe_vector, probe_engine):
    best_user_id = None
    best_name = ""
    best_distance = float("inf")
    second_best_distance = float("inf")

    for user_id, rec in face_db.items():
        record_engine, candidate_vectors = _record_vectors(rec)
        if record_engine != probe_engine or not candidate_vectors:
            continue

        try:
            distances = [
                _embedding_distance(probe_vector, candidate_vector, probe_engine)
                for candidate_vector in candidate_vectors
            ]
            if not distances:
                continue
            distance = float(np.median(distances))
        except Exception:
            continue
        if distance < best_distance:
            second_best_distance = best_distance
            best_distance = distance
            best_user_id = str(user_id)
            best_name = str(rec.get("name", ""))
        elif distance < second_best_distance:
            second_best_distance = distance

    return best_user_id, best_name, best_distance, second_best_distance


def _effective_identify_tolerance(second_best_distance):
    if second_best_distance == float("inf"):
        return min(FACE_TOLERANCE, FACE_SINGLE_USER_TOLERANCE)
    return FACE_TOLERANCE


def _effective_duplicate_tolerance(second_best_distance):
    if second_best_distance == float("inf"):
        return min(FACE_DUPLICATE_TOLERANCE, FACE_DUPLICATE_SINGLE_USER_TOLERANCE)
    return FACE_DUPLICATE_TOLERANCE


def _validate_registration_probes(probes, engine):
    if not probes:
        raise ValueError("No valid face samples captured.")

    probe_matrix = np.array(probes, dtype=np.float64)
    centroid = np.mean(probe_matrix, axis=0)
    sample_distances = [_embedding_distance(sample, centroid, engine) for sample in probe_matrix]
    if not sample_distances:
        raise ValueError("Could not verify registration samples.")

    if float(np.max(sample_distances)) > FACE_REGISTER_MAX_SAMPLE_DISTANCE:
        raise ValueError("Face samples were inconsistent. Keep one face centered and try again.")

    if engine == "insightface":
        return _normalize_vector(centroid)
    return centroid


def _should_apply_duplicate_check(second_best_distance):
    # With only one enrolled user, duplicate blocking can reject distinct people.
    # Keep it optional via env for stricter deployments.
    if second_best_distance == float("inf") and not FACE_ENFORCE_SINGLE_USER_DUPLICATE_CHECK:
        return False
    return True


def extract_face_encoding(image_data: str, num_jitters: int = 1):
    rgb = decode_image_data_url(image_data)
    locations = _face_locations_with_fallback(rgb)
    if len(locations) != 1:
        raise ValueError(f"Expected 1 face, found {len(locations)}")

    top, right, bottom, left = locations[0]
    width = max(0, right - left)
    height = max(0, bottom - top)
    if width < FACE_MIN_FACE_SIZE_PX or height < FACE_MIN_FACE_SIZE_PX:
        raise ValueError(f"Face too small. Move closer to camera (min {FACE_MIN_FACE_SIZE_PX}px).")

    encodings = face_recognition.face_encodings(
        rgb,
        known_face_locations=locations,
        num_jitters=max(1, num_jitters),
    )
    if not encodings:
        raise ValueError("Face detected but encoding failed")
    return encodings[0]


def extract_face_embedding_insightface(image_data: str):
    load_error = load_insightface_app()
    if load_error is not None or insightface_app is None:
        raise ValueError(load_error or "InsightFace is not available.")

    rgb = decode_image_data_url(image_data)
    bgr = rgb[:, :, ::-1]
    faces = insightface_app.get(bgr)
    if len(faces) != 1:
        raise ValueError(f"Expected 1 face, found {len(faces)}")

    face = faces[0]
    bbox = getattr(face, "bbox", None)
    if bbox is None or len(bbox) < 4:
        raise ValueError("Face detected but bounding box was missing.")

    left, top, right, bottom = [float(v) for v in bbox[:4]]
    width = max(0.0, right - left)
    height = max(0.0, bottom - top)
    if width < FACE_MIN_FACE_SIZE_PX or height < FACE_MIN_FACE_SIZE_PX:
        raise ValueError(f"Face too small. Move closer to camera (min {FACE_MIN_FACE_SIZE_PX}px).")

    embedding = getattr(face, "normed_embedding", None)
    if embedding is None:
        embedding = getattr(face, "embedding", None)
    if embedding is None:
        raise ValueError("Face detected but embedding extraction failed.")

    return _normalize_vector(embedding)


def extract_face_signature(image_data: str, num_jitters: int = 1):
    engine = _resolve_face_engine()
    if engine == "insightface":
        return engine, extract_face_embedding_insightface(image_data)
    if engine == "face_recognition":
        return engine, extract_face_encoding(image_data, num_jitters=num_jitters)
    raise ValueError("No facial recognition engine is ready.")


def _parse_weight_line(line: str):
    text = str(line or "").strip()
    upper = text.upper()
    prefixes = (
        "WEIGHT:",
        "WEIGHT=",
        "WEIGHT ",
        "WT:",
        "WT=",
        "WT ",
        "LOAD:",
        "LOAD=",
        "LOAD ",
        "LOADCELL:",
        "LOADCELL=",
        "LOADCELL ",
        "SCALE:",
        "SCALE=",
        "SCALE ",
        "LOCAL WEIGHT (KG):",
        "LOCAL WEIGHT:",
    )

    payload = None
    for prefix in prefixes:
        if upper.startswith(prefix):
            payload = text[len(prefix):].strip()
            break

    if payload is None:
        return None

    normalized = payload.replace(",", ".")
    match = re.search(r"-?\d+(?:\.\d+)?", normalized)
    if not match:
        return None
    return float(match.group(0))


def _parse_height_distance_line(line: str):
    text = str(line or "").strip()
    upper = text.upper()
    prefixes = (
        "DIST:",
        "DIST=",
        "DIST ",
        "DISTANCE:",
        "DISTANCE=",
        "DISTANCE ",
        "TOF:",
        "TOF=",
        "TOF ",
        "RANGE:",
        "RANGE=",
        "RANGE ",
        "HEIGHT_DIST:",
        "HEIGHT_DIST=",
        "HEIGHT_DIST ",
        "LOCAL DISTANCE (CM):",
        "LOCAL DISTANCE:",
    )

    payload = None
    for prefix in prefixes:
        if upper.startswith(prefix):
            payload = text[len(prefix):].strip()
            break

    if payload is None:
        return None

    normalized = payload.replace(",", ".")
    match = re.search(r"-?\d+(?:\.\d+)?", normalized)
    if not match:
        return None
    return float(match.group(0))


def handle_line(line: str):
    line_ts = now_ms()
    with data_lock:
        serial_state["lastLineAt"] = line_ts
        serial_line_history.append({
            "line": line,
            "receivedAt": line_ts,
        })

    # LOAD CELL CUSTOMIZATION HERE
    # Accept common Arduino weight formats like: WEIGHT:72.4, WT=72.4kg, LOADCELL 72.4
    parsed_weight = _parse_weight_line(line)
    if parsed_weight is not None:
        try:
            weight = float(parsed_weight)
            if weight < 0:
                weight = 0.0
            with data_lock:
                calibrated_weight = round(_apply_weight_calibration(weight), 1)
                if weight_filter_state["measurementStartedAt"] is None:
                    weight_filter_state["measurementStartedAt"] = line_ts
                prior_live_weight = sensor_data.get("liveWeightKg")
                if (
                    prior_live_weight is not None
                    and calibrated_weight >= WEIGHT_EMPTY_THRESHOLD_KG
                    and abs(calibrated_weight - float(prior_live_weight)) > WEIGHT_SPIKE_REJECT_KG
                ):
                    sensor_data["weightPhase"] = "active"
                    sensor_data["statusMessage"] = "Hold still on the scale"
                    serial_state["lastLiveWeightAt"] = line_ts
                    _sync_measurement_flags_locked("Hold still on the scale")
                    return

                weight_samples.append(calibrated_weight)
                sensor_data["liveWeightKg"] = calibrated_weight
                sensor_data["weightPhase"] = "active"
                sensor_data["statusMessage"] = "Reading live load cell"
                serial_state["lastLiveWeightAt"] = line_ts

                if calibrated_weight < WEIGHT_EMPTY_THRESHOLD_KG:
                    weight_filter_state["stableSince"] = None
                    sensor_data["weightKg"] = None
                    sensor_data["finalWeightKg"] = None
                    sensor_data["weightStable"] = False
                    sensor_data["weightPhase"] = "idle"
                    sensor_data["statusMessage"] = "Step on the scale"
                    recompute_bmi_locked()
                    _sync_measurement_flags_locked("Step on the scale")
                    return

                if len(weight_samples) >= max(1, WEIGHT_STABLE_MIN_SAMPLES):
                    recent_weights = list(weight_samples)
                    stable_range = _buffer_range(recent_weights)
                    filtered_weight_kg = _trimmed_median(recent_weights)

                    if filtered_weight_kg is not None and stable_range is not None:
                        candidate_weight_kg = round(float(filtered_weight_kg), 1)
                        fallback_range = weight_filter_state["fallbackCandidateRangeKg"]
                        if fallback_range is None or stable_range < fallback_range:
                            weight_filter_state["fallbackCandidateWeightKg"] = candidate_weight_kg
                            weight_filter_state["fallbackCandidateRangeKg"] = stable_range

                        if stable_range <= WEIGHT_STABLE_RANGE_KG:
                            best_weight = weight_filter_state["bestCandidateWeightKg"]
                            best_range = weight_filter_state["bestCandidateRangeKg"]
                            if (
                                best_weight is None
                                or best_range is None
                                or stable_range < best_range
                                or stable_range == best_range
                            ):
                                weight_filter_state["bestCandidateWeightKg"] = candidate_weight_kg
                                weight_filter_state["bestCandidateRangeKg"] = stable_range
                            if weight_filter_state["stableSince"] is None:
                                weight_filter_state["stableSince"] = line_ts
                            sensor_data["weightPhase"] = "stabilizing"
                            sensor_data["statusMessage"] = "Hold still on the scale"
                            held_ms = line_ts - int(weight_filter_state["stableSince"])
                            time_since_start_ms = line_ts - int(weight_filter_state["measurementStartedAt"]) if weight_filter_state["measurementStartedAt"] is not None else 0
                            if (
                                held_ms >= max(250, WEIGHT_STABLE_HOLD_MS)
                                and time_since_start_ms >= max(500, WEIGHT_ENTRY_SETTLE_MS)
                            ):
                                locked_weight_kg = round(
                                    float(
                                        weight_filter_state["bestCandidateWeightKg"]
                                        if weight_filter_state["bestCandidateWeightKg"] is not None
                                        else candidate_weight_kg
                                    ),
                                    1,
                                )
                                sensor_data["weightKg"] = locked_weight_kg
                                sensor_data["finalWeightKg"] = locked_weight_kg
                                sensor_data["weightStable"] = True
                                sensor_data["weightPhase"] = "locked"
                                sensor_data["statusMessage"] = "Final measurement locked"
                                serial_state["lastWeightAt"] = line_ts
                                weight_filter_state["lastPublishedAt"] = line_ts
                                recompute_bmi_locked()
                                _sync_measurement_flags_locked("Final measurement locked")
                            else:
                                recompute_bmi_locked()
                                _sync_measurement_flags_locked("Hold still on the scale")
                        else:
                            weight_filter_state["stableSince"] = None
                            sensor_data["weightStable"] = False
                            sensor_data["weightPhase"] = "active"
                            sensor_data["statusMessage"] = "Hold still on the scale"
                            recompute_bmi_locked()
                            _sync_measurement_flags_locked("Hold still on the scale")

                started_at = weight_filter_state["measurementStartedAt"]
                if (
                    not sensor_data["weightStable"]
                    and started_at is not None
                    and (line_ts - int(started_at)) >= max(1200, WEIGHT_FORCE_LOCK_MS, WEIGHT_ENTRY_SETTLE_MS)
                    and (
                        weight_filter_state["bestCandidateWeightKg"] is not None
                        or weight_filter_state["fallbackCandidateWeightKg"] is not None
                    )
                ):
                    candidate_weight_kg = (
                        weight_filter_state["bestCandidateWeightKg"]
                        if weight_filter_state["bestCandidateWeightKg"] is not None
                        else weight_filter_state["fallbackCandidateWeightKg"]
                    )
                    candidate_range = (
                        weight_filter_state["bestCandidateRangeKg"]
                        if weight_filter_state["bestCandidateWeightKg"] is not None
                        else weight_filter_state["fallbackCandidateRangeKg"]
                    )
                    if candidate_range is not None and candidate_range <= WEIGHT_FORCE_LOCK_MAX_RANGE_KG:
                        locked_weight_kg = round(float(candidate_weight_kg), 1)
                        sensor_data["weightKg"] = locked_weight_kg
                        sensor_data["finalWeightKg"] = locked_weight_kg
                        sensor_data["weightStable"] = True
                        sensor_data["weightPhase"] = "locked"
                        sensor_data["statusMessage"] = "Final measurement locked"
                        serial_state["lastWeightAt"] = line_ts
                        recompute_bmi_locked()
                        _sync_measurement_flags_locked("Final measurement locked")
        except Exception as e:
            print(f"Weight measurement processing error: {e} | line={line!r}")
        return

    # TOF SENSOR CUSTOMIZATION HERE
    # Expect Arduino lines like: DIST:34.6 where distance is from the LiDAR sensor
    # down to the top of the person's head. Person height is computed from the
    # fixed LiDAR-to-platform distance.
    parsed_distance = _parse_height_distance_line(line)
    if parsed_distance is not None:
        try:
            dist_cm = float(parsed_distance)
            now_ts = now_ms()

            with data_lock:
                if height_filter_state["measurementStartedAt"] is None:
                    height_filter_state["measurementStartedAt"] = now_ts
                height_distance_samples.append(dist_cm)
                sensor_data["rawDistanceCm"] = round(dist_cm, 1)
                live_distance_cm = _trimmed_median(list(height_distance_samples))
                if live_distance_cm is not None:
                    live_height_cm = _apply_height_calibration(live_distance_cm)
                    if MIN_HEIGHT_CM <= live_height_cm <= MAX_HEIGHT_CM:
                        rounded_live_height_cm = int(round(live_height_cm))
                        sensor_data["liveHeightCm"] = rounded_live_height_cm
                        if height_filter_state["firstValidLiveAt"] is None:
                            height_filter_state["firstValidLiveAt"] = line_ts
                        if rounded_live_height_cm >= HEIGHT_STANDING_MIN_CM:
                            trusted_peak_height_cm = height_filter_state["trustedPeakHeightCm"]
                            if trusted_peak_height_cm is None or rounded_live_height_cm > int(trusted_peak_height_cm):
                                height_filter_state["trustedPeakHeightCm"] = rounded_live_height_cm
                                height_filter_state["trustedPeakSeenAt"] = line_ts
                        peak_live_height_cm = height_filter_state["peakLiveHeightCm"]
                        if peak_live_height_cm is None or rounded_live_height_cm > int(peak_live_height_cm):
                            height_filter_state["peakLiveHeightCm"] = rounded_live_height_cm
                            best_height = height_filter_state["bestCandidateHeightCm"]
                            if (
                                best_height is not None
                                and rounded_live_height_cm >= HEIGHT_STANDING_MIN_CM
                                and int(best_height) < (rounded_live_height_cm - HEIGHT_PEAK_REBASE_DELTA_CM)
                            ):
                                # A significantly better standing-height peak appeared,
                                # so discard the earlier lower candidate before it can lock in.
                                height_filter_state["bestCandidateHeightCm"] = None
                                height_filter_state["bestCandidateDistanceCm"] = None
                                height_filter_state["bestCandidateRangeCm"] = None
                                height_filter_state["stableSince"] = None
                        sensor_data["heightPhase"] = "person_detected" if len(height_distance_samples) < HEIGHT_STABLE_MIN_SAMPLES else "measuring"
                        sensor_data["statusMessage"] = "Stand centered under the sensor"
                        serial_state["lastLiveHeightAt"] = line_ts
                    elif live_height_cm < MIN_HEIGHT_CM:
                        _reset_height_measurement_locked("Stand under sensor")
                        serial_state["lastHeightAt"] = None
                        serial_state["lastLiveHeightAt"] = None
                        return
                if len(height_distance_samples) >= max(1, HEIGHT_STABLE_MIN_SAMPLES):
                    recent = list(height_distance_samples)
                    stable_range = _buffer_range(recent)
                    filtered_dist_cm = _trimmed_median(recent)

                    if filtered_dist_cm is not None and stable_range is not None:
                        person_height = _apply_height_calibration(filtered_dist_cm)

                        if MIN_HEIGHT_CM <= person_height <= MAX_HEIGHT_CM:
                            candidate_height_cm = int(round(person_height))
                            peak_live_height_cm = height_filter_state["peakLiveHeightCm"]
                            if candidate_height_cm < HEIGHT_STANDING_MIN_CM:
                                height_filter_state["stableSince"] = None
                                if not sensor_data["heightStable"]:
                                    sensor_data["heightPhase"] = "measuring"
                                    sensor_data["statusMessage"] = "Stand tall under the sensor"
                                    _sync_measurement_flags_locked("Stand tall under the sensor")
                                return
                            minimum_lockable_height_cm = None
                            if peak_live_height_cm is not None and int(peak_live_height_cm) >= HEIGHT_STANDING_MIN_CM:
                                minimum_lockable_height_cm = max(
                                    HEIGHT_STANDING_MIN_CM,
                                    int(peak_live_height_cm) - HEIGHT_DROP_REJECT_CM,
                                )
                            if minimum_lockable_height_cm is not None and candidate_height_cm < minimum_lockable_height_cm:
                                height_filter_state["stableSince"] = None
                                if not sensor_data["heightStable"]:
                                    sensor_data["heightPhase"] = "measuring"
                                    sensor_data["statusMessage"] = "Hold still at full height"
                                    _sync_measurement_flags_locked("Hold still at full height")
                                return
                            candidate_near_peak = (
                                peak_live_height_cm is None
                                or candidate_height_cm >= (int(peak_live_height_cm) - HEIGHT_CANDIDATE_PEAK_TOLERANCE_CM)
                            )
                            fallback_range = height_filter_state["fallbackCandidateRangeCm"]
                            if fallback_range is None or stable_range < fallback_range:
                                height_filter_state["fallbackCandidateHeightCm"] = candidate_height_cm
                                height_filter_state["fallbackCandidateDistanceCm"] = filtered_dist_cm
                                height_filter_state["fallbackCandidateRangeCm"] = stable_range
                            if stable_range <= HEIGHT_STABLE_RANGE_CM and candidate_near_peak:
                                best_height = height_filter_state["bestCandidateHeightCm"]
                                best_range = height_filter_state["bestCandidateRangeCm"]
                                if (
                                    best_height is None
                                    or best_range is None
                                    or stable_range < best_range
                                    or (
                                        stable_range == best_range
                                        and candidate_height_cm < int(best_height)
                                    )
                                ):
                                    height_filter_state["bestCandidateHeightCm"] = candidate_height_cm
                                    height_filter_state["bestCandidateDistanceCm"] = filtered_dist_cm
                                    height_filter_state["bestCandidateRangeCm"] = stable_range
                                if height_filter_state["stableSince"] is None:
                                    height_filter_state["stableSince"] = now_ts
                                sensor_data["heightPhase"] = "stabilizing"
                                sensor_data["statusMessage"] = "Stay centered and hold still"
                                held_ms = now_ts - int(height_filter_state["stableSince"])
                                visible_ms = 0
                                if height_filter_state["firstValidLiveAt"] is not None:
                                    visible_ms = now_ts - int(height_filter_state["firstValidLiveAt"])
                                live_height_now = sensor_data.get("liveHeightCm")
                                live_matches_candidate = (
                                    live_height_now is not None
                                    and abs(int(live_height_now) - int(candidate_height_cm)) <= HEIGHT_LOCK_LIVE_MATCH_TOLERANCE_CM
                                )
                                if (
                                    held_ms >= max(250, HEIGHT_STABLE_HOLD_MS)
                                    and stable_range <= HEIGHT_HOLD_RANGE_CM
                                    and visible_ms >= max(300, HEIGHT_MIN_VISIBLE_LOCK_MS)
                                    and live_matches_candidate
                                ):
                                    locked_height_cm = int(candidate_height_cm)
                                    best_locked_height_cm = height_filter_state["bestCandidateHeightCm"]
                                    if (
                                        best_locked_height_cm is not None
                                        and abs(int(best_locked_height_cm) - int(candidate_height_cm)) <= HEIGHT_LOCK_LIVE_MATCH_TOLERANCE_CM
                                    ):
                                        locked_height_cm = int(best_locked_height_cm)
                                    trusted_peak_height_cm = height_filter_state.get("trustedPeakHeightCm")
                                    if (
                                        trusted_peak_height_cm is not None
                                        and int(trusted_peak_height_cm) > locked_height_cm
                                        and int(trusted_peak_height_cm) <= (locked_height_cm + HEIGHT_TRUSTED_PEAK_OVERRIDE_CM)
                                    ):
                                        locked_height_cm = int(trusted_peak_height_cm)
                                    peak_live_height_cm = height_filter_state["peakLiveHeightCm"]
                                    if (
                                        peak_live_height_cm is not None
                                        and locked_height_cm < (int(peak_live_height_cm) - HEIGHT_LOCK_MIN_PEAK_MARGIN_CM)
                                    ):
                                        height_filter_state["stableSince"] = None
                                        if not sensor_data["heightStable"]:
                                            sensor_data["heightPhase"] = "measuring"
                                            sensor_data["statusMessage"] = "Re-center under the sensor"
                                            _sync_measurement_flags_locked("Re-center under the sensor")
                                    else:
                                        sensor_data["heightCm"] = locked_height_cm
                                        sensor_data["finalHeightCm"] = locked_height_cm
                                        sensor_data["heightStable"] = True
                                        sensor_data["heightPhase"] = "locked"
                                        sensor_data["statusMessage"] = "Final measurement locked"
                                        sensor_data["updatedAt"] = int(time.time())
                                        serial_state["lastHeightAt"] = line_ts
                                        height_filter_state["lastPublishedAt"] = now_ts
                                        recompute_bmi_locked()
                                        _sync_measurement_flags_locked("Final measurement locked")
                            else:
                                height_filter_state["stableSince"] = None
                                if not sensor_data["heightStable"]:
                                    sensor_data["heightPhase"] = "measuring"
                                    sensor_data["statusMessage"] = "Wait for a stable height"
                                    _sync_measurement_flags_locked("Wait for a stable height")
                        else:
                            height_filter_state["stableSince"] = None
                            if not sensor_data["heightStable"]:
                                sensor_data["heightPhase"] = "measuring"
                                sensor_data["statusMessage"] = "Stand centered under the sensor"
                                _sync_measurement_flags_locked("Stand centered under the sensor")
                    else:
                        height_filter_state["stableSince"] = None
                        if not sensor_data["heightStable"]:
                            sensor_data["heightPhase"] = "measuring"
                            sensor_data["statusMessage"] = "Stand centered under the sensor"
                            _sync_measurement_flags_locked("Stand centered under the sensor")

                started_at = height_filter_state["measurementStartedAt"]
                if (
                    not sensor_data["heightStable"]
                    and started_at is not None
                    and (now_ts - int(started_at)) >= max(1200, HEIGHT_FORCE_LOCK_MS)
                    and (
                        height_filter_state["bestCandidateHeightCm"] is not None
                        or height_filter_state["fallbackCandidateHeightCm"] is not None
                        or height_filter_state["trustedPeakHeightCm"] is not None
                    )
                ):
                    trusted_peak_height_cm = height_filter_state.get("trustedPeakHeightCm")
                    candidate_source = "best"
                    candidate_range = height_filter_state["bestCandidateRangeCm"]
                    candidate_height_cm = int(
                        height_filter_state["bestCandidateHeightCm"]
                        if height_filter_state["bestCandidateHeightCm"] is not None
                        else (
                            height_filter_state["fallbackCandidateHeightCm"]
                            if height_filter_state["fallbackCandidateHeightCm"] is not None
                            else trusted_peak_height_cm
                        )
                    )
                    if height_filter_state["bestCandidateHeightCm"] is None:
                        candidate_source = "fallback" if height_filter_state["fallbackCandidateHeightCm"] is not None else "trusted_peak"
                        candidate_range = height_filter_state["fallbackCandidateRangeCm"]
                    peak_live_height_cm = height_filter_state["peakLiveHeightCm"]
                    visible_ms = 0
                    if height_filter_state["firstValidLiveAt"] is not None:
                        visible_ms = now_ts - int(height_filter_state["firstValidLiveAt"])
                    live_height_now = sensor_data.get("liveHeightCm")
                    if (
                        visible_ms < max(300, HEIGHT_MIN_VISIBLE_LOCK_MS)
                        or (
                            trusted_peak_height_cm is None
                            and (
                                live_height_now is None
                                or abs(int(live_height_now) - int(candidate_height_cm)) > HEIGHT_LOCK_LIVE_MATCH_TOLERANCE_CM
                            )
                        )
                    ):
                        sensor_data["heightPhase"] = "measuring"
                        sensor_data["statusMessage"] = "Wait for a stable height"
                        _sync_measurement_flags_locked("Wait for a stable height")
                        return
                    if (
                        candidate_source != "trusted_peak"
                        and candidate_range is not None
                        and candidate_range > HEIGHT_FORCE_LOCK_MAX_RANGE_CM
                    ):
                        sensor_data["heightPhase"] = "measuring"
                        sensor_data["statusMessage"] = "Wait for a stable height"
                        _sync_measurement_flags_locked("Wait for a stable height")
                        return
                    minimum_lockable_height_cm = None
                    if peak_live_height_cm is not None and int(peak_live_height_cm) >= HEIGHT_STANDING_MIN_CM:
                        minimum_lockable_height_cm = max(
                            HEIGHT_STANDING_MIN_CM,
                            int(peak_live_height_cm) - HEIGHT_DROP_REJECT_CM,
                        )
                    if minimum_lockable_height_cm is not None and candidate_height_cm < minimum_lockable_height_cm:
                        sensor_data["heightPhase"] = "measuring"
                        sensor_data["statusMessage"] = "Hold still at full height"
                        _sync_measurement_flags_locked("Hold still at full height")
                        return
                    if (
                        peak_live_height_cm is not None
                        and candidate_height_cm < (int(peak_live_height_cm) - HEIGHT_LOCK_MIN_PEAK_MARGIN_CM)
                    ):
                        sensor_data["heightPhase"] = "measuring"
                        sensor_data["statusMessage"] = "Re-center under the sensor"
                        _sync_measurement_flags_locked("Re-center under the sensor")
                    else:
                        sensor_data["heightCm"] = candidate_height_cm
                        sensor_data["finalHeightCm"] = candidate_height_cm
                        sensor_data["heightStable"] = True
                        sensor_data["heightPhase"] = "locked"
                        sensor_data["statusMessage"] = "Final measurement locked"
                        sensor_data["updatedAt"] = int(time.time())
                        serial_state["lastHeightAt"] = line_ts
                        recompute_bmi_locked()
                        _sync_measurement_flags_locked("Final measurement locked")
        except Exception as e:
            print(f"Height measurement processing error: {e} | line={line!r}")


def read_serial_data():
    global ser
    while True:
        try:
            if ser is None or not ser.is_open:
                open_serial()
                if ser is None:
                    time.sleep(1)
                    continue

            raw_line = ser.readline()
            if raw_line:
                line = raw_line.decode(errors="ignore").strip()
                if line:
                    handle_line(line)
                continue

            now_ts = now_ms()
            with data_lock:
                last_connected_at = serial_state.get("lastConnectedAt")
                last_line_at = serial_state.get("lastLineAt")
                current_port = serial_state.get("port") or SERIAL_PORT
            boot_suppress_reopen = (now_ts - app_started_at_ms) < max(0, SERIAL_COLD_BOOT_SUPPRESS_REOPEN_MS)

            if (
                ser is not None
                and ser.is_open
                and last_connected_at is not None
                and (last_line_at is None or int(last_line_at) < int(last_connected_at))
                and (now_ts - int(last_connected_at)) >= max(1000, SERIAL_STARTUP_GRACE_MS)
            ):
                print(f"Serial watchdog: no data received after connect on {current_port}; reopening port")
                close_serial(f"No serial data received within {SERIAL_STARTUP_GRACE_MS} ms after connect.")
                time.sleep(1)
                continue

            if (
                ser is not None
                and ser.is_open
                and last_line_at is not None
                and (now_ts - int(last_line_at)) >= max(1000, SERIAL_STALE_REOPEN_MS)
                and not boot_suppress_reopen
            ):
                print(f"Serial watchdog: stale serial stream on {current_port}; reopening port")
                close_serial(f"Serial data stalled for more than {SERIAL_STALE_REOPEN_MS} ms.")
                time.sleep(1)
                continue
            else:
                time.sleep(0.05)
        except Exception as e:
            print(f"Serial read error: {e}")
            close_serial(str(e))
            time.sleep(1)


@app.get("/health")
def health():
    return jsonify({"ok": True})


def build_sensor_response(field_name, value, updated_at_ms, *, live_field_name=None, live_value=None, live_updated_at_ms=None, final_field_name=None, stable=False, phase="idle", status_message=""):
    serial_connected = bool(serial_state.get("connected"))
    serial_receiving = _is_recent(serial_state.get("lastLineAt"))
    payload = {
        field_name: value,
        "updatedAtMs": updated_at_ms,
        "fresh": _is_recent(updated_at_ms),
        "stable": bool(stable and value is not None and _is_recent(updated_at_ms)),
        "phase": phase,
        "statusMessage": status_message,
        "measurementLocked": sensor_data.get("measurementLocked", False),
        live_field_name: live_value,
        "liveUpdatedAtMs": live_updated_at_ms,
        "liveFresh": _is_recent(live_updated_at_ms),
        "backendReachable": True,
        "serialConnected": serial_connected,
        "serialReceivingData": serial_receiving,
        "serialPort": serial_state.get("port") or SERIAL_PORT,
    }
    if final_field_name:
        payload[final_field_name] = value
    return payload


@app.get("/sensor/weight")
def sensor_weight():
    with data_lock:
        return jsonify(build_sensor_response(
            "weightKg",
            sensor_data["weightKg"],
            serial_state.get("lastWeightAt"),
            live_field_name="liveWeightKg",
            live_value=sensor_data.get("liveWeightKg"),
            live_updated_at_ms=serial_state.get("lastLiveWeightAt"),
            final_field_name="finalWeightKg",
            stable=sensor_data.get("weightStable", False),
            phase=sensor_data.get("weightPhase", "idle"),
            status_message=(sensor_data.get("statusMessage") if sensor_data.get("weightPhase") != "idle" else "Step on the scale"),
        ))


@app.get("/sensor/calibration/weight")
def sensor_weight_calibration_status():
    with data_lock:
        live_weight = sensor_data.get("liveWeightKg")
        stable_weight = sensor_data.get("weightKg")
        offset_kg = _get_weight_calibration_offset_kg()
        raw_live_weight_kg = _latest_live_raw_weight_kg_locked()
        raw_stable_weight_kg = None
        if stable_weight is not None:
            raw_stable_weight_kg = round(_estimate_raw_weight_kg(stable_weight), 3)

        return jsonify({
            "ok": True,
            "offsetKg": round(offset_kg, 4),
            "offsetUpdatedAt": weight_calibration_state.get("updatedAt"),
            "offsetSource": weight_calibration_state.get("source"),
            "file": WEIGHT_CALIBRATION_FILE,
            "liveWeightKg": live_weight,
            "rawLiveWeightKg": None if raw_live_weight_kg is None else round(raw_live_weight_kg, 3),
            "stableWeightKg": stable_weight,
            "rawStableWeightKg": raw_stable_weight_kg,
            "serialConnected": bool(serial_state.get("connected")),
            "serialReceivingData": _is_recent(serial_state.get("lastLineAt")),
            "liveFresh": _is_recent(serial_state.get("lastLiveWeightAt"), max(2500, SYSTEM_COMPONENT_FRESH_MS)),
            "statusMessage": sensor_data.get("statusMessage") or "Step on the scale",
            "phase": sensor_data.get("weightPhase") or "idle",
        })


@app.post("/sensor/calibration/weight/tare")
def sensor_weight_calibration_tare():
    with data_lock:
        raw_live_weight_kg = _latest_live_raw_weight_kg_locked()
        if raw_live_weight_kg is None:
            return jsonify({
                "ok": False,
                "error": "No live weight reading available. Leave the scale empty and wait for readings.",
            }), 400

        new_offset_kg = round(_get_weight_calibration_offset_kg() - raw_live_weight_kg, 4)
        _set_weight_calibration_offset_locked(new_offset_kg, source="tare")
        _reset_weight_measurement_locked("Step on the scale", clear_final=True)

        return jsonify({
            "ok": True,
            "offsetKg": round(_get_weight_calibration_offset_kg(), 4),
            "capturedRawWeightKg": round(raw_live_weight_kg, 4),
            "message": "Scale tared. Keep the platform empty for a fresh zero reading.",
        })


@app.post("/sensor/calibration/weight/reference")
def sensor_weight_calibration_reference():
    payload = request.get_json(silent=True) or {}
    known_weight_value = payload.get("knownWeightKg")

    try:
        known_weight_kg = float(known_weight_value)
    except Exception:
        return jsonify({"ok": False, "error": "knownWeightKg must be a number."}), 400

    if not math.isfinite(known_weight_kg) or known_weight_kg <= 0:
        return jsonify({"ok": False, "error": "knownWeightKg must be greater than 0."}), 400

    with data_lock:
        raw_live_weight_kg = _latest_live_raw_weight_kg_locked()
        if raw_live_weight_kg is None:
            return jsonify({
                "ok": False,
                "error": "No live weight reading available. Place the known test weight on the scale and wait for readings.",
            }), 400

        new_offset_kg = round(known_weight_kg - raw_live_weight_kg, 4)
        _set_weight_calibration_offset_locked(new_offset_kg, source="reference")
        _reset_weight_measurement_locked("Step on the scale", clear_final=True)

        return jsonify({
            "ok": True,
            "knownWeightKg": round(known_weight_kg, 4),
            "capturedRawWeightKg": round(raw_live_weight_kg, 4),
            "offsetKg": round(_get_weight_calibration_offset_kg(), 4),
            "message": "Reference weight applied. Remove the test weight and verify the zero reading.",
        })


@app.post("/sensor/calibration/weight/offset")
def sensor_weight_calibration_offset():
    payload = request.get_json(silent=True) or {}
    offset_value = payload.get("offsetKg")

    try:
        offset_kg = float(offset_value)
    except Exception:
        return jsonify({"ok": False, "error": "offsetKg must be a number."}), 400

    if not math.isfinite(offset_kg):
        return jsonify({"ok": False, "error": "offsetKg must be a finite number."}), 400

    with data_lock:
        _set_weight_calibration_offset_locked(offset_kg, source="manual")
        _reset_weight_measurement_locked("Step on the scale", clear_final=True)
        return jsonify({
            "ok": True,
            "offsetKg": round(_get_weight_calibration_offset_kg(), 4),
            "message": "Weight calibration offset updated.",
        })


@app.get("/sensor/calibration/height")
def sensor_height_calibration_status():
    with data_lock:
        raw_distance_cm = _latest_live_distance_cm_locked()
        estimated_height_cm = None if raw_distance_cm is None else round(_apply_height_calibration(raw_distance_cm), 3)
        return jsonify({
            "ok": True,
            "sensorToPlatformCm": round(_get_height_sensor_to_platform_cm(), 4),
            "offsetCm": round(_get_height_calibration_offset_cm(), 4),
            "updatedAt": height_calibration_state.get("updatedAt"),
            "source": height_calibration_state.get("source"),
            "file": HEIGHT_CALIBRATION_FILE,
            "rawDistanceCm": raw_distance_cm,
            "liveHeightCm": sensor_data.get("liveHeightCm"),
            "stableHeightCm": sensor_data.get("heightCm"),
            "estimatedHeightCm": estimated_height_cm,
            "serialConnected": bool(serial_state.get("connected")),
            "serialReceivingData": _is_recent(serial_state.get("lastLineAt")),
            "liveFresh": _is_recent(serial_state.get("lastLiveHeightAt"), max(2500, SYSTEM_COMPONENT_FRESH_MS)),
            "statusMessage": sensor_data.get("statusMessage") or "Stand under sensor",
            "phase": sensor_data.get("heightPhase") or "idle",
        })


@app.post("/sensor/calibration/height/reference")
def sensor_height_calibration_reference():
    payload = request.get_json(silent=True) or {}
    known_height_value = payload.get("knownHeightCm")

    try:
        known_height_cm = float(known_height_value)
    except Exception:
        return jsonify({"ok": False, "error": "knownHeightCm must be a number."}), 400

    if not math.isfinite(known_height_cm) or known_height_cm <= 0:
        return jsonify({"ok": False, "error": "knownHeightCm must be greater than 0."}), 400

    with data_lock:
        raw_distance_cm = _latest_live_distance_cm_locked()
        if raw_distance_cm is None:
            return jsonify({
                "ok": False,
                "error": "No live ToF reading available. Stand under the sensor and wait for live distance data.",
            }), 400

        new_offset_cm = round(known_height_cm - (_get_height_sensor_to_platform_cm() - raw_distance_cm), 4)
        _set_height_calibration_locked(offset_cm=new_offset_cm, source="reference")
        _reset_height_measurement_locked("Stand under sensor")

        return jsonify({
            "ok": True,
            "knownHeightCm": round(known_height_cm, 4),
            "capturedRawDistanceCm": round(raw_distance_cm, 4),
            "offsetCm": round(_get_height_calibration_offset_cm(), 4),
            "message": "ToF reference height applied. Step away, then stand back under the sensor to verify.",
        })


@app.post("/sensor/calibration/height/offset")
def sensor_height_calibration_offset():
    payload = request.get_json(silent=True) or {}
    offset_value = payload.get("offsetCm")

    try:
        offset_cm = float(offset_value)
    except Exception:
        return jsonify({"ok": False, "error": "offsetCm must be a number."}), 400

    if not math.isfinite(offset_cm):
        return jsonify({"ok": False, "error": "offsetCm must be a finite number."}), 400

    with data_lock:
        _set_height_calibration_locked(offset_cm=offset_cm, source="manual")
        _reset_height_measurement_locked("Stand under sensor")
        return jsonify({
            "ok": True,
            "offsetCm": round(_get_height_calibration_offset_cm(), 4),
            "message": "ToF calibration offset updated.",
        })


@app.post("/sensor/calibration/height/platform")
def sensor_height_calibration_platform():
    payload = request.get_json(silent=True) or {}
    platform_value = payload.get("sensorToPlatformCm")

    try:
        sensor_to_platform_cm = float(platform_value)
    except Exception:
        return jsonify({"ok": False, "error": "sensorToPlatformCm must be a number."}), 400

    if not math.isfinite(sensor_to_platform_cm) or sensor_to_platform_cm <= 0:
        return jsonify({"ok": False, "error": "sensorToPlatformCm must be greater than 0."}), 400

    with data_lock:
        _set_height_calibration_locked(sensor_to_platform_cm=sensor_to_platform_cm, source="manual")
        _reset_height_measurement_locked("Stand under sensor")
        return jsonify({
            "ok": True,
            "sensorToPlatformCm": round(_get_height_sensor_to_platform_cm(), 4),
            "offsetCm": round(_get_height_calibration_offset_cm(), 4),
            "message": "Sensor-to-platform distance updated.",
        })


@app.get("/sensor/height")
def sensor_height():
    with data_lock:
        return jsonify(build_sensor_response(
            "heightCm",
            sensor_data["heightCm"],
            serial_state.get("lastHeightAt"),
            live_field_name="liveHeightCm",
            live_value=sensor_data.get("liveHeightCm"),
            live_updated_at_ms=serial_state.get("lastLiveHeightAt"),
            final_field_name="finalHeightCm",
            stable=sensor_data.get("heightStable", False),
            phase=sensor_data.get("heightPhase", "idle"),
            status_message=(sensor_data.get("statusMessage") if sensor_data.get("heightPhase") != "idle" else "Stand under sensor"),
        ))


@app.post("/sensor/reset")
def sensor_reset():
    payload = request.get_json(silent=True) or {}
    kind = str(payload.get("kind") or "all").strip().lower()

    with data_lock:
        if kind in {"weight", "all"}:
            _reset_weight_measurement_locked("Step on the scale", clear_final=True)

        if kind in {"height", "all"}:
            _reset_height_measurement_locked("Stand under sensor")
            serial_state["lastHeightAt"] = None
            serial_state["lastLiveHeightAt"] = None

    return jsonify({
        "ok": True,
        "kind": kind,
    })


@app.get("/sensor/bmi")
def sensor_bmi():
    with data_lock:
        return jsonify({
            "bmi": sensor_data["bmi"],
            "category": sensor_data["category"],
            "weightKg": sensor_data["weightKg"],
            "heightCm": sensor_data["heightCm"],
        })


@app.get("/sensor/live")
def sensor_live():
    with data_lock:
        return jsonify(_build_live_measurement_snapshot_locked())


@app.get("/sensor/all")
def sensor_all():
    with data_lock:
        return jsonify(_build_system_measurement_snapshot_locked())


@app.get("/local/users/<user_id>")
def local_user_get(user_id):
    uid = str(user_id).strip()
    if not uid:
        return jsonify({"ok": False, "error": "user_id is required"}), 400

    with local_data_lock:
        payload = _load_local_data_payload()
        record = (payload.get("users") or {}).get(uid)
        if not isinstance(record, dict):
            return jsonify({"ok": True, "user": None, "measurements": []})

        profile = record.get("profile") if isinstance(record.get("profile"), dict) else {}
        measurements = [
            item for item in (
                _normalize_local_measurement_entry(entry)
                for entry in (record.get("measurements") or [])
            )
            if item is not None
        ]
        measurements.sort(key=lambda item: int(item.get("capturedAt") or 0))
        user_payload = {
            "id": uid,
            "name": profile.get("name") or profile.get("fullName") or "",
            "fullName": profile.get("name") or profile.get("fullName") or "",
            "age": profile.get("age"),
            "sex": profile.get("sex") or "",
            "password": profile.get("password") or "12345",
            "mustResetPassword": bool(profile.get("mustResetPassword", True)),
        }
        return jsonify({"ok": True, "user": user_payload, "measurements": measurements})


@app.put("/local/users/<user_id>")
def local_user_put(user_id):
    uid = str(user_id).strip()
    if not uid:
        return jsonify({"ok": False, "error": "user_id is required"}), 400

    payload_in = request.get_json(silent=True) or {}
    with local_data_lock:
        payload = _load_local_data_payload()
        record = _ensure_local_user_record(payload, uid)
        record["profile"] = {
            "id": uid,
            "name": payload_in.get("name") or payload_in.get("fullName") or "",
            "fullName": payload_in.get("name") or payload_in.get("fullName") or "",
            "age": payload_in.get("age"),
            "sex": payload_in.get("sex") or "",
            "password": payload_in.get("password") or "12345",
            "mustResetPassword": bool(payload_in.get("mustResetPassword", True)),
        }
        _save_local_data_payload(payload)
        return jsonify({"ok": True, "user": record["profile"]})


@app.delete("/local/users/<user_id>")
def local_user_delete(user_id):
    uid = str(user_id).strip()
    if not uid:
        return jsonify({"ok": False, "error": "user_id is required"}), 400

    with local_data_lock:
        payload = _load_local_data_payload()
        existed = uid in (payload.get("users") or {})
        if existed:
            del payload["users"][uid]
            _save_local_data_payload(payload)
        return jsonify({"ok": True, "deleted": existed, "userId": uid})


@app.post("/local/users/<user_id>/measurements")
def local_measurement_post(user_id):
    uid = str(user_id).strip()
    if not uid:
        return jsonify({"ok": False, "error": "user_id is required"}), 400

    payload_in = request.get_json(silent=True) or {}
    entry = _normalize_local_measurement_entry(payload_in)
    if entry is None:
        return jsonify({"ok": False, "error": "Invalid measurement payload"}), 400

    with local_data_lock:
        payload = _load_local_data_payload()
        record = _ensure_local_user_record(payload, uid)
        measurements = [
            item for item in (
                _normalize_local_measurement_entry(existing)
                for existing in record.get("measurements", [])
            )
            if item is not None
        ]
        if entry["id"]:
            measurements = [item for item in measurements if item.get("id") != entry["id"]]
        measurements.append(entry)
        measurements.sort(key=lambda item: int(item.get("capturedAt") or 0))
        record["measurements"] = measurements
        _save_local_data_payload(payload)
        return jsonify({"ok": True, "measurement": entry})


@app.get("/local/users/<user_id>/measurements")
def local_measurements_get(user_id):
    uid = str(user_id).strip()
    if not uid:
        return jsonify({"ok": False, "error": "user_id is required"}), 400

    try:
        limit = max(1, int(request.args.get("limit", "8")))
    except Exception:
        limit = 8

    with local_data_lock:
        payload = _load_local_data_payload()
        record = (payload.get("users") or {}).get(uid) or {}
        measurements = [
            item for item in (
                _normalize_local_measurement_entry(existing)
                for existing in (record.get("measurements") or [])
            )
            if item is not None
        ]
        measurements.sort(key=lambda item: int(item.get("capturedAt") or 0))
        return jsonify({"ok": True, "measurements": measurements[-limit:]})


@app.get("/local/users/<user_id>/measurements/latest")
def local_measurements_latest(user_id):
    uid = str(user_id).strip()
    if not uid:
        return jsonify({"ok": False, "error": "user_id is required"}), 400

    with local_data_lock:
        payload = _load_local_data_payload()
        record = (payload.get("users") or {}).get(uid) or {}
        measurements = [
            item for item in (
                _normalize_local_measurement_entry(existing)
                for existing in (record.get("measurements") or [])
            )
            if item is not None
        ]
        measurements.sort(key=lambda item: int(item.get("capturedAt") or 0))
        latest = measurements[-1] if measurements else None
        return jsonify({"ok": True, "measurement": latest})


@app.get("/debug/serial")
def debug_serial():
    with data_lock:
        history = list(serial_line_history)
        serial_snapshot = dict(serial_state)
        measurements = {
            "liveWeightKg": sensor_data.get("liveWeightKg"),
            "weightKg": sensor_data.get("weightKg"),
            "weightPhase": sensor_data.get("weightPhase"),
            "liveHeightCm": sensor_data.get("liveHeightCm"),
            "heightCm": sensor_data.get("heightCm"),
            "heightPhase": sensor_data.get("heightPhase"),
        }

    return jsonify({
        "ok": True,
        "serial": serial_snapshot,
        "measurements": measurements,
        "recentLines": history[-40:],
    })


@app.get("/system/status")
def system_status():
    return jsonify(build_system_status())


@app.post("/system/status/override")
def system_status_override():
    payload = request.get_json(silent=True) or {}
    components = payload.get("components")
    meta = payload.get("meta")

    with data_lock:
        if isinstance(components, dict):
            for key, value in components.items():
                if isinstance(value, dict):
                    current = system_status_overrides["components"].get(key, {})
                    system_status_overrides["components"][key] = _merge_dict(current, value)
        if isinstance(meta, dict):
            system_status_overrides["meta"] = _merge_dict(system_status_overrides.get("meta") or {}, meta)
        system_status_overrides["updatedAt"] = now_ms()

    sync_system_status_to_firebase(force_history=True)

    return jsonify({
        "ok": True,
        "updatedAt": system_status_overrides["updatedAt"],
        "componentCount": len(system_status_overrides["components"]),
    })


@app.post("/face/register")
def face_register():
    selected_engine = _resolve_face_engine()
    if selected_engine is None:
        return jsonify({
            "ok": False,
            "error": "Facial recognition engine is not ready (install InsightFace/ONNX Runtime or face_recognition).",
        }), 500

    payload = request.get_json(silent=True) or {}
    user_id = str(payload.get("userId", "")).strip()
    name = str(payload.get("name", "")).strip()
    image_data = payload.get("imageData")
    image_data_list = payload.get("imageDataList")

    if not user_id:
        return jsonify({"ok": False, "error": "userId is required"}), 400
    if image_data is None and not isinstance(image_data_list, list):
        return jsonify({"ok": False, "error": "imageData or imageDataList is required"}), 400

    try:
        probes = []
        if isinstance(image_data_list, list):
            for raw_img in image_data_list:
                try:
                    _, probe_vector = extract_face_signature(raw_img, num_jitters=FACE_ENROLL_NUM_JITTERS)
                    probes.append(probe_vector)
                except ValueError:
                    continue
            if len(probes) < FACE_REGISTER_MIN_SAMPLES:
                return jsonify({
                    "ok": False,
                    "error": f"Need at least {FACE_REGISTER_MIN_SAMPLES} valid face samples.",
                }), 400
        else:
            _, probe_vector = extract_face_signature(image_data, num_jitters=FACE_ENROLL_NUM_JITTERS)
            probes.append(probe_vector)

        probe = _validate_registration_probes(probes, selected_engine)

        with face_lock:
            if user_id in face_db:
                return jsonify({
                    "ok": False,
                    "error": "User Already Enrolled",
                    "userId": user_id,
                }), 409

            best_user_id, best_name, best_distance, second_best_distance = find_best_face_match(probe, selected_engine)
            duplicate_margin = second_best_distance - best_distance if second_best_distance != float("inf") else None
            duplicate_tolerance = _effective_duplicate_tolerance(second_best_distance)
            if (
                _should_apply_duplicate_check(second_best_distance)
                and
                best_user_id is not None
                and best_distance <= duplicate_tolerance
            ):
                return jsonify({
                    "ok": False,
                    "error": "Face is too similar to an existing enrollment.",
                    "userId": best_user_id,
                    "name": best_name,
                    "distance": round(best_distance, 4),
                    "margin": round(duplicate_margin, 4) if duplicate_margin is not None else None,
                    "minMargin": FACE_MIN_MARGIN,
                    "tolerance": duplicate_tolerance,
                }), 409

            stamp = formatted_timestamp_parts()
            vectors_payload = [np.array(p, dtype=np.float64).tolist() for p in probes]
            record = {
                "userId": user_id,
                "name": name,
                "engine": selected_engine,
                "sampleCount": len(probes),
                "createdAt": stamp["datetime"],
                "updatedAt": stamp["datetime"],
                "createdAtEpochMs": stamp["epochMs"],
                "updatedAtEpochMs": stamp["epochMs"],
            }
            if selected_engine == "insightface":
                record["embedding"] = np.array(probe, dtype=np.float64).tolist()
                record["embeddings"] = vectors_payload
            else:
                record["encoding"] = np.array(probe, dtype=np.float64).tolist()
                record["encodings"] = vectors_payload
            face_db[user_id] = record
            save_face_db()

        return jsonify({"ok": True, "userId": user_id, "name": name, "sampleCount": len(probes), "engine": selected_engine})
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": f"Face registration failed: {e}"}), 500


@app.post("/face/identify")
def face_identify():
    selected_engine = _resolve_face_engine()
    if selected_engine is None:
        return jsonify({
            "ok": False,
            "error": "Facial recognition engine is not ready (install InsightFace/ONNX Runtime or face_recognition).",
        }), 500

    payload = request.get_json(silent=True) or {}
    image_data = payload.get("imageData")
    expected_user_id = str(payload.get("expectedUserId", "")).strip() or None
    session_tag = str(payload.get("sessionTag", "")).strip() or None
    if image_data is None:
        return jsonify({"ok": False, "error": "imageData is required"}), 400

    try:
        _, probe = extract_face_signature(image_data, num_jitters=FACE_IDENTIFY_NUM_JITTERS)

        with face_lock:
            if not face_db:
                return jsonify({"ok": True, "matched": False, "reason": "face_db_empty"})
            best_user_id, best_name, best_distance, second_best_distance = find_best_face_match(probe, selected_engine)

        if best_user_id is None:
            return jsonify({"ok": True, "matched": False, "reason": "no_valid_encodings"})

        margin = second_best_distance - best_distance if second_best_distance != float("inf") else None
        identify_tolerance = _effective_identify_tolerance(second_best_distance)
        ambiguous = margin is not None and margin < FACE_MIN_MARGIN
        matched = best_distance <= identify_tolerance and not ambiguous
        stamp = formatted_timestamp_parts()
        outcome = "unknown"
        if expected_user_id is not None:
            if matched and best_user_id == expected_user_id:
                outcome = "tp"
            elif matched and best_user_id != expected_user_id:
                outcome = "fp"
            elif (not matched) and best_user_id == expected_user_id:
                outcome = "fn"
            else:
                outcome = "tn"

        append_calibration_log({
            "tsEpochMs": stamp["epochMs"],
            "ts": stamp["datetime"],
            "sessionTag": session_tag,
            "expectedUserId": expected_user_id,
            "predictedUserId": best_user_id if matched else None,
            "bestCandidateUserId": best_user_id,
            "matched": bool(matched),
            "outcome": outcome,
            "distance": round(float(best_distance), 6),
            "margin": round(float(margin), 6) if margin is not None else None,
            "tolerance": identify_tolerance,
            "minMargin": FACE_MIN_MARGIN,
            "reason": "ambiguous_match" if ambiguous else None,
        })

        return jsonify({
            "ok": True,
            "matched": matched,
            "reason": "ambiguous_match" if (not matched and ambiguous) else None,
            "userId": best_user_id if matched else None,
            "name": best_name if matched else "",
            "distance": round(best_distance, 4),
            "margin": round(margin, 4) if margin is not None else None,
            "minMargin": FACE_MIN_MARGIN,
            "tolerance": identify_tolerance,
            "engine": selected_engine,
        })
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": f"Face identification failed: {e}"}), 500


@app.get("/face/calibration/summary")
def face_calibration_summary():
    if not FACE_CALIBRATION_ENABLED:
        return jsonify({"ok": False, "error": "Calibration logging is disabled."}), 400

    rows = []
    try:
        if not os.path.exists(FACE_CALIBRATION_LOG_FILE):
            return jsonify({
                "ok": True,
                "count": 0,
                "message": "No calibration log file yet.",
                "suggested": {
                    "FACE_TOLERANCE": FACE_TOLERANCE,
                    "FACE_MIN_MARGIN": FACE_MIN_MARGIN,
                },
            })
        with open(FACE_CALIBRATION_LOG_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rows.append(json.loads(line))
                except Exception:
                    continue
    except Exception as e:
        return jsonify({"ok": False, "error": f"Failed reading calibration log: {e}"}), 500

    tp_d = [float(r["distance"]) for r in rows if r.get("outcome") == "tp" and isinstance(r.get("distance"), (float, int))]
    fp_d = [float(r["distance"]) for r in rows if r.get("outcome") == "fp" and isinstance(r.get("distance"), (float, int))]
    tp_m = [float(r["margin"]) for r in rows if r.get("outcome") == "tp" and isinstance(r.get("margin"), (float, int))]
    fp_m = [float(r["margin"]) for r in rows if r.get("outcome") == "fp" and isinstance(r.get("margin"), (float, int))]

    tol_guess = FACE_TOLERANCE
    if tp_d and fp_d:
        tol_guess = round((max(tp_d) + min(fp_d)) / 2.0, 4)
    elif tp_d:
        tol_guess = round(min(max(tp_d) + 0.01, FACE_TOLERANCE + 0.05), 4)

    margin_guess = FACE_MIN_MARGIN
    if tp_m and fp_m:
        margin_guess = round((min(tp_m) + max(fp_m)) / 2.0, 4)
    elif tp_m:
        margin_guess = round(max(0.03, min(tp_m) * 0.7), 4)

    return jsonify({
        "ok": True,
        "count": len(rows),
        "counts": {
            "tp": sum(1 for r in rows if r.get("outcome") == "tp"),
            "fp": sum(1 for r in rows if r.get("outcome") == "fp"),
            "fn": sum(1 for r in rows if r.get("outcome") == "fn"),
            "tn": sum(1 for r in rows if r.get("outcome") == "tn"),
            "unknown": sum(1 for r in rows if r.get("outcome") == "unknown"),
        },
        "distance": {
            "tp_p50": _calc_percentile(tp_d, 50),
            "tp_p95": _calc_percentile(tp_d, 95),
            "fp_p50": _calc_percentile(fp_d, 50),
            "fp_p05": _calc_percentile(fp_d, 5),
        },
        "margin": {
            "tp_p50": _calc_percentile(tp_m, 50),
            "tp_p05": _calc_percentile(tp_m, 5),
            "fp_p50": _calc_percentile(fp_m, 50),
            "fp_p95": _calc_percentile(fp_m, 95),
        },
        "suggested": {
            "FACE_TOLERANCE": tol_guess,
            "FACE_MIN_MARGIN": margin_guess,
        },
        "current": {
            "FACE_TOLERANCE": FACE_TOLERANCE,
            "FACE_MIN_MARGIN": FACE_MIN_MARGIN,
        },
    })


@app.delete("/face/calibration/log")
def face_calibration_log_clear():
    if not FACE_CALIBRATION_ENABLED:
        return jsonify({"ok": False, "error": "Calibration logging is disabled."}), 400
    try:
        with calibration_lock:
            if os.path.exists(FACE_CALIBRATION_LOG_FILE):
                os.remove(FACE_CALIBRATION_LOG_FILE)
        return jsonify({"ok": True, "cleared": True, "file": FACE_CALIBRATION_LOG_FILE})
    except Exception as e:
        return jsonify({"ok": False, "error": f"Failed clearing calibration log: {e}"}), 500


@app.post("/vision/restrictions")
def vision_restrictions():
    payload = request.get_json(silent=True) or {}
    image_data = payload.get("imageData")
    if image_data is None:
        return jsonify({"ok": False, "error": "imageData is required"}), 400

    if not _restriction_deps_ready():
        return jsonify({
            "ok": False,
            "error": "Restriction detector dependencies missing (install ultralytics pillow numpy).",
        }), 500

    with restriction_lock:
        if restriction_model is None:
            msg = load_restriction_model()
            if msg is not None:
                return jsonify({"ok": False, "error": msg}), 500

    try:
        rgb = decode_image_data_url(image_data)
        with restriction_lock:
            blocked, matches = detect_restrictions(rgb)

        blocked_keys = [key for key in RESTRICTION_KEYS if blocked[key]]
        blocked_labels = [RESTRICTION_LABELS[key] for key in blocked_keys]
        return jsonify({
            "ok": True,
            "blocked": len(blocked_keys) > 0,
            "blockedKeys": blocked_keys,
            "blockedLabels": blocked_labels,
            "restrictions": blocked,
            "matches": matches,
        })
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": f"Restriction check failed: {e}"}), 500


@app.post("/face/liveness")
def face_liveness():
    payload = request.get_json(silent=True) or {}
    image_data = payload.get("imageData")
    if image_data is None:
        return jsonify({"ok": False, "error": "imageData is required"}), 400

    if not _liveness_deps_ready():
        return jsonify({
            "ok": True,
            "configured": False,
            "live": None,
            "score": None,
            "threshold": FACE_LIVENESS_THRESHOLD,
            "reason": "liveness_not_configured",
        })

    with liveness_lock:
        if liveness_session is None:
            msg = load_liveness_model()
            if msg is not None:
                return jsonify({
                    "ok": True,
                    "configured": False,
                    "live": None,
                    "score": None,
                    "threshold": FACE_LIVENESS_THRESHOLD,
                    "reason": msg,
                })

    try:
        rgb = decode_image_data_url(image_data)
        locations = _face_locations_with_fallback(rgb)
        if len(locations) != 1:
            return jsonify({"ok": False, "error": f"Expected 1 face, found {len(locations)}"}), 400
        top, right, bottom, left = locations[0]
        width = max(0, right - left)
        height = max(0, bottom - top)
        if width < FACE_MIN_FACE_SIZE_PX or height < FACE_MIN_FACE_SIZE_PX:
            return jsonify({"ok": False, "error": f"Face too small. Move closer to camera (min {FACE_MIN_FACE_SIZE_PX}px)."}), 400

        with liveness_lock:
            live, score = run_liveness_inference(rgb)

        return jsonify({
            "ok": True,
            "configured": True,
            "live": bool(live),
            "score": round(float(score), 4),
            "threshold": FACE_LIVENESS_THRESHOLD,
        })
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": f"Liveness check failed: {e}"}), 500


@app.post("/face/pose-metrics")
def face_pose_metrics():
    if not _face_recognition_deps_ready():
        return jsonify({
            "ok": False,
            "error": "Pose metrics require face_recognition landmarks.",
        }), 500

    payload = request.get_json(silent=True) or {}
    image_data = payload.get("imageData")
    if image_data is None:
        return jsonify({"ok": False, "error": "imageData is required"}), 400

    try:
        rgb = decode_image_data_url(image_data)
        metrics = compute_face_pose_metrics(rgb)
        return jsonify({
            "ok": True,
            "yaw": round(float(metrics["yaw"]), 5),
            "pitch": round(float(metrics["pitch"]), 5),
            "ear": round(float(metrics["ear"]), 5) if metrics["ear"] is not None else None,
            "blinkDetected": bool(metrics["blinkDetected"]),
            "faceBox": metrics["faceBox"],
            "blinkEarThreshold": FACE_BLINK_EAR_THRESHOLD,
        })
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": f"Pose metrics failed: {e}"}), 500


@app.get("/face/users")
def face_users():
    with face_lock:
        users = [{"userId": uid, "name": rec.get("name", "")} for uid, rec in face_db.items()]
    return jsonify({"count": len(users), "users": users})


@app.delete("/face/user/<user_id>")
def face_delete_user(user_id):
    uid = str(user_id).strip()
    if not uid:
        return jsonify({"ok": False, "error": "user_id is required"}), 400

    with face_lock:
        existed = uid in face_db
        if existed:
            del face_db[uid]
            save_face_db()

    return jsonify({"ok": True, "deleted": existed, "userId": uid})


@app.delete("/face/users")
def face_delete_all_users():
    with face_lock:
        deleted_count = len(face_db)
        face_db.clear()
        save_face_db()

    return jsonify({
        "ok": True,
        "deletedCount": deleted_count,
        "remaining": 0,
    })


def start_reader_once():
    global startup_complete
    with startup_lock:
        if startup_complete:
            return
        if not app.debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
            _load_weight_calibration_state()
            _load_height_calibration_state()
            load_face_db()
            threading.Thread(target=read_serial_data, daemon=True).start()
            threading.Thread(target=firebase_sync_loop, daemon=True).start()
            startup_complete = True


start_reader_once()


if __name__ == "__main__":
    app_host = os.getenv("APP_HOST", "0.0.0.0")
    app_port = int(os.getenv("APP_PORT", "5000"))
    app_debug = str(os.getenv("APP_DEBUG", "false")).strip().lower() in {"1", "true", "yes", "on"}
    app.run(host=app_host, port=app_port, debug=app_debug)
