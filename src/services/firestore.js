import { get, ref, remove, update } from "firebase/database";
import { rtdb } from "./firebase";

const SYSTEM_DEVICE_ID = import.meta.env.VITE_SYSTEM_DEVICE_ID ?? "smartbmi-kiosk-1";
const LOCAL_DATA_BASE = import.meta.env.VITE_LOCAL_DATA_BASE ?? import.meta.env.VITE_SENSOR_API_BASE ?? "";
const LOCAL_DATA_ENABLED = String(import.meta.env.VITE_LOCAL_DATA_ENABLED ?? "true").toLowerCase() === "true";
const FIREBASE_OUTBOX_KEY = "smartbmi.firebase.outbox";
const USER_MEASUREMENTS_CACHE_PREFIX = "smartbmi.user.measurements";
const USER_PROFILE_CACHE_PREFIX = "smartbmi.user.profile";

function toNullableNumber(value) {
  if (value == null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const direct = Number(trimmed);
    if (Number.isFinite(direct)) return direct;
    const match = trimmed.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const extracted = Number(match[0]);
    return Number.isFinite(extracted) ? extracted : null;
  }
  return null;
}

function assertUser(user) {
  if (!user || !user.id) {
    throw new Error("Missing user ID");
  }
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDateTime(now) {
  const date = new Date(now);
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const year = date.getFullYear();
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  const second = pad2(date.getSeconds());
  return {
    date: `${month}/${day}/${year}`,
    time: `${hour}:${minute}:${second}`,
    datetime: `${month}/${day}/${year} ${hour}:${minute}:${second}`,
  };
}

function getOutbox() {
  try {
    const raw = window.localStorage.getItem(FIREBASE_OUTBOX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setOutbox(items) {
  try {
    window.localStorage.setItem(FIREBASE_OUTBOX_KEY, JSON.stringify(items.slice(-200)));
  } catch {
    // Ignore storage issues; direct writes may still succeed.
  }
}

function clearUserOutbox(userId) {
  try {
    const id = String(userId);
    const next = getOutbox().filter((item) => String(item?.payload?.user?.id ?? item?.user?.id ?? item?.userId) !== id);
    setOutbox(next);
  } catch {
    // Ignore storage cleanup issues.
  }
}

function enqueueOutboxItem(item) {
  const outbox = getOutbox();
  outbox.push(item);
  setOutbox(outbox);
}

function newOutboxId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function localFetch(path, options = {}) {
  if (!LOCAL_DATA_ENABLED || !LOCAL_DATA_BASE) {
    throw new Error("Local data backend is disabled.");
  }
  const url = `${LOCAL_DATA_BASE}${path}`;
  const resp = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(text || `Local request failed (${resp.status})`);
  }
  return resp.json();
}

function getUserMeasurementsCacheKey(userId) {
  return `${USER_MEASUREMENTS_CACHE_PREFIX}.${String(userId)}`;
}

function getUserProfileCacheKey(userId) {
  return `${USER_PROFILE_CACHE_PREFIX}.${String(userId)}`;
}

function normalizeUserProfile(entry, userId) {
  if (!entry && !userId) return null;
  return {
    id: String(entry?.id ?? userId ?? ""),
    name: entry?.name ?? entry?.fullName ?? "",
    age: toNullableNumber(entry?.age),
    sex: entry?.sex ?? "",
    password: entry?.password ?? "12345",
    mustResetPassword: typeof entry?.mustResetPassword === "boolean" ? entry.mustResetPassword : true,
  };
}

function normalizeMeasurementEntry(entry) {
  return {
    weightKg: toNullableNumber(entry?.weightKg ?? entry?.weight ?? entry?.kg ?? entry?.value),
    heightCm: toNullableNumber(entry?.heightCm ?? entry?.height ?? entry?.cm),
    bmi: toNullableNumber(entry?.bmi),
    category: entry?.category ?? "",
    capturedAt: Number(entry?.capturedAt) || 0,
    capturedAtFormatted: entry?.capturedAtFormatted ?? "",
    capturedDate: entry?.capturedDate ?? "",
    capturedTime: entry?.capturedTime ?? "",
  };
}

function getCachedUserMeasurements(userId) {
  try {
    const raw = window.localStorage.getItem(getUserMeasurementsCacheKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map((entry) => normalizeMeasurementEntry(entry))
      : [];
  } catch {
    return [];
  }
}

function getCachedUserProfile(userId) {
  try {
    const raw = window.localStorage.getItem(getUserProfileCacheKey(userId));
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return null;
    const normalized = normalizeUserProfile(parsed, userId);
    if (!normalized?.id) return null;
    return normalized;
  } catch {
    return null;
  }
}

function setCachedUserMeasurements(userId, items, limit = 20) {
  try {
    const normalized = (Array.isArray(items) ? items : [])
      .map((entry) => normalizeMeasurementEntry(entry))
      .filter((entry) => entry.capturedAt || entry.weightKg != null || entry.heightCm != null || entry.bmi != null)
      .sort((a, b) => (Number(a.capturedAt) || 0) - (Number(b.capturedAt) || 0))
      .slice(-Math.max(1, Number(limit) || 20));
    window.localStorage.setItem(getUserMeasurementsCacheKey(userId), JSON.stringify(normalized));
  } catch {
    // Ignore cache write issues; Firebase remains the source of truth.
  }
}

function setCachedUserProfile(userId, profile) {
  try {
    const normalized = normalizeUserProfile(profile, userId);
    if (!normalized?.id) return;
    window.localStorage.setItem(getUserProfileCacheKey(userId), JSON.stringify(normalized));
  } catch {
    // Ignore cache write issues; Firebase remains the source of truth.
  }
}

function clearCachedUserMeasurements(userId) {
  try {
    window.localStorage.removeItem(getUserMeasurementsCacheKey(userId));
  } catch {
    // Ignore cache clear issues.
  }
}

function clearCachedUserProfile(userId) {
  try {
    window.localStorage.removeItem(getUserProfileCacheKey(userId));
  } catch {
    // Ignore cache clear issues.
  }
}

function cacheUserMeasurement(user, measurementId, now = Date.now()) {
  assertUser(user);
  const nowFmt = formatDateTime(now);
  const userId = String(user.id);
  const cached = getCachedUserMeasurements(userId);
  const nextEntry = normalizeMeasurementEntry({
    id: measurementId,
    weightKg: user.weightKg,
    heightCm: user.heightCm,
    bmi: user.bmi,
    category: user.category ?? "",
    capturedAt: now,
    capturedAtFormatted: nowFmt.datetime,
    capturedDate: nowFmt.date,
    capturedTime: nowFmt.time,
  });
  setCachedUserMeasurements(userId, [...cached, nextEntry]);
}

async function performProfileWrite(user) {
  assertUser(user);
  const userId = String(user.id);
  const userRef = ref(rtdb, `users/${userId}`);
  const existing = await get(userRef);
  const now = Date.now();
  const nowFmt = formatDateTime(now);
  const current = existing.exists() ? (existing.val() || {}) : {};
  const createdAt = current.createdAt ?? now;
  const createdAtFormatted = current.createdAtFormatted ?? nowFmt.datetime;
  const nextProfile = {
    id: userId,
    name: user.name ?? "",
    age: toNullableNumber(user.age),
    sex: user.sex ?? "",
    password: current.password ?? user.password ?? "12345",
    mustResetPassword: typeof current.mustResetPassword === "boolean"
      ? current.mustResetPassword
      : (typeof user.mustResetPassword === "boolean" ? user.mustResetPassword : true),
  };

  await update(userRef, {
    fullName: nextProfile.name,
    age: nextProfile.age,
    sex: nextProfile.sex,
    password: nextProfile.password,
    mustResetPassword: nextProfile.mustResetPassword,
    updatedAt: now,
    updatedAtFormatted: nowFmt.datetime,
    createdAt,
    createdAtFormatted,
  });
  setCachedUserProfile(userId, nextProfile);
}

async function performLocalProfileWrite(user) {
  assertUser(user);
  const payload = {
    name: user.name ?? "",
    age: toNullableNumber(user.age),
    sex: user.sex ?? "",
    password: user.password ?? "12345",
    mustResetPassword: typeof user.mustResetPassword === "boolean" ? user.mustResetPassword : true,
  };
  await localFetch(`/local/users/${encodeURIComponent(String(user.id))}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  setCachedUserProfile(user.id, payload);
}

async function performMeasurementWrite(user, measurementId = newOutboxId("measurement"), meta = {}) {
  assertUser(user);
  const capturedAt = Number(meta?.capturedAt ?? meta?.queuedAt) || Date.now();
  const nowFmt = formatDateTime(capturedAt);
  const userId = String(user.id);
  const weightKg = toNullableNumber(user.weightKg);
  const heightCm = toNullableNumber(user.heightCm);
  const bmi = toNullableNumber(user.bmi);
  const capturedDate = meta?.capturedDate ?? nowFmt.date;
  const capturedTime = meta?.capturedTime ?? nowFmt.time;
  const capturedAtFormatted = meta?.capturedAtFormatted ?? nowFmt.datetime;
  const capturedTimezone = meta?.capturedTimezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");

  await update(ref(rtdb), {
    [`users/${userId}/measurements/${measurementId}`]: {
      weightKg,
      heightCm,
      bmi,
      category: user.category ?? "",
      capturedAt,
      capturedAtFormatted,
      capturedDate,
      capturedTime,
      capturedTimezone,
    },
    [`systemMonitoring/${SYSTEM_DEVICE_ID}/dashboard/recentMeasurements/${measurementId}`]: {
      userId,
      weightKg,
      heightCm,
      bmi,
      category: user.category ?? "",
      status: "success",
      capturedAt,
      capturedAtFormatted,
      capturedTime,
    },
  });
  cacheUserMeasurement(user, measurementId, capturedAt);
}

async function performLocalMeasurementWrite(user, measurementId, meta = {}) {
  assertUser(user);
  const capturedAt = Number(meta?.capturedAt ?? meta?.queuedAt) || Date.now();
  const nowFmt = formatDateTime(capturedAt);
  const payload = {
    id: measurementId,
    weightKg: toNullableNumber(user.weightKg),
    heightCm: toNullableNumber(user.heightCm),
    bmi: toNullableNumber(user.bmi),
    category: user.category ?? "",
    capturedAt,
    capturedAtFormatted: meta?.capturedAtFormatted ?? nowFmt.datetime,
    capturedDate: meta?.capturedDate ?? nowFmt.date,
    capturedTime: meta?.capturedTime ?? nowFmt.time,
  };
  await localFetch(`/local/users/${encodeURIComponent(String(user.id))}/measurements`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  cacheUserMeasurement(user, measurementId, capturedAt);
}

function queueProfileWrite(user) {
  setCachedUserProfile(String(user?.id ?? ""), {
    id: String(user?.id ?? ""),
    name: user?.name ?? "",
    age: user?.age ?? null,
    sex: user?.sex ?? "",
    password: user?.password ?? "12345",
    mustResetPassword: typeof user?.mustResetPassword === "boolean" ? user.mustResetPassword : true,
  });
  enqueueOutboxItem({
    id: newOutboxId("profile"),
    type: "profile",
    queuedAt: Date.now(),
    user: {
      id: String(user.id),
      name: user.name ?? "",
      age: user.age ?? null,
      sex: user.sex ?? "",
      password: user.password ?? "12345",
      mustResetPassword: typeof user.mustResetPassword === "boolean" ? user.mustResetPassword : true,
    },
  });
}

function queueMeasurementWrite(user, measurementId) {
  const now = Date.now();
  const nowFmt = formatDateTime(now);
  const capturedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  enqueueOutboxItem({
    id: measurementId,
    type: "measurement",
    measurementId,
    queuedAt: now,
    capturedAt: now,
    capturedAtFormatted: nowFmt.datetime,
    capturedDate: nowFmt.date,
    capturedTime: nowFmt.time,
    capturedTimezone,
    user: {
      id: String(user.id),
      weightKg: toNullableNumber(user.weightKg),
      heightCm: toNullableNumber(user.heightCm),
      bmi: toNullableNumber(user.bmi),
      category: user.category ?? "",
    },
  });
  cacheUserMeasurement(user, measurementId, now);
}

export async function flushPendingFirebaseWrites() {
  const outbox = getOutbox();
  if (outbox.length === 0) return { flushed: 0, remaining: 0 };

  const remaining = [];
  let flushed = 0;

  for (const item of outbox) {
    try {
      if (item?.type === "profile") {
        await performProfileWrite(item.user);
      } else if (item?.type === "measurement") {
        await performMeasurementWrite(item.user, item.measurementId, item);
      } else {
        continue;
      }
      flushed += 1;
    } catch (error) {
      remaining.push(item);
      remaining.push(...outbox.slice(flushed + remaining.length));
      setOutbox(remaining);
      throw error;
    }
  }

  setOutbox([]);
  return { flushed, remaining: 0 };
}

export async function upsertUserProfile(user, options = {}) {
  if (LOCAL_DATA_ENABLED) {
    performLocalProfileWrite(user).catch(() => {});
  }
  if (options?.forceQueue) {
    queueProfileWrite(user);
    return { queued: true, forcedOffline: true };
  }

  try {
    await performProfileWrite(user);
    return { queued: false };
  } catch (error) {
    queueProfileWrite(user);
    return { queued: true, error };
  }
}

export async function saveMeasurement(user, options = {}) {
  const measurementId = newOutboxId("measurement");
  if (LOCAL_DATA_ENABLED) {
    performLocalMeasurementWrite(user, measurementId).catch(() => {});
  }
  if (options?.forceQueue) {
    queueMeasurementWrite(user, measurementId);
    return { queued: true, forcedOffline: true };
  }

  try {
    await performMeasurementWrite(user, measurementId);
    return { queued: false };
  } catch (error) {
    queueMeasurementWrite(user, measurementId);
    return { queued: true, error };
  }
}

export async function getUserProfile(userId) {
  try {
    const userRef = ref(rtdb, `users/${String(userId)}`);
    const snapshot = await get(userRef);
    if (!snapshot.exists()) {
      clearCachedUserProfile(userId);
      try {
        const local = await localFetch(`/local/users/${encodeURIComponent(String(userId))}`);
        if (local?.user) {
          const normalized = normalizeUserProfile(local.user, userId);
          setCachedUserProfile(userId, normalized);
          return normalized;
        }
      } catch {
        // Ignore local fetch failure.
      }
      return null;
    }
    const data = snapshot.val();
    const profile = {
      id: String(userId),
      name: data.fullName ?? "",
      age: data.age ?? null,
      sex: data.sex ?? "",
      password: data.password ?? "12345",
      mustResetPassword: typeof data.mustResetPassword === "boolean" ? data.mustResetPassword : true,
    };
    setCachedUserProfile(userId, profile);
    return profile;
  } catch {
    try {
      const local = await localFetch(`/local/users/${encodeURIComponent(String(userId))}`);
      if (local?.user) {
        const normalized = normalizeUserProfile(local.user, userId);
        setCachedUserProfile(userId, normalized);
        return normalized;
      }
    } catch {
      // Ignore local fetch failure.
    }
    return getCachedUserProfile(userId);
  }
}

export async function getLatestMeasurement(userId) {
  const limit = 8;
  try {
    const measurementsRef = ref(rtdb, `users/${String(userId)}/measurements`);
    const snapshot = await get(measurementsRef);
    if (snapshot.exists()) {
      const measurements = snapshot.val() || {};
      const latest = Object.values(measurements).reduce((best, current) => {
        if (!best) return current;
        const bestTs = Number(best?.capturedAt) || 0;
        const currentTs = Number(current?.capturedAt) || 0;
        return currentTs > bestTs ? current : best;
      }, null);

      if (latest) {
        const normalized = normalizeMeasurementEntry(latest);
        const existingCache = getCachedUserMeasurements(userId).filter((entry) => entry.capturedAt !== normalized.capturedAt);
        setCachedUserMeasurements(userId, [...existingCache, normalized]);
        return {
          weightKg: normalized.weightKg,
          heightCm: normalized.heightCm,
          bmi: normalized.bmi,
          category: normalized.category,
        };
      }
    }
  } catch {
    // Fall back to local cache below.
  }

  try {
    const local = await localFetch(`/local/users/${encodeURIComponent(String(userId))}/measurements?limit=${limit}`);
    const items = Array.isArray(local?.measurements)
      ? local.measurements.map((entry) => normalizeMeasurementEntry(entry))
      : [];
    if (items.length > 0) {
      const cached = getCachedUserMeasurements(userId);
      const merged = [...items];
      const known = new Set(merged.map((entry) => Number(entry.capturedAt) || 0));
      for (const entry of cached) {
        const ts = Number(entry.capturedAt) || 0;
        if (!ts || known.has(ts)) continue;
        merged.push(entry);
        known.add(ts);
      }
      merged.sort((a, b) => (Number(a.capturedAt) || 0) - (Number(b.capturedAt) || 0));
      setCachedUserMeasurements(userId, merged, Math.max(limit, 20));
      return merged.slice(-limit);
    }
  } catch {
    // Ignore local fetch failure.
  }

  try {
    const local = await localFetch(`/local/users/${encodeURIComponent(String(userId))}/measurements/latest`);
    if (local?.measurement) {
      const normalized = normalizeMeasurementEntry(local.measurement);
      const existingCache = getCachedUserMeasurements(userId).filter((entry) => entry.capturedAt !== normalized.capturedAt);
      setCachedUserMeasurements(userId, [...existingCache, normalized]);
      return {
        weightKg: normalized.weightKg,
        heightCm: normalized.heightCm,
        bmi: normalized.bmi,
        category: normalized.category,
      };
    }
  } catch {
    // Ignore local fetch failure.
  }

  const cached = getCachedUserMeasurements(userId);
  const latestCached = cached[cached.length - 1];
  if (!latestCached) return null;
  return {
    weightKg: latestCached.weightKg,
    heightCm: latestCached.heightCm,
    bmi: latestCached.bmi,
    category: latestCached.category,
  };
}

export async function getUserMeasurements(userId, options = {}) {
  const limit = Math.max(1, Number(options?.limit) || 8);
  try {
    const measurementsRef = ref(rtdb, `users/${String(userId)}/measurements`);
    const snapshot = await get(measurementsRef);
    if (snapshot.exists()) {
      const items = Object.values(snapshot.val() || {})
        .map((entry) => normalizeMeasurementEntry(entry))
        .filter((entry) => entry.capturedAt || entry.weightKg != null || entry.heightCm != null || entry.bmi != null)
        .sort((a, b) => (Number(a.capturedAt) || 0) - (Number(b.capturedAt) || 0));
      const cached = getCachedUserMeasurements(userId);
      const merged = [...items];
      const known = new Set(merged.map((entry) => Number(entry.capturedAt) || 0));
      for (const entry of cached) {
        const ts = Number(entry.capturedAt) || 0;
        if (!ts || known.has(ts)) continue;
        merged.push(entry);
        known.add(ts);
      }
      merged.sort((a, b) => (Number(a.capturedAt) || 0) - (Number(b.capturedAt) || 0));
      setCachedUserMeasurements(userId, merged, Math.max(limit, 20));
      return merged.slice(-limit);
    }
  } catch {
    // Fall back to local cache below.
  }

  return getCachedUserMeasurements(userId).slice(-limit);
}

export async function deleteUserRecord(userId) {
  const id = String(userId);
  await remove(ref(rtdb, `users/${id}`));
  if (LOCAL_DATA_ENABLED) {
    localFetch(`/local/users/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  }
  clearCachedUserMeasurements(id);
  clearCachedUserProfile(id);
  clearUserOutbox(id);
  return { ok: true };
}
