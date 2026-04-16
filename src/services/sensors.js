const SENSOR_API_BASE = import.meta.env.VITE_SENSOR_API_BASE ?? "http://127.0.0.1:5000";
const WEIGHT_ENDPOINT = import.meta.env.VITE_SENSOR_WEIGHT_ENDPOINT ?? "/sensor/weight";
const HEIGHT_ENDPOINT = import.meta.env.VITE_SENSOR_HEIGHT_ENDPOINT ?? "/sensor/height";
const RESET_ENDPOINT = import.meta.env.VITE_SENSOR_RESET_ENDPOINT ?? "/sensor/reset";
const SENSOR_TIMEOUT_MS = Number(import.meta.env.VITE_SENSOR_TIMEOUT_MS ?? 6000);
const SENSOR_SAMPLE_INTERVAL_MS = Number(import.meta.env.VITE_SENSOR_SAMPLE_INTERVAL_MS ?? 120);
const SENSOR_SINGLE_READ_TIMEOUT_MS = Number(import.meta.env.VITE_SENSOR_SINGLE_READ_TIMEOUT_MS ?? 2500);
const SENSOR_MAX_VALUE_AGE_MS = Number(import.meta.env.VITE_SENSOR_MAX_VALUE_AGE_MS ?? 2500);
const SENSOR_REQUIRED_STABLE_POLLS = Number(import.meta.env.VITE_SENSOR_REQUIRED_STABLE_POLLS ?? 1);
const SENSOR_STABLE_CONFIRM_MS = Number(import.meta.env.VITE_SENSOR_STABLE_CONFIRM_MS ?? 3000);
const SENSOR_NO_LIVE_TIMEOUT_MS = Number(import.meta.env.VITE_SENSOR_NO_LIVE_TIMEOUT_MS ?? 5000);
const SENSOR_ACTIVE_MEASURE_MAX_MS = Number(import.meta.env.VITE_SENSOR_ACTIVE_MEASURE_MAX_MS ?? 15000);
const SENSOR_NO_SERIAL_TIMEOUT_MS = Number(import.meta.env.VITE_SENSOR_NO_SERIAL_TIMEOUT_MS ?? 2200);
const SENSOR_WEIGHT_STABLE_TOLERANCE_KG = Number(import.meta.env.VITE_SENSOR_WEIGHT_STABLE_TOLERANCE_KG ?? 0.2);
const SENSOR_HEIGHT_STABLE_TOLERANCE_CM = Number(import.meta.env.VITE_SENSOR_HEIGHT_STABLE_TOLERANCE_CM ?? 1);
const SENSOR_WEIGHT_RESET_TOLERANCE_KG = Number(import.meta.env.VITE_SENSOR_WEIGHT_RESET_TOLERANCE_KG ?? 0.8);
const SENSOR_HEIGHT_RESET_TOLERANCE_CM = Number(import.meta.env.VITE_SENSOR_HEIGHT_RESET_TOLERANCE_CM ?? 3);
const SENSOR_WEIGHT_MIN_VALID_KG = Number(import.meta.env.VITE_SENSOR_WEIGHT_MIN_VALID_KG ?? 5);

export class SensorApiError extends Error {
  constructor(message) {
    super(message);
    this.name = "SensorApiError";
  }
}

function joinUrl(base, path) {
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function getNumberFromPayload(payload, keys) {
  if (typeof payload === "number" && Number.isFinite(payload)) return payload;
  if (!payload || typeof payload !== "object") return null;

  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }

  if (payload.data && typeof payload.data === "object") {
    for (const key of keys) {
      const value = payload.data[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
        return Number(value);
      }
    }
  }

  return null;
}

function getTimestampMs(payload, keys = ["updatedAtMs", "timestampMs", "tsMs"]) {
  if (!payload || typeof payload !== "object") return null;

  const candidates = keys.map((key) => payload[key]);
  if (payload.data && typeof payload.data === "object") {
    candidates.push(...keys.map((key) => payload.data[key]));
  }

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === "string" && candidate.trim() !== "" && Number.isFinite(Number(candidate))) {
      return Number(candidate);
    }
  }

  return null;
}

