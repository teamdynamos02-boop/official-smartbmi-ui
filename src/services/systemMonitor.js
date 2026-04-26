import { limitToLast, onValue, push, query, ref, set } from "firebase/database";
import { rtdb } from "./firebase";

const SYSTEM_API_BASE = import.meta.env.VITE_SENSOR_API_BASE ?? "http://127.0.0.1:5000";
const SYSTEM_STATUS_ENDPOINT = import.meta.env.VITE_SYSTEM_STATUS_ENDPOINT ?? "/system/status";
const SYSTEM_DEVICE_ID = import.meta.env.VITE_SYSTEM_DEVICE_ID ?? "smartbmi-kiosk-1";
const SYSTEM_HISTORY_LIMIT = Number(import.meta.env.VITE_SYSTEM_HISTORY_LIMIT ?? 20);
const SYSTEM_HISTORY_INTERVAL_MS = Number(import.meta.env.VITE_SYSTEM_HISTORY_INTERVAL_MS ?? 60000);
const SYSTEM_STATUS_TIMEOUT_MS = Number(import.meta.env.VITE_SYSTEM_STATUS_TIMEOUT_MS ?? 3000);
const BROWSER_CAMERA_STATUS_CACHE_MS = Number(import.meta.env.VITE_BROWSER_CAMERA_STATUS_CACHE_MS ?? 60000);
const OFFLINE_QUEUE_KEY = "smartbmi.system-monitor.queue";

let lastHistorySignature = "";
let lastHistoryWriteAt = 0;
let cachedCameraStatus = null;
let cachedCameraStatusAt = 0;

function joinUrl(base, path) {
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function getQueue() {
  try {
    const raw = window.localStorage.getItem(OFFLINE_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setQueue(queue) {
  try {
    window.localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue.slice(-20)));
  } catch {
    // Ignore localStorage write issues; current sync attempt can still proceed.
  }
}

function queueSnapshot(snapshot) {
  const queue = getQueue();
  queue.push(snapshot);
  setQueue(queue);
}

function snapshotSignature(snapshot) {
  const components = snapshot?.components ?? {};
  const simplified = Object.fromEntries(
    Object.entries(components).map(([key, value]) => [
      key,
      {
        status: value?.status ?? "unknown",
        detail: value?.detail ?? "",
      },
    ]),
  );
  return JSON.stringify({
    overall: snapshot?.overall ?? "unknown",
    mode: snapshot?.mode ?? "unknown",
    components: simplified,
  });
}

async function flushOfflineQueue(deviceId) {
  const queue = getQueue();
  if (queue.length === 0) return;

  const historyRef = ref(rtdb, `systemMonitoring/${deviceId}/history`);
  for (const snapshot of queue) {
    await push(historyRef, snapshot);
  }
  setQueue([]);
}

async function detectBrowserCameraStatus() {
  if (
    cachedCameraStatus
    && (Date.now() - cachedCameraStatusAt) < Math.max(5000, BROWSER_CAMERA_STATUS_CACHE_MS)
  ) {
    return cachedCameraStatus;
  }

  if (!navigator?.mediaDevices?.enumerateDevices) {
    cachedCameraStatus = {
      status: "unknown",
      detail: "Browser camera enumeration is not available.",
      detectedAt: Date.now(),
    };
    cachedCameraStatusAt = Date.now();
    return cachedCameraStatus;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const count = devices.filter((device) => device.kind === "videoinput").length;
    cachedCameraStatus = {
      status: count > 0 ? "ok" : "warning",
      detail: count > 0 ? `${count} camera input detected.` : "No browser camera input detected.",
      detectedAt: Date.now(),
      count,
    };
    cachedCameraStatusAt = Date.now();
    return cachedCameraStatus;
  } catch (error) {
    cachedCameraStatus = {
      status: "warning",
      detail: error?.message || "Camera enumeration failed.",
      detectedAt: Date.now(),
    };
    cachedCameraStatusAt = Date.now();
    return cachedCameraStatus;
  }
}

export async function fetchSystemStatus(signal) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), Math.max(500, SYSTEM_STATUS_TIMEOUT_MS));
  const response = await fetch(joinUrl(SYSTEM_API_BASE, SYSTEM_STATUS_ENDPOINT), {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: controller.signal,
  }).catch((error) => {
    if (error?.name === "AbortError") {
      throw new Error("System status request timed out");
    }
    throw error;
  }).finally(() => {
    window.clearTimeout(timeoutId);
  });

  if (signal?.aborted) {
    throw new Error("System status request cancelled");
  }

  if (!response.ok) {
    throw new Error(`System status request failed with HTTP ${response.status}`);
  }

  return response.json();
}

