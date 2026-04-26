const LOCAL_DATA_BASE = import.meta.env.VITE_LOCAL_DATA_BASE ?? import.meta.env.VITE_SENSOR_API_BASE ?? "";
const LOCAL_DATA_ENABLED = String(import.meta.env.VITE_LOCAL_DATA_ENABLED ?? "true").toLowerCase() === "true";
const LOCAL_DATA_TIMEOUT_MS = Number(import.meta.env.VITE_LOCAL_DATA_TIMEOUT_MS ?? 3000);
const USER_MEASUREMENTS_CACHE_PREFIX = "smartbmi.user.measurements";
const USER_PROFILE_CACHE_PREFIX = "smartbmi.user.profile";

function toNullableNumber(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isGuestUser(userOrId) {
  const id = String(typeof userOrId === "string" ? userOrId : userOrId?.id ?? "").trim().toLowerCase();
  return id.startsWith("guest-");
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

function newMeasurementId() {
  return `measurement-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function localFetch(path, options = {}) {
  if (!LOCAL_DATA_ENABLED || !LOCAL_DATA_BASE) {
    throw new Error("Local data backend is disabled.");
  }
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), Math.max(500, LOCAL_DATA_TIMEOUT_MS));
  const response = await fetch(`${LOCAL_DATA_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    signal: controller.signal,
    ...options,
  }).catch((error) => {
    if (error?.name === "AbortError") {
      throw new Error("Local save request timed out.");
    }
    throw error;
  }).finally(() => {
    window.clearTimeout(timeoutId);
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Local request failed (${response.status})`);
  }
  return response.json();
}

function getUserMeasurementsCacheKey(userId) {
  return `${USER_MEASUREMENTS_CACHE_PREFIX}.${String(userId)}`;
}

function getUserProfileCacheKey(userId) {
  return `${USER_PROFILE_CACHE_PREFIX}.${String(userId)}`;
}

function normalizeUserProfile(entry, userId) {
  if (!entry && !userId) return null;
  const id = String(entry?.id ?? userId ?? "").trim();
  if (!id) return null;
  return {
    id,
    name: entry?.name ?? entry?.fullName ?? "",
    age: toNullableNumber(entry?.age),
    sex: entry?.sex ?? "",
    password: entry?.password ?? "12345",
    mustResetPassword: typeof entry?.mustResetPassword === "boolean" ? entry.mustResetPassword : true,
    sync_status: entry?.sync_status ?? entry?.syncStatus ?? "pending",
    syncedAt: entry?.syncedAt ?? null,
  };
}

function normalizeMeasurementEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  return {
    id: String(entry.id || ""),
    user_id: String(entry.user_id ?? entry.userId ?? ""),
    name: entry.name ?? "",
    age: toNullableNumber(entry.age),
    sex: entry.sex ?? "",
    weightKg: toNullableNumber(entry.weightKg ?? entry.weight),
    heightCm: toNullableNumber(entry.heightCm ?? entry.height),
    bmi: toNullableNumber(entry.bmi),
    category: entry.category ?? "",
    capturedAt: Number(entry.capturedAt ?? entry.timestamp) || 0,
    capturedAtFormatted: entry.capturedAtFormatted ?? "",
    capturedDate: entry.capturedDate ?? "",
    capturedTime: entry.capturedTime ?? "",
    sync_status: entry.sync_status ?? entry.syncStatus ?? "pending",
    syncedAt: entry.syncedAt ?? null,
  };
}

function getCachedUserMeasurements(userId) {
  try {
    const raw = window.localStorage.getItem(getUserMeasurementsCacheKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map((entry) => normalizeMeasurementEntry(entry)).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function setCachedUserMeasurements(userId, items, limit = 20) {
  try {
    const normalized = (Array.isArray(items) ? items : [])
      .map((entry) => normalizeMeasurementEntry(entry))
      .filter(Boolean)
      .sort((a, b) => (Number(a.capturedAt) || 0) - (Number(b.capturedAt) || 0))
      .slice(-Math.max(1, Number(limit) || 20));
    window.localStorage.setItem(getUserMeasurementsCacheKey(userId), JSON.stringify(normalized));
  } catch {
    // Ignore cache write failures.
  }
}

function getCachedUserProfile(userId) {
  try {
    const raw = window.localStorage.getItem(getUserProfileCacheKey(userId));
    const parsed = raw ? JSON.parse(raw) : null;
    return normalizeUserProfile(parsed, userId);
  } catch {
    return null;
  }
}

function setCachedUserProfile(userId, profile) {
  try {
    const normalized = normalizeUserProfile(profile, userId);
    if (!normalized) return;
    window.localStorage.setItem(getUserProfileCacheKey(userId), JSON.stringify(normalized));
  } catch {
    // Ignore cache write failures.
  }
}

function clearCachedUserMeasurements(userId) {
  try {
    window.localStorage.removeItem(getUserMeasurementsCacheKey(userId));
  } catch {
    // Ignore cache clear failures.
  }
}

function clearCachedUserProfile(userId) {
  try {
    window.localStorage.removeItem(getUserProfileCacheKey(userId));
  } catch {
    // Ignore cache clear failures.
  }
}

function assertRegisteredUser(user) {
  if (!user?.id) {
    throw new Error("Missing user ID");
  }
  if (isGuestUser(user)) {
    throw new Error("Guest users must not be saved.");
  }
}

export async function flushPendingFirebaseWrites() {
  try {
    return await localFetch("/local/sync/flush", { method: "POST" });
  } catch (error) {
    return {
      ok: false,
      flushed: 0,
      remaining: 0,
      error,
    };
  }
}

export async function upsertUserProfile(user) {
  if (!user?.id || isGuestUser(user)) {
    return { queued: false, skipped: true };
  }
  assertRegisteredUser(user);
  const payload = {
    id: String(user.id),
    name: user.name ?? "",
    age: toNullableNumber(user.age),
    sex: user.sex ?? "",
    password: user.password ?? "12345",
    mustResetPassword: typeof user.mustResetPassword === "boolean" ? user.mustResetPassword : true,
  };
  const result = await localFetch(`/local/users/${encodeURIComponent(String(user.id))}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  setCachedUserProfile(user.id, result?.user ?? payload);
  return {
    queued: Boolean(result?.queued ?? true),
    localOnly: true,
    user: result?.user ?? payload,
  };
}

export async function saveMeasurement(user) {
  if (!user?.id || isGuestUser(user)) {
    return { queued: false, skipped: true };
  }
  assertRegisteredUser(user);
  const capturedAt = Date.now();
  const formatted = formatDateTime(capturedAt);
  const profile = normalizeUserProfile(user, user.id);
  const payload = {
    id: newMeasurementId(),
    user_id: String(user.id),
    name: user.name ?? "",
    age: toNullableNumber(user.age),
    sex: user.sex ?? "",
    weightKg: toNullableNumber(user.weightKg),
    heightCm: toNullableNumber(user.heightCm),
    bmi: toNullableNumber(user.bmi),
    category: user.category ?? "",
    capturedAt,
    capturedAtFormatted: formatted.datetime,
    capturedDate: formatted.date,
    capturedTime: formatted.time,
    profile,
  };
  const result = await localFetch(`/local/users/${encodeURIComponent(String(user.id))}/measurements`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const nextMeasurement = normalizeMeasurementEntry(result?.measurement ?? payload);
  const cached = getCachedUserMeasurements(user.id).filter((entry) => entry.id !== nextMeasurement.id);
  setCachedUserMeasurements(user.id, [...cached, nextMeasurement]);
  return {
    queued: Boolean(result?.queued ?? true),
    localOnly: true,
    measurement: nextMeasurement,
  };
}

export async function getUserProfile(userId) {
  if (!userId) return null;
  try {
    const result = await localFetch(`/local/users/${encodeURIComponent(String(userId))}`);
    const normalized = normalizeUserProfile(result?.user, userId);
    if (!normalized) {
      clearCachedUserProfile(userId);
      return null;
    }
    setCachedUserProfile(userId, normalized);
    return normalized;
  } catch {
    return getCachedUserProfile(userId);
  }
}

export async function getLatestMeasurement(userId) {
  if (!userId) return null;
  try {
    const result = await localFetch(`/local/users/${encodeURIComponent(String(userId))}/measurements/latest`);
    const normalized = normalizeMeasurementEntry(result?.measurement);
    if (!normalized) return null;
    const cached = getCachedUserMeasurements(userId).filter((entry) => entry.id !== normalized.id);
    setCachedUserMeasurements(userId, [...cached, normalized]);
    return {
      weightKg: normalized.weightKg,
      heightCm: normalized.heightCm,
      bmi: normalized.bmi,
      category: normalized.category,
    };
  } catch {
    const cached = getCachedUserMeasurements(userId);
    const latest = cached[cached.length - 1];
    return latest
      ? {
          weightKg: latest.weightKg,
          heightCm: latest.heightCm,
          bmi: latest.bmi,
          category: latest.category,
        }
      : null;
  }
}

export async function getUserMeasurements(userId, options = {}) {
  if (!userId) return [];
  const limit = Math.max(1, Number(options?.limit) || 8);
  try {
    const result = await localFetch(`/local/users/${encodeURIComponent(String(userId))}/measurements?limit=${limit}`);
    const items = Array.isArray(result?.measurements)
      ? result.measurements.map((entry) => normalizeMeasurementEntry(entry)).filter(Boolean)
      : [];
    setCachedUserMeasurements(userId, items, Math.max(limit, 20));
    return items.slice(-limit);
  } catch {
    return getCachedUserMeasurements(userId).slice(-limit);
  }
}

export async function deleteUserRecord(userId) {
  const id = String(userId || "").trim();
  if (!id) throw new Error("Missing user ID");
  await localFetch(`/local/users/${encodeURIComponent(id)}`, { method: "DELETE" });
  clearCachedUserMeasurements(id);
  clearCachedUserProfile(id);
  return { ok: true };
}