async function requestSensorReading(endpoint, keys, liveKeys, signal) {
  const controller = new AbortController();
  const timeoutMs = Math.max(250, Math.min(SENSOR_TIMEOUT_MS, SENSOR_SINGLE_READ_TIMEOUT_MS));
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener("abort", onAbort, { once: true });

  try {
    const response = await fetch(joinUrl(SENSOR_API_BASE, endpoint), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new SensorApiError(`Sensor API failed with HTTP ${response.status}`);
    }

    const payload = await response.json();
    const stableValue = getNumberFromPayload(payload, keys);
    const liveValue = getNumberFromPayload(payload, liveKeys);
    const displayValue = liveValue ?? stableValue;
    const stableUpdatedAtMs = getTimestampMs(payload, ["updatedAtMs", "timestampMs", "tsMs"]);
    const liveUpdatedAtMs = getTimestampMs(payload, ["liveUpdatedAtMs", "liveTimestampMs", "liveTsMs"]);
    const stableFresh = payload?.fresh !== false
      && (stableUpdatedAtMs == null || (Date.now() - stableUpdatedAtMs) <= Math.max(250, SENSOR_MAX_VALUE_AGE_MS));
    const liveFresh = payload?.liveFresh !== false
      && (liveUpdatedAtMs == null || (Date.now() - liveUpdatedAtMs) <= Math.max(250, SENSOR_MAX_VALUE_AGE_MS));

    if (displayValue == null) {
      throw new SensorApiError("Sensor has no live data yet");
    }

    return {
      payload,
      stableValue,
      liveValue,
      displayValue,
      stable: payload?.stable === true && stableValue != null && stableFresh,
      fresh: stableFresh,
      liveFresh,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new SensorApiError("Sensor request timed out");
    }
    if (error instanceof SensorApiError) throw error;
    throw new SensorApiError("Could not connect to sensor API");
  } finally {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

export async function resetSensorSession(kind, signal) {
  const controller = new AbortController();
  const timeoutMs = Math.max(250, Math.min(SENSOR_TIMEOUT_MS, SENSOR_SINGLE_READ_TIMEOUT_MS));
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener("abort", onAbort, { once: true });

  try {
    const response = await fetch(joinUrl(SENSOR_API_BASE, RESET_ENDPOINT), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ kind }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new SensorApiError(`Sensor reset failed with HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      throw new SensorApiError("Sensor reset timed out");
    }
    if (error instanceof SensorApiError) throw error;
    throw new SensorApiError("Could not reset sensor session");
  } finally {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMedianValue(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

async function readStableSensorValue({
  endpoint,
  keys,
  liveKeys,
  normalize,
  signal,
  onSample,
  stableConfirmMs = SENSOR_STABLE_CONFIRM_MS,
  stableTolerance = 0,
  resetTolerance = stableTolerance,
  finalize,
  label,
  liveFallbackAfterMs = null,
  allowLiveFinalizeOnTimeout = true,
  isMeaningfulValue = (value) => Number.isFinite(value) && value >= 0,
}) {
  const startedAt = Date.now();
  let lastError = null;
  let stablePollCount = 0;
  let sawLiveData = false;
  let lastLiveValue = null;
  const liveSamples = [];
  let lastLiveDataAt = null;
  let backendSilentSince = null;
  let confirmationStartedAt = null;
  let lockedStableValue = null;
  let confirmedStableSamples = [];

  while ((Date.now() - startedAt) < SENSOR_ACTIVE_MEASURE_MAX_MS) {
    if (signal?.aborted) {
      throw new SensorApiError("Sensor request timed out");
    }

    try {
      const reading = await requestSensorReading(endpoint, keys, liveKeys, signal);
      const serialConnected = reading?.payload?.serialConnected !== false;
      const serialReceivingData = reading?.payload?.serialReceivingData !== false;

      if (!serialConnected) {
        throw new SensorApiError("Sensor controller is offline");
      }

      if (!serialReceivingData && reading.displayValue == null) {
        backendSilentSince ??= Date.now();
        if ((Date.now() - backendSilentSince) >= Math.max(800, SENSOR_NO_SERIAL_TIMEOUT_MS)) {
          throw new SensorApiError("Arduino is connected but not sending sensor data");
        }
      } else {
        backendSilentSince = null;
      }

      if (isMeaningfulValue(reading.displayValue)) {
        sawLiveData = true;
        lastLiveValue = normalize(reading.displayValue);
        liveSamples.push(lastLiveValue);
        if (liveSamples.length > 25) liveSamples.shift();
        lastLiveDataAt = Date.now();
      }

      if (reading.stable && isMeaningfulValue(reading.stableValue)) {
        stablePollCount += 1;
        if (stablePollCount >= Math.max(1, SENSOR_REQUIRED_STABLE_POLLS)) {
          const now = Date.now();
          const normalizedStableValue = normalize(reading.stableValue);
          const candidateChanged = lockedStableValue == null
            || Math.abs(normalizedStableValue - lockedStableValue) > Math.max(0, resetTolerance);
          const confirmationReset = candidateChanged && confirmationStartedAt != null;

          if (candidateChanged) {
            confirmationStartedAt = now;
            lockedStableValue = normalizedStableValue;
            confirmedStableSamples = [normalizedStableValue];
          } else {
            confirmedStableSamples.push(normalizedStableValue);
            lockedStableValue = typeof finalize === "function"
              ? finalize(confirmedStableSamples)
              : normalize(getMedianValue(confirmedStableSamples) ?? normalizedStableValue);
          }

          const confirmationElapsedMs = confirmationStartedAt == null ? 0 : (now - confirmationStartedAt);
          const confirmationRemainingMs = Math.max(0, stableConfirmMs - confirmationElapsedMs);

          if (typeof onSample === "function") {
            onSample(lockedStableValue, {
              ...reading,
              confirmationRemainingMs,
              displayValueForUi: lockedStableValue,
              uiPhase: confirmationRemainingMs > 0 ? "stabilizing" : "locked",
              confirmationReset,
              uiStatusMessage: confirmationRemainingMs > 0
                ? `Locking ${label}. Keep still for ${Math.ceil(confirmationRemainingMs / 1000)}s.`
                : `${label} locked.`,
            });
          }

          if (confirmationRemainingMs <= 0) {
            const finalizedValue = typeof finalize === "function"
              ? finalize(confirmedStableSamples)
              : getMedianValue(confirmedStableSamples);
            return normalize(finalizedValue ?? normalizedStableValue);
          }
          await sleep(SENSOR_SAMPLE_INTERVAL_MS);
          continue;
        }
      } else {
        stablePollCount = 0;
        confirmationStartedAt = null;
        lockedStableValue = null;
        confirmedStableSamples = [];
      }

      if (typeof onSample === "function" && reading.liveFresh !== false && isMeaningfulValue(reading.displayValue)) {
        onSample(normalize(reading.displayValue), {
          ...reading,
          confirmationRemainingMs: 0,
          displayValueForUi: normalize(reading.displayValue),
          uiPhase: reading?.payload?.phase ?? "measuring",
        });
      }

      if (
        liveFallbackAfterMs != null
        && sawLiveData
        && lastLiveValue != null
        && (Date.now() - startedAt) >= Math.max(250, liveFallbackAfterMs)
      ) {
        if (typeof finalize === "function" && liveSamples.length > 0) {
          return normalize(finalize(liveSamples));
        }
        return lastLiveValue;
      }
    } catch (error) {
      if (signal?.aborted) {
        throw new SensorApiError("Sensor request timed out");
      }
      lastError = error;
    }

    const now = Date.now();
    const noLiveForMs = lastLiveDataAt == null ? (now - startedAt) : (now - lastLiveDataAt);
    if (noLiveForMs >= SENSOR_NO_LIVE_TIMEOUT_MS) {
      if (sawLiveData) {
        throw new SensorApiError("Live sensor data stopped");
      }
      if (lastError instanceof SensorApiError) throw lastError;
      throw new SensorApiError("Sensor has no live data yet");
    }

    await sleep(SENSOR_SAMPLE_INTERVAL_MS);
  }

  if (sawLiveData) {
    if (!allowLiveFinalizeOnTimeout) {
      throw new SensorApiError("Measurement is still unstable");
    }
    if (lastLiveValue != null) {
      if (typeof finalize === "function" && liveSamples.length > 0) {
        return normalize(finalize(liveSamples));
      }
      return lastLiveValue;
    }
    throw new SensorApiError("Measurement is still unstable");
  }
  if (lastError instanceof SensorApiError) throw lastError;
  throw new SensorApiError("Sensor request timed out");
}

export async function readWeightKg(signal, options = {}) {
  return readStableSensorValue({
    endpoint: WEIGHT_ENDPOINT,
    keys: ["weightKg", "weight", "kg", "value"],
    liveKeys: ["liveWeightKg", "weightKg", "weight", "kg", "value"],
    normalize: (value) => Number(value.toFixed(1)),
    signal,
    onSample: options.onSample,
    stableConfirmMs: options.stableConfirmMs,
    stableTolerance: SENSOR_WEIGHT_STABLE_TOLERANCE_KG,
    resetTolerance: SENSOR_WEIGHT_RESET_TOLERANCE_KG,
    finalize: (values) => Number((getMedianValue(values) ?? values.at(-1) ?? 0).toFixed(1)),
    label: "weight",
    liveFallbackAfterMs: options.liveFallbackAfterMs ?? null,
    allowLiveFinalizeOnTimeout: false,
    isMeaningfulValue: (value) => Number.isFinite(value) && value >= SENSOR_WEIGHT_MIN_VALID_KG,
  });
}

export async function readHeightCm(signal, options = {}) {
  return readStableSensorValue({
    endpoint: HEIGHT_ENDPOINT,
    keys: ["heightCm", "height", "cm", "value"],
    liveKeys: ["liveHeightCm", "heightCm", "height", "cm", "value"],
    normalize: (value) => Math.round(value),
    signal,
    onSample: options.onSample,
    stableConfirmMs: options.stableConfirmMs,
    stableTolerance: SENSOR_HEIGHT_STABLE_TOLERANCE_CM,
    resetTolerance: SENSOR_HEIGHT_RESET_TOLERANCE_CM,
    finalize: (values) => Math.round(getMedianValue(values) ?? values.at(-1) ?? 0),
    label: "height",
    liveFallbackAfterMs: options.liveFallbackAfterMs ?? 4500,
    allowLiveFinalizeOnTimeout: true,
  });
}