export async function buildSystemMonitorSnapshot(signal) {
  const raw = await fetchSystemStatus(signal);
  const cameraModule = await detectBrowserCameraStatus();
  const browserOnline = typeof navigator?.onLine === "boolean" ? navigator.onLine : true;
  const capturedAt = Date.now();
  const deviceId = raw?.deviceId || SYSTEM_DEVICE_ID;
  const mode = raw?.mode === "offline" ? "offline" : "online";

  return {
    ...raw,
    deviceId,
    mode,
    capturedAt,
    source: "kiosk-ui",
    components: {
      ...(raw?.components ?? {}),
      cameraModule,
      firebaseSync: {
        status: "ok",
        detail: "Ready to sync monitoring heartbeat to Firebase.",
        detectedAt: capturedAt,
      },
      wifi: {
        ...(raw?.components?.wifi ?? {}),
        status: raw?.components?.wifi?.status ?? (browserOnline ? "ok" : "offline"),
        detail: raw?.components?.wifi?.detail ?? (browserOnline ? "Browser reports online." : "Browser reports offline mode."),
        detectedAt: capturedAt,
        online: raw?.components?.wifi?.online ?? browserOnline,
      },
    },
  };
}

export async function syncSystemMonitorSnapshot(snapshot) {
  const deviceId = snapshot?.deviceId || SYSTEM_DEVICE_ID;
  const currentRef = ref(rtdb, `systemMonitoring/${deviceId}/current`);
  const historyRef = ref(rtdb, `systemMonitoring/${deviceId}/history`);
  const signature = snapshotSignature(snapshot);
  const shouldWriteHistory = signature !== lastHistorySignature || (Date.now() - lastHistoryWriteAt) >= SYSTEM_HISTORY_INTERVAL_MS;

  try {
    await flushOfflineQueue(deviceId);
    await set(currentRef, {
      ...snapshot,
      lastSeenAt: Date.now(),
    });

    if (shouldWriteHistory) {
      await push(historyRef, {
        ...snapshot,
        archivedAt: Date.now(),
      });
      lastHistorySignature = signature;
      lastHistoryWriteAt = Date.now();
    }
  } catch (error) {
    queueSnapshot({
      ...snapshot,
      queuedAt: Date.now(),
      components: {
        ...(snapshot?.components ?? {}),
        firebaseSync: {
          status: "offline",
          detail: error?.message || "Failed to sync to Firebase.",
          detectedAt: Date.now(),
        },
      },
    });
    throw error;
  }
}

export async function collectAndSyncSystemMonitor(signal) {
  const snapshot = await buildSystemMonitorSnapshot(signal);
  try {
    await syncSystemMonitorSnapshot(snapshot);
    return snapshot;
  } catch (error) {
    return {
      ...snapshot,
      components: {
        ...(snapshot?.components ?? {}),
        firebaseSync: {
          status: "offline",
          detail: error?.message || "Failed to sync to Firebase.",
          detectedAt: Date.now(),
        },
      },
    };
  }
}

export function subscribeToCurrentSystemMonitor(deviceId, callback) {
  const currentRef = ref(rtdb, `systemMonitoring/${deviceId || SYSTEM_DEVICE_ID}/current`);
  return onValue(currentRef, (snapshot) => callback(snapshot.exists() ? snapshot.val() : null));
}

export function subscribeToSystemMonitorHistory(deviceId, callback) {
  const historyRef = query(
    ref(rtdb, `systemMonitoring/${deviceId || SYSTEM_DEVICE_ID}/history`),
    limitToLast(Math.max(1, SYSTEM_HISTORY_LIMIT)),
  );

  return onValue(historyRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback([]);
      return;
    }

    const rows = Object.entries(snapshot.val() || {})
      .map(([id, value]) => ({ id, ...(value || {}) }))
      .sort((a, b) => (Number(b.capturedAt) || 0) - (Number(a.capturedAt) || 0));

    callback(rows);
  });
}

export function getDefaultSystemDeviceId() {
  return SYSTEM_DEVICE_ID;
}
