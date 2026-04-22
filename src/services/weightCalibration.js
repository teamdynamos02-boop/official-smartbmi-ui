const SENSOR_API_BASE = import.meta.env.VITE_SENSOR_API_BASE ?? "http://127.0.0.1:5000";
const SENSOR_TIMEOUT_MS = Number(import.meta.env.VITE_SENSOR_TIMEOUT_MS ?? 6000);

function joinUrl(base, path) {
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function withTimeout(signal) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.max(500, SENSOR_TIMEOUT_MS));
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener("abort", onAbort, { once: true });

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener("abort", onAbort);
    },
  };
}

async function requestCalibration(path, options = {}, signal) {
  const guard = withTimeout(signal);
  try {
    const response = await fetch(joinUrl(SENSOR_API_BASE, path), {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      signal: guard.signal,
      ...options,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok === false) {
      throw new Error(body?.error || `Calibration request failed with HTTP ${response.status}`);
    }
    return body;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Calibration request timed out");
    }
    throw error;
  } finally {
    guard.cleanup();
  }
}

export function getWeightCalibrationStatus(signal) {
  return requestCalibration("/sensor/calibration/weight", { method: "GET" }, signal);
}

export function tareWeightCalibration(signal) {
  return requestCalibration("/sensor/calibration/weight/tare", { method: "POST", body: "{}" }, signal);
}

export function applyWeightReferenceCalibration(knownWeightKg, signal) {
  return requestCalibration("/sensor/calibration/weight/reference", {
    method: "POST",
    body: JSON.stringify({ knownWeightKg }),
  }, signal);
}

export function setWeightCalibrationOffset(offsetKg, signal) {
  return requestCalibration("/sensor/calibration/weight/offset", {
    method: "POST",
    body: JSON.stringify({ offsetKg }),
  }, signal);
}

export function getHeightCalibrationStatus(signal) {
  return requestCalibration("/sensor/calibration/height", { method: "GET" }, signal);
}

export function applyHeightReferenceCalibration(knownHeightCm, signal) {
  return requestCalibration("/sensor/calibration/height/reference", {
    method: "POST",
    body: JSON.stringify({ knownHeightCm }),
  }, signal);
}

export function setHeightCalibrationOffset(offsetCm, signal) {
  return requestCalibration("/sensor/calibration/height/offset", {
    method: "POST",
    body: JSON.stringify({ offsetCm }),
  }, signal);
}

export function setHeightSensorToPlatform(sensorToPlatformCm, signal) {
  return requestCalibration("/sensor/calibration/height/platform", {
    method: "POST",
    body: JSON.stringify({ sensorToPlatformCm }),
  }, signal);
}
