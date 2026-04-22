import { useEffect, useMemo, useState } from "react";
import { Activity, Cpu, Gauge, MonitorSmartphone, Radio, RefreshCw, Server, Wifi } from "lucide-react";
import { getLiveSensorSnapshot } from "../services/sensors";
import { getDefaultSystemDeviceId, subscribeToCurrentSystemMonitor, subscribeToSystemMonitorHistory } from "../services/systemMonitor";
import {
  applyHeightReferenceCalibration,
  applyWeightReferenceCalibration,
  getHeightCalibrationStatus,
  getWeightCalibrationStatus,
  setHeightCalibrationOffset,
  setHeightSensorToPlatform,
  setWeightCalibrationOffset,
  tareWeightCalibration,
} from "../services/weightCalibration";
import { deleteUserRecord, flushPendingFirebaseWrites } from "../services/firestore";

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
}

function formatStatusLabel(status) {
  const raw = String(status || "unknown").trim();
  if (!raw) return "Unknown";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

const COMPONENT_META = {
  raspberryPi: { label: "Raspberry Pi", icon: Cpu },
  arduinoUno: { label: "Arduino Uno", icon: Server },
  tofSensor: { label: "ToF Sensor", icon: Gauge },
  loadCell: { label: "Load Cell", icon: Activity },
  cameraModule: { label: "Camera Module", icon: MonitorSmartphone },
  oledDisplay: { label: "OLED Display", icon: Radio },
  wifi: { label: "Wi-Fi", icon: Wifi },
  firebaseSync: { label: "Firebase Sync", icon: RefreshCw },
};

export default function AdminPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const deviceId = params.get("deviceId") || getDefaultSystemDeviceId();
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [weightCalibration, setWeightCalibration] = useState(null);
  const [heightCalibration, setHeightCalibration] = useState(null);
  const [sensorSnapshot, setSensorSnapshot] = useState(null);
  const [knownWeightKg, setKnownWeightKg] = useState("20");
  const [manualOffsetKg, setManualOffsetKg] = useState("");
  const [knownHeightCm, setKnownHeightCm] = useState("170");
  const [manualHeightOffsetCm, setManualHeightOffsetCm] = useState("");
  const [sensorToPlatformCm, setSensorToPlatformCm] = useState("");
  const [calibrationBusy, setCalibrationBusy] = useState(false);
  const [calibrationMessage, setCalibrationMessage] = useState("");
  const [calibrationError, setCalibrationError] = useState("");
  const [deleteUserId, setDeleteUserId] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncError, setSyncError] = useState("");
  const [offlineUsers, setOfflineUsers] = useState([]);

  useEffect(() => {
    const unsubscribeCurrent = subscribeToCurrentSystemMonitor(deviceId, setCurrent);
    const unsubscribeHistory = subscribeToSystemMonitorHistory(deviceId, setHistory);
    return () => {
      unsubscribeCurrent();
      unsubscribeHistory();
    };
  }, [deviceId]);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const [weightSnapshot, heightSnapshot] = await Promise.all([
          getWeightCalibrationStatus(),
          getHeightCalibrationStatus(),
        ]);
        if (!cancelled) {
          setWeightCalibration(weightSnapshot);
          setHeightCalibration(heightSnapshot);
          setManualOffsetKg((currentValue) => (currentValue === "" ? String(weightSnapshot?.offsetKg ?? 0) : currentValue));
          setManualHeightOffsetCm((currentValue) => (currentValue === "" ? String(heightSnapshot?.offsetCm ?? 0) : currentValue));
          setSensorToPlatformCm((currentValue) => (currentValue === "" ? String(heightSnapshot?.sensorToPlatformCm ?? 0) : currentValue));
        }
      } catch (error) {
        if (!cancelled) {
          setCalibrationError(error.message);
        }
      }
    };

    refresh();
    const intervalId = setInterval(refresh, 1500);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refreshSensors = async () => {
      try {
        const snapshot = await getLiveSensorSnapshot();
        if (!cancelled) {
          setSensorSnapshot(snapshot);
        }
      } catch (error) {
        if (!cancelled) {
          setCalibrationError((currentValue) => currentValue || error.message);
        }
      }
    };

    refreshSensors();
    const intervalId = setInterval(refreshSensors, 500);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const readQueueCount = () => {
      if (typeof window === "undefined") return;
      try {
        const raw = window.localStorage.getItem("smartbmi.firebase.outbox");
        const parsed = raw ? JSON.parse(raw) : [];
        const count = Array.isArray(parsed) ? parsed.length : 0;
        if (mounted) setOfflineQueueCount(count);
      } catch {
        if (mounted) setOfflineQueueCount(0);
      }
    };

    readQueueCount();
    const intervalId = setInterval(readQueueCount, 2000);
    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadOfflineUsers = () => {
      if (typeof window === "undefined") return;
      const profilePrefix = "smartbmi.user.profile.";
      const measurementPrefix = "smartbmi.user.measurements.";
      const outboxKey = "smartbmi.firebase.outbox";
      const profiles = new Map();
      const measurements = new Map();
      const queueCounts = new Map();

      try {
        const rawOutbox = window.localStorage.getItem(outboxKey);
        const items = rawOutbox ? JSON.parse(rawOutbox) : [];
        if (Array.isArray(items)) {
          items.forEach((item) => {
            const id = String(item?.payload?.user?.id ?? item?.user?.id ?? item?.userId ?? "").trim();
            if (!id) return;
            queueCounts.set(id, (queueCounts.get(id) ?? 0) + 1);
          });
        }
      } catch {
        // Ignore outbox parsing issues.
      }

      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (!key) continue;
        if (key.startsWith(profilePrefix)) {
          const userId = key.slice(profilePrefix.length);
          try {
            const raw = window.localStorage.getItem(key);
            const parsed = raw ? JSON.parse(raw) : null;
            if (parsed && typeof parsed === "object") {
              profiles.set(userId, parsed);
            }
          } catch {
            // Ignore bad profile cache entries.
          }
        } else if (key.startsWith(measurementPrefix)) {
          const userId = key.slice(measurementPrefix.length);
          try {
            const raw = window.localStorage.getItem(key);
            const parsed = raw ? JSON.parse(raw) : [];
            if (Array.isArray(parsed)) {
              measurements.set(userId, parsed);
            }
          } catch {
            // Ignore bad measurement cache entries.
          }
        }
      }

      const userIds = new Set([...profiles.keys(), ...measurements.keys(), ...queueCounts.keys()]);
      const rows = Array.from(userIds).map((id) => {
        const profile = profiles.get(id) || {};
        const history = Array.isArray(measurements.get(id)) ? measurements.get(id) : [];
        const sorted = [...history].sort((a, b) => (Number(a?.capturedAt) || 0) - (Number(b?.capturedAt) || 0));
        const latest = sorted[sorted.length - 1] || null;
        return {
          id,
          name: profile.name || profile.fullName || "",
          age: profile.age ?? null,
          sex: profile.sex ?? "",
          measurementsCount: history.length,
          queuedCount: queueCounts.get(id) ?? 0,
          latest,
        };
      }).sort((a, b) => {
        const aTs = Number(a.latest?.capturedAt) || 0;
        const bTs = Number(b.latest?.capturedAt) || 0;
        if (aTs !== bTs) return bTs - aTs;
        return String(a.id).localeCompare(String(b.id));
      });

      if (mounted) setOfflineUsers(rows);
    };

    loadOfflineUsers();
    const intervalId = setInterval(loadOfflineUsers, 2500);
    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, []);

  const runCalibrationAction = async (action) => {
    setCalibrationBusy(true);
    setCalibrationError("");
    setCalibrationMessage("");
    try {
      const result = await action();
      setCalibrationMessage(result?.message || "Calibration updated.");
      const [weightSnapshot, heightSnapshot] = await Promise.all([
        getWeightCalibrationStatus(),
        getHeightCalibrationStatus(),
      ]);
      setWeightCalibration(weightSnapshot);
      setHeightCalibration(heightSnapshot);
      setManualOffsetKg(String(weightSnapshot?.offsetKg ?? 0));
      setManualHeightOffsetCm(String(heightSnapshot?.offsetCm ?? 0));
      setSensorToPlatformCm(String(heightSnapshot?.sensorToPlatformCm ?? 0));
    } catch (error) {
      setCalibrationError(error.message);
    } finally {
      setCalibrationBusy(false);
    }
  };

  const runDeleteUser = async () => {
    const trimmedId = String(deleteUserId || "").trim();
    if (!trimmedId) {
      setDeleteError("User ID is required.");
      return;
    }
    if (!window.confirm(`Delete all records for user ${trimmedId}? This cannot be undone.`)) {
      return;
    }
    setDeleteBusy(true);
    setDeleteError("");
    setDeleteMessage("");
    try {
      const faceResponse = await fetch(`/face/user/${encodeURIComponent(trimmedId)}`, { method: "DELETE" });
      if (!faceResponse.ok) {
        const payload = await faceResponse.json().catch(() => ({}));
        throw new Error(payload?.error || "Failed to delete face profile.");
      }
      await deleteUserRecord(trimmedId);
      setDeleteMessage(`Deleted user ${trimmedId} from face DB and Firebase.`);
    } catch (error) {
      setDeleteError(error.message || "Delete failed.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const runOfflineSync = async () => {
    setSyncBusy(true);
    setSyncMessage("");
    setSyncError("");
    try {
      const result = await flushPendingFirebaseWrites();
      setSyncMessage(result?.flushed ? `Synced ${result.flushed} offline record(s).` : "No offline records to sync.");
    } catch (error) {
      setSyncError(error?.message || "Offline sync failed.");
    } finally {
      setSyncBusy(false);
    }
  };

  const components = current?.components ?? {};
  const measurement = current?.measurements ?? {};
  const liveWeight = sensorSnapshot?.weight?.liveWeightKg ?? sensorSnapshot?.live?.weightKg ?? null;
  const lockedWeight = sensorSnapshot?.weight?.finalWeightKg ?? sensorSnapshot?.weight?.weightKg ?? null;
  const liveHeight = sensorSnapshot?.height?.liveHeightCm ?? sensorSnapshot?.live?.heightCm ?? null;
  const lockedHeight = sensorSnapshot?.height?.finalHeightCm ?? sensorSnapshot?.height?.heightCm ?? null;
  const measurementLocked = sensorSnapshot?.weight?.measurementLocked ?? sensorSnapshot?.height?.measurementLocked ?? false;
  const liveBmi = sensorSnapshot?.live?.bmi ?? null;
  const liveCategory = sensorSnapshot?.live?.category ?? "--";
  const componentKeys = Object.keys(COMPONENT_META);

  return (
    <div className="page-with-actions admin-page">
      <div className="screen-grid">
        <section className="panel panel-large admin-overview-panel">
          <div className="admin-head">
            <div>
              <h2>System Monitoring</h2>
              <p className="admin-subtitle">Realtime kiosk health synced from Firebase</p>
            </div>
            <div className="admin-head-badges">
              <span className={`badge badge-${current?.overall || "unknown"}`}>{formatStatusLabel(current?.overall)}</span>
              <span className={`badge ${current?.mode === "online" ? "badge-online" : "badge-offline"}`}>
                {current?.mode === "online" ? "Online Mode" : "Offline Mode"}
              </span>
            </div>
          </div>

          <div className="admin-overview-grid">
            <div className="admin-stat-card">
              <span className="admin-stat-label">Device ID</span>
              <strong>{deviceId}</strong>
            </div>
            <div className="admin-stat-card">
              <span className="admin-stat-label">Last Heartbeat</span>
              <strong>{formatDateTime(current?.lastSeenAt || current?.capturedAt)}</strong>
            </div>
            <div className="admin-stat-card">
              <span className="admin-stat-label">Backend Started</span>
              <strong>{formatDateTime(current?.backendStartedAt)}</strong>
            </div>
            <div className="admin-stat-card">
              <span className="admin-stat-label">Serial Port</span>
              <strong>{current?.serialPort || "--"}</strong>
            </div>
          </div>

          <div className="admin-components-grid">
            {componentKeys.map((key) => {
              const meta = COMPONENT_META[key];
              const Icon = meta.icon;
              const component = components[key] || {};
              return (
                <article key={key} className={`admin-component-card status-${component.status || "unknown"}`}>
                  <div className="admin-component-top">
                    <span className="admin-component-icon"><Icon size={18} /></span>
                    <span className={`admin-chip chip-${component.status || "unknown"}`}>{formatStatusLabel(component.status)}</span>
                  </div>
                  <strong>{meta.label}</strong>
                  <p>{component.detail || "No status yet."}</p>
                  <span className="admin-component-time">Updated: {formatDateTime(component.detectedAt)}</span>
                </article>
              );
            })}
          </div>
        </section>

        <section className="panel admin-side-panel">
          <h3>Latest Measurement</h3>
          <div className="admin-measure-grid">
            <div className="admin-measure-item">
              <span>Weight</span>
              <strong>{measurement.weightKg != null ? `${measurement.weightKg} kg` : "--"}</strong>
            </div>
            <div className="admin-measure-item">
              <span>Height</span>
              <strong>{measurement.heightCm != null ? `${measurement.heightCm} cm` : "--"}</strong>
            </div>
            <div className="admin-measure-item">
              <span>BMI</span>
              <strong>{measurement.bmi != null ? measurement.bmi : "--"}</strong>
            </div>
            <div className="admin-measure-item">
              <span>Category</span>
              <strong>{measurement.category || "--"}</strong>
            </div>
          </div>

          <h3 className="admin-history-title">Live Sensor Data</h3>
          <div className="admin-calibration-card">
            <div className="admin-measure-grid">
              <div className="admin-measure-item">
                <span>Live Weight</span>
                <strong>{liveWeight != null ? `${Number(liveWeight).toFixed(1)} kg` : "--"}</strong>
              </div>
              <div className="admin-measure-item">
                <span>Locked Weight</span>
                <strong>{lockedWeight != null ? `${Number(lockedWeight).toFixed(1)} kg` : "--"}</strong>
              </div>
              <div className="admin-measure-item">
                <span>Live Height</span>
                <strong>{liveHeight != null ? `${Math.round(Number(liveHeight))} cm` : "--"}</strong>
              </div>
              <div className="admin-measure-item">
                <span>Locked Height</span>
                <strong>{lockedHeight != null ? `${Math.round(Number(lockedHeight))} cm` : "--"}</strong>
              </div>
              <div className="admin-measure-item">
                <span>Live BMI</span>
                <strong>{liveBmi != null ? liveBmi : "--"}</strong>
              </div>
              <div className="admin-measure-item">
                <span>Live Category</span>
                <strong>{liveCategory || "--"}</strong>
              </div>
              <div className="admin-measure-item">
                <span>Weight Phase</span>
                <strong>{formatStatusLabel(sensorSnapshot?.weight?.phase || "idle")}</strong>
              </div>
              <div className="admin-measure-item">
                <span>Height Phase</span>
                <strong>{formatStatusLabel(sensorSnapshot?.height?.phase || "idle")}</strong>
              </div>
              <div className="admin-measure-item">
                <span>Measurement Locked</span>
                <strong>{measurementLocked ? "Yes" : "No"}</strong>
              </div>
              <div className="admin-measure-item">
                <span>Serial Port</span>
                <strong>{sensorSnapshot?.weight?.serialPort || sensorSnapshot?.height?.serialPort || "--"}</strong>
              </div>
            </div>
            <p className="admin-empty">
              {sensorSnapshot?.weight?.statusMessage || sensorSnapshot?.height?.statusMessage || "Waiting for live sensor data."}
            </p>
          </div>

          <h3 className="admin-history-title">Weight Calibration</h3>
          <div className="admin-calibration-card">
            <div className="admin-calibration-grid">
              <div className="admin-measure-item">
                <span>Live Weight</span>
                <strong>{weightCalibration?.liveWeightKg != null ? `${weightCalibration.liveWeightKg} kg` : "--"}</strong>
              </div>
              <div className="admin-measure-item">
                <span>Raw Live Weight</span>
                <strong>{weightCalibration?.rawLiveWeightKg != null ? `${weightCalibration.rawLiveWeightKg} kg` : "--"}</strong>
              </div>
              <div className="admin-measure-item">
                <span>Offset</span>
                <strong>{weightCalibration?.offsetKg != null ? `${weightCalibration.offsetKg} kg` : "--"}</strong>
              </div>
              <div className="admin-measure-item">
                <span>Source</span>
                <strong>{weightCalibration?.offsetSource || "--"}</strong>
              </div>
            </div>

            <p className="admin-empty">
              1. Leave the scale empty and press Tare. 2. Place a known test weight and press Apply Reference.
            </p>

            <label className="admin-calibration-field">
              <span>Known Weight (kg)</span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={knownWeightKg}
                onChange={(event) => setKnownWeightKg(event.target.value)}
                disabled={calibrationBusy}
              />
            </label>

            <div className="admin-calibration-actions">
              <button
                className="btn btn-primary"
                onClick={() => runCalibrationAction(() => tareWeightCalibration())}
                disabled={calibrationBusy}
              >
                Tare Empty Scale
              </button>
              <button
                className="btn"
                onClick={() => runCalibrationAction(() => applyWeightReferenceCalibration(Number(knownWeightKg)))}
                disabled={calibrationBusy}
              >
                Apply Reference
              </button>
            </div>

            <label className="admin-calibration-field">
              <span>Manual Offset (kg)</span>
              <input
                type="number"
                step="0.0001"
                value={manualOffsetKg}
                onChange={(event) => setManualOffsetKg(event.target.value)}
                disabled={calibrationBusy}
              />
            </label>

            <div className="admin-calibration-actions">
              <button
                className="btn"
                onClick={() => runCalibrationAction(() => setWeightCalibrationOffset(Number(manualOffsetKg)))}
                disabled={calibrationBusy}
              >
                Save Manual Offset
              </button>
              <button
                className="btn"
                onClick={() => runCalibrationAction(() => getWeightCalibrationStatus())}
                disabled={calibrationBusy}
              >
                Refresh
              </button>
            </div>

            {calibrationMessage ? <p className="message-ok">{calibrationMessage}</p> : null}
            {calibrationError ? <p className="message-warning">{calibrationError}</p> : null}
          </div>

          <h3 className="admin-history-title">ToF Calibration</h3>
          <div className="admin-calibration-card">
            <div className="admin-calibration-grid">
              <div className="admin-measure-item">
                <span>Raw Distance</span>
                <strong>{heightCalibration?.rawDistanceCm != null ? `${heightCalibration.rawDistanceCm} cm` : "--"}</strong>
              </div>
              <div className="admin-measure-item">
                <span>Live Height</span>
                <strong>{heightCalibration?.liveHeightCm != null ? `${heightCalibration.liveHeightCm} cm` : "--"}</strong>
              </div>
              <div className="admin-measure-item">
                <span>Platform Distance</span>
                <strong>{heightCalibration?.sensorToPlatformCm != null ? `${heightCalibration.sensorToPlatformCm} cm` : "--"}</strong>
              </div>
              <div className="admin-measure-item">
                <span>Offset</span>
                <strong>{heightCalibration?.offsetCm != null ? `${heightCalibration.offsetCm} cm` : "--"}</strong>
              </div>
            </div>

            <p className="admin-empty">
              1. Measure the sensor-to-platform distance. 2. Stand a person with known height under the ToF sensor. 3. Apply reference.
            </p>

            <label className="admin-calibration-field">
              <span>Sensor to Platform (cm)</span>
              <input
                type="number"
                min="1"
                step="0.1"
                value={sensorToPlatformCm}
                onChange={(event) => setSensorToPlatformCm(event.target.value)}
                disabled={calibrationBusy}
              />
            </label>

            <div className="admin-calibration-actions">
              <button
                className="btn"
                onClick={() => runCalibrationAction(() => setHeightSensorToPlatform(Number(sensorToPlatformCm)))}
                disabled={calibrationBusy}
              >
                Save Platform Distance
              </button>
            </div>

            <label className="admin-calibration-field">
              <span>Known Height (cm)</span>
              <input
                type="number"
                min="1"
                step="0.1"
                value={knownHeightCm}
                onChange={(event) => setKnownHeightCm(event.target.value)}
                disabled={calibrationBusy}
              />
            </label>

            <div className="admin-calibration-actions">
              <button
                className="btn btn-primary"
                onClick={() => runCalibrationAction(() => applyHeightReferenceCalibration(Number(knownHeightCm)))}
                disabled={calibrationBusy}
              >
                Apply Height Reference
              </button>
            </div>

            <label className="admin-calibration-field">
              <span>Manual Offset (cm)</span>
              <input
                type="number"
                step="0.0001"
                value={manualHeightOffsetCm}
                onChange={(event) => setManualHeightOffsetCm(event.target.value)}
                disabled={calibrationBusy}
              />
            </label>

            <div className="admin-calibration-actions">
              <button
                className="btn"
                onClick={() => runCalibrationAction(() => setHeightCalibrationOffset(Number(manualHeightOffsetCm)))}
                disabled={calibrationBusy}
              >
                Save Manual Offset
              </button>
              <button
                className="btn"
                onClick={() => runCalibrationAction(() => getHeightCalibrationStatus())}
                disabled={calibrationBusy}
              >
                Refresh
              </button>
            </div>
          </div>

          <h3 className="admin-history-title">Offline Sync</h3>
          <div className="admin-calibration-card">
            <div className="admin-measure-grid">
              <div className="admin-measure-item">
                <span>Queued Records</span>
                <strong>{offlineQueueCount}</strong>
              </div>
            </div>
            {(syncMessage || syncError) && (
              <p className={`admin-calibration-message ${syncError ? "admin-error" : ""}`}>
                {syncError || syncMessage}
              </p>
            )}
            <button
              className="btn btn-primary admin-calibration-btn"
              onClick={runOfflineSync}
              disabled={syncBusy}
            >
              {syncBusy ? "Syncing..." : "Sync Offline Records"}
            </button>
          </div>

          <h3 className="admin-history-title">Offline Users</h3>
          <div className="admin-history-list">
            {offlineUsers.length === 0 ? (
              <p className="admin-empty">No offline users cached.</p>
            ) : (
              offlineUsers.map((entry) => (
                <div className="admin-history-item" key={entry.id}>
                  <div className="admin-history-row">
                    <strong>{entry.name || "Unknown User"}</strong>
                    <span>User ID {entry.id}</span>
                  </div>
                  <span>Queued: {entry.queuedCount} • Measurements: {entry.measurementsCount}</span>
                  <span>
                    Latest: {entry.latest ? `${entry.latest.weightKg ?? "--"} kg / ${entry.latest.heightCm ?? "--"} cm / BMI ${entry.latest.bmi ?? "--"}` : "--"}
                    {entry.latest?.capturedAt ? ` • ${formatDateTime(entry.latest.capturedAt)}` : ""}
                  </span>
                </div>
              ))
            )}
          </div>

          <h3 className="admin-history-title">Recent Changes</h3>
          <div className="admin-history-list">
            {history.length === 0 ? (
              <p className="admin-empty">No monitoring history yet.</p>
            ) : (
              history.slice(0, 8).map((entry) => (
                <div className="admin-history-item" key={entry.id}>
                  <strong>{formatDateTime(entry.capturedAt || entry.archivedAt)}</strong>
                  <span>{formatStatusLabel(entry.overall)} • {entry.mode === "online" ? "Online" : "Offline"}</span>
                </div>
              ))
            )}
          </div>

          <h3 className="admin-history-title">Delete User Records</h3>
          <div className="admin-calibration-card">
            <p className="admin-empty">
              Deletes the face profile, Firebase records, and cached measurements for a user ID.
            </p>
            <label className="admin-calibration-field">
              <span>User ID</span>
              <input
                type="text"
                value={deleteUserId}
                onChange={(event) => setDeleteUserId(event.target.value)}
                disabled={deleteBusy}
                placeholder="e.g. 50445"
              />
            </label>
            <div className="admin-calibration-actions">
              <button className="btn btn-danger" onClick={runDeleteUser} disabled={deleteBusy}>
                Delete User
              </button>
            </div>
            {deleteMessage ? <p className="message-ok">{deleteMessage}</p> : null}
            {deleteError ? <p className="message-warning">{deleteError}</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
