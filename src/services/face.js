const FACE_API_BASE = import.meta.env.VITE_SENSOR_API_BASE ?? "http://127.0.0.1:5000";
const FACE_TIMEOUT_MS = Number(import.meta.env.VITE_FACE_TIMEOUT_MS ?? 9000);
const FACE_LIVENESS_TIMEOUT_MS = Number(import.meta.env.VITE_FACE_LIVENESS_TIMEOUT_MS ?? 20000);
const FACE_REGISTER_TIMEOUT_MS = Number(import.meta.env.VITE_FACE_REGISTER_TIMEOUT_MS ?? 30000);
const FRAME_MAX_WIDTH = Number(import.meta.env.VITE_FACE_FRAME_MAX_WIDTH ?? 1280);
const FRAME_MAX_HEIGHT = Number(import.meta.env.VITE_FACE_FRAME_MAX_HEIGHT ?? 720);
const FRAME_JPEG_QUALITY = Number(import.meta.env.VITE_FACE_FRAME_JPEG_QUALITY ?? 0.9);
const frameCanvas = document.createElement("canvas");
const frameCtx = frameCanvas.getContext("2d");

function joinUrl(base, path) {
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function withTimeout(signal, timeoutMs = FACE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
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

async function postFace(path, payload, signal, timeoutMs = FACE_TIMEOUT_MS) {
  const guard = withTimeout(signal, timeoutMs);
  try {
    const res = await fetch(joinUrl(FACE_API_BASE, path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: guard.signal,
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) {
      throw new Error(body?.error || `Face API failed with HTTP ${res.status}`);
    }
    return body;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Face request timed out");
    }
    throw error;
  } finally {
    guard.cleanup();
  }
}

export function captureFrame(videoEl, options = {}) {
  const srcW = Number(videoEl?.videoWidth || videoEl?.naturalWidth || 0);
  const srcH = Number(videoEl?.videoHeight || videoEl?.naturalHeight || 0);
  if (!videoEl || !srcW || !srcH) {
    throw new Error("Camera frame not ready");
  }

  const maxWidth = Number(options.maxWidth ?? FRAME_MAX_WIDTH);
  const maxHeight = Number(options.maxHeight ?? FRAME_MAX_HEIGHT);
  const quality = Number(options.quality ?? FRAME_JPEG_QUALITY);
  const scale = Math.min(1, maxWidth / srcW, maxHeight / srcH);
  const outW = Math.max(1, Math.round(srcW * scale));
  const outH = Math.max(1, Math.round(srcH * scale));

  frameCanvas.width = outW;
  frameCanvas.height = outH;
  frameCtx.drawImage(videoEl, 0, 0, outW, outH);
  return frameCanvas.toDataURL("image/jpeg", quality);
}

export function getPiCameraFrameUrl(cacheBust = Date.now()) {
  return `${joinUrl(FACE_API_BASE, "/camera/pi/frame.jpg")}?t=${encodeURIComponent(String(cacheBust))}`;
}

export async function getPiCameraStatus(signal) {
  const guard = withTimeout(signal);
  try {
    const res = await fetch(joinUrl(FACE_API_BASE, "/camera/pi/status"), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: guard.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) {
      throw new Error(body?.error || `Pi camera status failed with HTTP ${res.status}`);
    }
    return body;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Pi camera status timed out");
    }
    throw error;
  } finally {
    guard.cleanup();
  }
}

export function registerFace({ userId, name, imageData, imageDataList }, signal) {
  return postFace("/face/register", { userId, name, imageData, imageDataList }, signal, FACE_REGISTER_TIMEOUT_MS);
}

export function identifyFace({ imageData }, signal) {
  return postFace("/face/identify", { imageData }, signal);
}

export function checkRestrictions({ imageData }, signal) {
  return postFace("/vision/restrictions", { imageData }, signal);
}

export function checkLiveness({ imageData }, signal) {
  return postFace("/face/liveness", { imageData }, signal, FACE_LIVENESS_TIMEOUT_MS);
}

export function checkPoseMetrics({ imageData }, signal) {
  return postFace("/face/pose-metrics", { imageData }, signal);
}

export async function getFaceStatus(signal) {
  const guard = withTimeout(signal);
  try {
    const res = await fetch(joinUrl(FACE_API_BASE, "/face/status"), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: guard.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) {
      throw new Error(body?.error || `Face API failed with HTTP ${res.status}`);
    }
    return body;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Face request timed out");
    }
    throw error;
  } finally {
    guard.cleanup();
  }
}

export async function deleteFaceUser(userId, signal) {
  const guard = withTimeout(signal);
  try {
    const res = await fetch(joinUrl(FACE_API_BASE, `/face/user/${encodeURIComponent(String(userId))}`), {
      method: "DELETE",
      headers: { Accept: "application/json" },
      signal: guard.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) {
      throw new Error(body?.error || `Face API failed with HTTP ${res.status}`);
    }
    return body;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Face request timed out");
    }
    throw error;
  } finally {
    guard.cleanup();
  }
}
