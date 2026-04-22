import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, Heart, Scale } from "lucide-react";
import IntroPage from "./pages/IntroPage";
import RemindersPage from "./pages/RemindersPage";
import TermsPage from "./pages/TermsPage";
import FullNamePage from "./pages/FullNamePage";
import AgePage from "./pages/AgePage";
import SexPage from "./pages/SexPage";
import CameraPage from "./pages/CameraPage";
import IdentityConfirmPage from "./pages/IdentityConfirmPage";
import MeasurePage from "./pages/MeasurePage";
import SavingPage from "./pages/SavingPage";
import ResultPage from "./pages/ResultPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import { readHeightCm, readWeightKg, resetSensorSession } from "./services/sensors";
import { saveMeasurement, upsertUserProfile, getUserMeasurements, getUserProfile, flushPendingFirebaseWrites } from "./services/firestore";
import { captureFrame, checkLiveness, checkPoseMetrics, checkRestrictions, deleteFaceUser, getFaceStatus, identifyFace, registerFace } from "./services/face";
import AdminPage from "./pages/AdminPage";
import { collectAndSyncSystemMonitor } from "./services/systemMonitor";
import { computeBmiAssessment } from "./services/bmi";

function randomUser() {
  return {
    id: String(Math.floor(10000 + Math.random() * 90000)),
    name: "",
    age: null,
    sex: "",
    password: "12345",
    mustResetPassword: true,
    weightKg: null,
    heightCm: null,
    bmi: null,
    category: null,
  };
}

function computeBmi(weightKg, heightCm, age, sex) {
  const assessment = computeBmiAssessment({ weightKg, heightCm, age, sex });
  return {
    bmi: assessment.bmi,
    category: assessment.category,
  };
}

function newUserFormDefaults() {
  return { firstName: "", middleInitial: "", lastName: "", age: "", sex: "" };
}

function composeFullName(form) {
  const first = String(form?.firstName ?? "").trim();
  const mi = String(form?.middleInitial ?? "").trim();
  const last = String(form?.lastName ?? "").trim();
  const middleInitial = mi ? `${mi.replace(/\./g, "")}.` : "";
  return [first, middleInitial, last].filter(Boolean).join(" ").replace(/\s{2,}/g, " ").trim();
}

const PREVIEW_SCREENS = new Set([
  "welcome",
  "terms",
  "reminders",
  "full-name",
  "age",
  "sex",
  "registration",
  "identification",
  "identity-confirm",
  "weight",
  "height",
  "saving",
  "result",
  "analytics",
]);

function getPreviewScreen(queryParams) {
  const requested = String(queryParams.get("screen") || "").trim().toLowerCase();
  return PREVIEW_SCREENS.has(requested) ? requested : "welcome";
}

function buildPreviewUser() {
  return {
    id: "48291",
    name: "Juan Dela Cruz",
    age: 23,
    sex: "Male",
    password: "12345",
    mustResetPassword: true,
    weightKg: 64.5,
    heightCm: 171,
    bmi: 22.1,
    category: "Normal",
  };
}

function buildRegistrationPoses(count) {
  const normalizedCount = Math.max(3, Math.min(6, Number(count) || 5));
  const poses = [
    { pose: "Center", instruction: "Look straight at the camera." },
    { pose: "Turn Left", instruction: "Turn your face slightly left." },
    { pose: "Turn Right", instruction: "Turn your face slightly right." },
  ];

  if (normalizedCount >= 4) {
    poses.push({ pose: "Look Up", instruction: "Tilt your face slightly up." });
  }
  if (normalizedCount >= 5) {
    poses.push({ pose: "Look Down", instruction: "Tilt your face slightly down." });
  }
  if (normalizedCount >= 6) {
    poses.push({ pose: "Blink", instruction: "Blink once and keep your face centered." });
  }

  return poses;
}

export default function App() {
  const queryParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const isAdminView = queryParams.get("view") === "admin" || queryParams.get("admin") === "1";
  const isPreviewMode = queryParams.get("preview") === "1";
  const previewScreen = getPreviewScreen(queryParams);
  const previewCameraTone = String(queryParams.get("cameraTone") || queryParams.get("tone") || "info").toLowerCase();
  const previewCameraPose = String(queryParams.get("pose") || "Center");
  const previewMeasureTone = String(queryParams.get("measureTone") || "incomplete").toLowerCase();
  const [mode, setMode] = useState("registration");
  const [returnToStartAfterSave, setReturnToStartAfterSave] = useState(false);
  const RETURN_TO_MENU_SECONDS = 10;
  const MEASURE_AUTO_NEXT_SECONDS = 1;
  const MEASURE_CAPTURE_WINDOW_SECONDS = mode === "registration" ? 5 : 3;
  const MEASURE_CAPTURE_WINDOW_MS = MEASURE_CAPTURE_WINDOW_SECONDS * 1000;
  const SENSOR_FRONTEND_CONFIRM_MS = Number(import.meta.env.VITE_SENSOR_FRONTEND_CONFIRM_MS ?? 350);
  const WEIGHT_MEASURE_MAX_TOTAL_MS = Number(import.meta.env.VITE_WEIGHT_MEASURE_MAX_TOTAL_MS ?? 4500);
  const HEIGHT_MEASURE_MAX_TOTAL_MS = Number(import.meta.env.VITE_HEIGHT_MEASURE_MAX_TOTAL_MS ?? 5500);
  const MAX_SENSOR_RETRIES = 5;
  const SYSTEM_MONITOR_POLL_MS = Number(import.meta.env.VITE_SYSTEM_MONITOR_POLL_MS ?? 15000);
  const BASIC_FACE_FLOW = String(import.meta.env.VITE_BASIC_FACE_FLOW ?? "true").toLowerCase() === "true";
  const CAMERA_LOOP_MIN_INTERVAL_MS = 320;
  const CAMERA_CHECK_RESTRICTIONS_EVERY = 3;
  const CAMERA_CHECK_LIVENESS_EVERY = 4;
  const CAMERA_FRAME_CAPTURE_OPTIONS = { maxWidth: 640, maxHeight: 480, quality: 0.75 };
  const REGISTRATION_FRAME_CAPTURE_OPTIONS = { maxWidth: 720, maxHeight: 540, quality: 0.8 };
  const REGISTRATION_STEP_SETTLE_MS = Number(import.meta.env.VITE_FACE_REGISTRATION_STEP_SETTLE_MS ?? 750);
  const REGISTRATION_POSE_HINT_DELAY_MS = Number(import.meta.env.VITE_FACE_REGISTRATION_POSE_HINT_DELAY_MS ?? 320);
  const REGISTRATION_CENTER_YAW_TOLERANCE = Number(import.meta.env.VITE_FACE_REGISTRATION_CENTER_YAW_TOLERANCE ?? 0.42);
  const REGISTRATION_TURN_YAW_MIN_DELTA = Number(import.meta.env.VITE_FACE_REGISTRATION_TURN_YAW_MIN_DELTA ?? 0.018);
  const REGISTRATION_TILT_PITCH_MIN_DELTA = Number(import.meta.env.VITE_FACE_REGISTRATION_TILT_PITCH_MIN_DELTA ?? 0.007);
  const REGISTRATION_LOOK_DOWN_PITCH_MIN_DELTA = Number(import.meta.env.VITE_FACE_REGISTRATION_LOOK_DOWN_PITCH_MIN_DELTA ?? 0.004);
  const REGISTRATION_POSE_COUNT = Number(import.meta.env.VITE_FACE_REGISTRATION_POSE_COUNT ?? 5);
  const BASIC_REGISTRATION_SAMPLE_TARGET = Number(import.meta.env.VITE_FACE_REGISTER_SAMPLE_TARGET ?? 6);
  const BASIC_REGISTRATION_SAMPLE_DELAY_MS = 180;
  const BASIC_IDENTIFY_REQUIRED_VOTES = Number(import.meta.env.VITE_FACE_IDENTIFY_REQUIRED_VOTES ?? 2);
  const BASIC_IDENTIFY_MAX_NO_MATCH_RETRIES = Number(import.meta.env.VITE_FACE_IDENTIFY_MAX_NO_MATCH_RETRIES ?? 2);
  const BASIC_IDENTIFY_CLOSE_MATCH_RETRIES = Number(import.meta.env.VITE_FACE_IDENTIFY_CLOSE_MATCH_RETRIES ?? 1);
  const FACE_IDENTIFY_STRONG_MATCH_MAX_DISTANCE = Number(import.meta.env.VITE_FACE_IDENTIFY_STRONG_MATCH_MAX_DISTANCE ?? 0.4);
  const FACE_IDENTIFY_SINGLE_USER_MAX_DISTANCE = Number(import.meta.env.VITE_FACE_IDENTIFY_SINGLE_USER_MAX_DISTANCE ?? 0.32);
  const REGISTRATION_POSES = buildRegistrationPoses(REGISTRATION_POSE_COUNT);
  const [screen, setScreen] = useState(() => (isPreviewMode ? previewScreen : "welcome"));
  const [agreeTerms, setAgreeTerms] = useState(() => isPreviewMode);
  const [user, setUser] = useState(() => (isPreviewMode ? buildPreviewUser() : randomUser()));
  const [newUserForm, setNewUserForm] = useState(() => (isPreviewMode
    ? {
        firstName: "Juan",
        middleInitial: "P",
        lastName: "Dela Cruz",
        age: "23",
        sex: "Male",
      }
    : newUserFormDefaults()));
  const [cameraMessage, setCameraMessage] = useState(() => {
    if (!isPreviewMode) return "Align your face in the camera.";
    if (previewCameraTone === "success") return "Existing record loaded.";
    if (previewCameraTone === "error") return "Cannot reach face service. Start backend and press Retry.";
    return "Align your face in the camera.";
  });
  const [cameraProgress, setCameraProgress] = useState(() => (isPreviewMode && previewCameraTone === "success" ? 100 : 0));
  const [cameraPose, setCameraPose] = useState(() => (isPreviewMode ? previewCameraPose : "Align your face"));
  const [cameraReturnMessage, setCameraReturnMessage] = useState(() => (isPreviewMode ? "Preview mode" : ""));
  const [cameraCanRetry, setCameraCanRetry] = useState(() => isPreviewMode && previewCameraTone === "error");
  const [cameraPopup, setCameraPopup] = useState(() => {
    if (!isPreviewMode) return null;
    if (previewCameraTone === "success") return { tone: "success", title: "User Recognized", detail: "Existing record loaded." };
    if (previewCameraTone === "error") return { tone: "error", title: "Connection Error", detail: "Cannot reach face service. Start backend and press Retry." };
    if (previewCameraTone === "register") {
      return { tone: "error", title: "Not Registered Yet?", detail: "No matching face profile found.", actionLabel: "Register", action: "register" };
    }
    return null;
  });
  const [cameraRunId, setCameraRunId] = useState(0);
  const [weightStatus, setWeightStatus] = useState(() => (isPreviewMode
    ? (previewMeasureTone === "done" ? "Weight captured." : (previewMeasureTone === "error" ? "Weight measurement failed." : "Preparing scale. Please wait."))
    : "Scale booting..."));
  const [weightStatusType, setWeightStatusType] = useState(() => (isPreviewMode && ["done", "error"].includes(previewMeasureTone) ? previewMeasureTone : "incomplete"));
  const [weightStatusLabel, setWeightStatusLabel] = useState(() => (isPreviewMode ? previewMeasureTone.toUpperCase() : "INCOMPLETE"));
  const [weightReturnMessage, setWeightReturnMessage] = useState(() => (isPreviewMode ? "Preview mode" : ""));
  const [weightRetryCount, setWeightRetryCount] = useState(0);
  const [weightRunId, setWeightRunId] = useState(0);
  const [weightCaptureSecondsLeft, setWeightCaptureSecondsLeft] = useState(() => (isPreviewMode ? MEASURE_CAPTURE_WINDOW_MS / 1000 : 0));
  const [weightAlertTitle, setWeightAlertTitle] = useState("");
  const [weightAlertMessage, setWeightAlertMessage] = useState("");
  const [heightStatus, setHeightStatus] = useState(() => (isPreviewMode
    ? (previewMeasureTone === "done" ? "Height captured." : (previewMeasureTone === "error" ? "Height measurement failed." : "Stand under sensor."))
    : "Height scan booting..."));
  const [heightStatusType, setHeightStatusType] = useState(() => (isPreviewMode && ["done", "error"].includes(previewMeasureTone) ? previewMeasureTone : "incomplete"));
  const [heightStatusLabel, setHeightStatusLabel] = useState(() => (isPreviewMode ? previewMeasureTone.toUpperCase() : "INCOMPLETE"));
  const [heightReturnMessage, setHeightReturnMessage] = useState(() => (isPreviewMode ? "Preview mode" : ""));
  const [heightRetryCount, setHeightRetryCount] = useState(0);
  const [heightRunId, setHeightRunId] = useState(0);
  const [heightCaptureSecondsLeft, setHeightCaptureSecondsLeft] = useState(() => (isPreviewMode ? MEASURE_CAPTURE_WINDOW_MS / 1000 : 0));
  const [heightAlertTitle, setHeightAlertTitle] = useState("");
  const [heightAlertMessage, setHeightAlertMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState(() => (isPreviewMode ? "Preview save state" : "Syncing to cloud..."));
  const [saveTitle, setSaveTitle] = useState(() => (isPreviewMode ? "Preview Save" : "Syncing"));
  const [connection, setConnection] = useState(() => (isPreviewMode ? "offline" : "online"));
  const [sensorState, setSensorState] = useState(() => (isPreviewMode ? "active" : "offline"));
  const [timerBadge, setTimerBadge] = useState(() => (isPreviewMode ? "Preview Mode" : "Session Active"));
  const [footerHint, setFooterHint] = useState(() => (isPreviewMode ? "Screen preview only" : "Touchscreen enabled"));
  const [resultHistory, setResultHistory] = useState([]);
  const autoTimersRef = useRef([]);
  const weightRequestAbortRef = useRef(null);
  const heightRequestAbortRef = useRef(null);
  const weightAlertTimeoutRef = useRef(null);
  const heightAlertTimeoutRef = useRef(null);
  const cameraRequestAbortRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const enrollmentFaceRegisteredRef = useRef(false);
  const enrollmentFinalizedRef = useRef(false);
  const savedResultKeyRef = useRef("");
  const guestRegistrationSnapshotRef = useRef(null);

  const clearTimers = () => {
    autoTimersRef.current.forEach((id) => {
      clearTimeout(id);
      clearInterval(id);
    });
    autoTimersRef.current = [];
  };
  const queue = (fn, ms) => {
    const id = setTimeout(fn, ms);
    autoTimersRef.current.push(id);
  };

  const showMeasureAlert = (kind, title, message) => {
    if (kind === "weight") {
      if (weightAlertTimeoutRef.current) clearTimeout(weightAlertTimeoutRef.current);
      setWeightAlertTitle(title);
      setWeightAlertMessage(message);
      weightAlertTimeoutRef.current = setTimeout(() => {
        setWeightAlertTitle("");
        setWeightAlertMessage("");
        weightAlertTimeoutRef.current = null;
      }, 3000);
      return;
    }

    if (heightAlertTimeoutRef.current) clearTimeout(heightAlertTimeoutRef.current);
    setHeightAlertTitle(title);
    setHeightAlertMessage(message);
    heightAlertTimeoutRef.current = setTimeout(() => {
      setHeightAlertTitle("");
      setHeightAlertMessage("");
      heightAlertTimeoutRef.current = null;
    }, 3000);
  };

  const startReturnToMenuCountdown = (kind) => {
    let seconds = RETURN_TO_MENU_SECONDS;
    const setMessage = (remaining) => {
      const text = `Returning to menu in ${remaining} seconds`;
      if (kind === "Weight") setWeightReturnMessage(text);
      else setHeightReturnMessage(text);
    };

    setMessage(seconds);
    const intervalId = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        clearInterval(intervalId);
        setScreen("welcome");
        return;
      }
      setMessage(seconds);
    }, 1000);
    autoTimersRef.current.push(intervalId);
  };

  const startCameraReturnToMenuCountdown = () => {
    let seconds = RETURN_TO_MENU_SECONDS;
    setCameraReturnMessage(`Returning to menu in ${seconds} seconds`);
    const intervalId = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        clearInterval(intervalId);
        setScreen("welcome");
        return;
      }
      setCameraReturnMessage(`Returning to menu in ${seconds} seconds`);
    }, 1000);
    autoTimersRef.current.push(intervalId);
  };

  const startMeasureAutoNextCountdown = (kind, nextScreen) => {
    let seconds = MEASURE_AUTO_NEXT_SECONDS;
    const setMessage = (remaining) => {
      const text = `Next in ${remaining} seconds`;
      if (kind === "Weight") setWeightReturnMessage(text);
      else setHeightReturnMessage(text);
    };
    setMessage(seconds);
    const intervalId = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        clearInterval(intervalId);
        setScreen(nextScreen);
        return;
      }
      setMessage(seconds);
    }, 1000);
    autoTimersRef.current.push(intervalId);
  };

  const getSensorErrorTag = (error) => {
    const msg = String(error?.message || "").toLowerCase();
    if (msg.includes("timed out")) return "TIMEOUT";
    if (msg.includes("connect")) return "CONNECTION";
    if (msg.includes("http")) return "SENSOR API";
    return "SENSOR";
  };
  const isSensorUnstableError = (error) => String(error?.message || "").toLowerCase().includes("still unstable");
  const isSensorWaitingError = (error) => {
    const msg = String(error?.message || "").toLowerCase();
    return msg.includes("no live data yet") || msg.includes("data stopped");
  };

  const applyMeasurePhase = (phase, statusMessage, kind) => {
    const normalizedPhase = String(phase || "").toLowerCase();
    const message = statusMessage || (kind === "weight" ? "Stand straight and hold still on the scale." : "Stand straight under the sensor and hold still.");

    if (kind === "weight") {
      let nextMessage = message;
      if (normalizedPhase === "person_detected" || normalizedPhase === "measuring") {
        nextMessage = "Stand straight on the scale and hold still.";
      } else if (normalizedPhase === "stabilizing") {
        nextMessage = "Almost there. Stand straight and do not move.";
      }
      setWeightStatus(nextMessage);
      if (normalizedPhase === "locked") {
        setWeightStatusType("done");
        setWeightStatusLabel("DONE");
      } else {
        setWeightStatusType("incomplete");
        setWeightStatusLabel(normalizedPhase === "stabilizing" ? "HOLD STILL" : "MEASURING");
      }
      return;
    }

    let nextMessage = message;
    if (normalizedPhase === "person_detected" || normalizedPhase === "measuring") {
      nextMessage = "Stand straight under the sensor and hold still.";
    } else if (normalizedPhase === "stabilizing") {
      nextMessage = "Almost there. Keep your head straight and do not move.";
    }
    setHeightStatus(nextMessage);
    if (normalizedPhase === "locked") {
      setHeightStatusType("done");
      setHeightStatusLabel("DONE");
    } else {
      setHeightStatusType("incomplete");
      setHeightStatusLabel(normalizedPhase === "stabilizing" ? "HOLD STILL" : "MEASURING");
    }
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const getDetectedFaceCount = (error) => {
    const msg = String(error?.message || "");
    const match = msg.match(/found\s+(\d+)/i);
    if (!match) return null;
    const count = Number(match[1]);
    return Number.isFinite(count) ? count : null;
  };
  const isNetworkFaceError = (error) => {
    const msg = String(error?.message || "").toLowerCase();
    return (
      msg.includes("failed to fetch")
      || msg.includes("timed out")
      || msg.includes("could not connect")
      || msg.includes("http 5")
      || msg.includes("server unavailable")
    );
  };
  const isFatalFaceServiceError = (error) => {
    const msg = String(error?.message || "").toLowerCase();
    return (
      msg.includes("dependencies missing")
      || msg.includes("dependency missing")
      || msg.includes("install numpy")
      || msg.includes("face_recognition")
      || msg.includes("face recognition dependencies")
      || msg.includes("model package is missing")
    );
  };
  const isInsufficientSampleError = (error) => {
    const msg = String(error?.message || "").toLowerCase();
    return msg.includes("need at least") && msg.includes("valid face samples");
  };

  const formatRestrictionMessage = (blockedLabels) => {
    if (!Array.isArray(blockedLabels) || blockedLabels.length === 0) {
      return "Align your face in the camera.";
    }
    const mapLabelToInstruction = (label) => {
      const t = String(label || "").toLowerCase();
      if (t.includes("mask")) return "Remove your face mask.";
      if (t.includes("cap")) return "Remove your cap.";
      if (t.includes("bag")) return "Remove your bag.";
      if (t.includes("glass")) return "Remove your glasses.";
      if (t.includes("shoe")) return "Remove your shoes.";
      if (t.includes("heavy")) return "No heavy item.";
      return `Remove your ${String(label || "restricted item").toLowerCase()}.`;
    };
    return blockedLabels.map(mapLabelToInstruction).join(" ");
  };
  const isAlreadyEnrolledError = (error) =>
    String(error?.message || "").toLowerCase().includes("user already enrolled");
  const isTooSimilarEnrollmentError = (error) =>
    String(error?.message || "").toLowerCase().includes("too similar to an existing enrollment");

  const waitForVideoReady = async (signal, timeoutMs = 8000) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (signal?.aborted) throw new Error("Camera request cancelled");
      const video = cameraVideoRef.current;
      if (video && video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
        return video;
      }
      await sleep(100);
    }
    throw new Error("Camera not ready");
  };

  const identifyWithConsensus = async (signal, firstFrameImageData, enrolledUserCount = 0) => {
    const requiredVotes = enrolledUserCount <= 1
      ? Math.max(1, BASIC_IDENTIFY_REQUIRED_VOTES)
      : Math.max(2, BASIC_IDENTIFY_REQUIRED_VOTES - 1);
    const maxFrames = Math.max(5, requiredVotes + 2);
    const votes = new Map();
    let lastError = null;
    const maxAcceptedDistance = enrolledUserCount <= 1
      ? FACE_IDENTIFY_SINGLE_USER_MAX_DISTANCE
      : FACE_IDENTIFY_STRONG_MATCH_MAX_DISTANCE;

    const registerVote = (result) => {
      if (!result?.matched || !result?.userId) return null;
      if (!Number.isFinite(result.distance) || Number(result.distance) > maxAcceptedDistance) return null;
      if (Number(result.distance) <= Math.max(0.18, maxAcceptedDistance - 0.08)) {
        return { userId: String(result.userId), name: result.name || "" };
      }
      const key = String(result.userId);
      const current = votes.get(key) || { count: 0, name: result.name || "", distances: [] };
      current.count += 1;
      if (Number.isFinite(result.distance)) current.distances.push(Number(result.distance));
      votes.set(key, current);
      if (current.count >= requiredVotes) {
        return { userId: key, name: current.name };
      }
      return null;
    };

    for (let i = 0; i < maxFrames; i += 1) {
      if (signal?.aborted) throw new Error("Camera request cancelled");
      let imageData = firstFrameImageData;
      if (i > 0) {
        await sleep(180);
        const video = await waitForVideoReady(signal, 1500);
        imageData = captureFrame(video, CAMERA_FRAME_CAPTURE_OPTIONS);
      }

      try {
        const result = await identifyFace({ imageData }, signal);
        const winner = registerVote(result);
        if (winner) return { matched: true, ...winner };
        lastError = null;
      } catch (error) {
        if (signal?.aborted) throw error;
        lastError = error;
      }
    }

    if (lastError) throw lastError;
    return { matched: false, reason: "consensus_not_reached" };
  };

  const captureRegistrationSamples = async (signal) => {
    if (BASIC_FACE_FLOW) {
      const target = Math.max(5, BASIC_REGISTRATION_SAMPLE_TARGET);
      const samples = [];
      for (let i = 0; i < target; i += 1) {
        if (signal?.aborted) throw new Error("Camera request cancelled");
        setCameraProgress(38 + Math.floor((i / target) * 42));
        setCameraPose("Center");
        setCameraMessage(`Hold still. Capturing face sample ${i + 1}/${target}...`);
        if (i > 0) await sleep(BASIC_REGISTRATION_SAMPLE_DELAY_MS);
        const video = await waitForVideoReady(signal, 1500);
        const imageData = captureFrame(video, REGISTRATION_FRAME_CAPTURE_OPTIONS);
        try {
          await checkPoseMetrics({ imageData }, signal);
          samples.push(imageData);
        } catch (error) {
          if (signal?.aborted) throw error;
          const faces = getDetectedFaceCount(error);
          if (faces === 0) {
            setCameraMessage("No face detected. Center your face and try again.");
          } else if (faces > 1) {
            setCameraMessage("Only one person should be in the camera.");
          } else {
            setCameraMessage("Hold still and keep your full face visible.");
          }
          await sleep(220);
          i -= 1;
        }
      }
      return samples;
    }

    const samples = [];
    const maxAttemptsPerPose = 12;
    let baselineYaw = null;
    let baselinePitch = null;
    let horizontalTurnSign = 0;
    let verticalTurnSign = 0;
    for (let i = 0; i < REGISTRATION_POSES.length; i += 1) {
      const step = REGISTRATION_POSES[i];
      let captured = false;

      for (let attempt = 1; attempt <= maxAttemptsPerPose; attempt += 1) {
        if (signal?.aborted) throw new Error("Camera request cancelled");
        const progressBase = 40 + Math.floor((i / REGISTRATION_POSES.length) * 35);
        setCameraProgress(progressBase);
        setCameraPose(step.pose);
        setCameraMessage(step.instruction);
        await sleep(REGISTRATION_STEP_SETTLE_MS);

        try {
          const video = await waitForVideoReady(signal, 1500);
          const imageData = captureFrame(video, REGISTRATION_FRAME_CAPTURE_OPTIONS);
          const pose = await checkPoseMetrics({ imageData }, signal);
          const yaw = Number(pose?.yaw ?? 0);
          const pitch = Number(pose?.pitch ?? 0);
          const dYaw = baselineYaw == null ? 0 : yaw - baselineYaw;
          const dPitch = baselinePitch == null ? 0 : pitch - baselinePitch;

          if (step.pose === "Center") {
            if (Math.abs(yaw) > REGISTRATION_CENTER_YAW_TOLERANCE) {
              setCameraMessage("Center your face before continuing.");
              await sleep(REGISTRATION_POSE_HINT_DELAY_MS);
              continue;
            }
            baselineYaw = yaw;
            baselinePitch = pitch;
          } else if (step.pose === "Turn Left") {
            if (Math.abs(dYaw) < REGISTRATION_TURN_YAW_MIN_DELTA) {
              setCameraMessage("Please turn your face more to the left.");
              await sleep(REGISTRATION_POSE_HINT_DELAY_MS);
              continue;
            }
            horizontalTurnSign = Math.sign(dYaw) || 1;
          } else if (step.pose === "Turn Right") {
            if (Math.abs(dYaw) < REGISTRATION_TURN_YAW_MIN_DELTA) {
              setCameraMessage("Please turn your face more to the right.");
              await sleep(REGISTRATION_POSE_HINT_DELAY_MS);
              continue;
            }
            if (horizontalTurnSign !== 0 && Math.sign(dYaw) === horizontalTurnSign) {
              setCameraMessage("Now turn to the opposite side for the right pose.");
              await sleep(REGISTRATION_POSE_HINT_DELAY_MS);
              continue;
            }
          } else if (step.pose === "Look Up") {
            if (Math.abs(dPitch) < REGISTRATION_TILT_PITCH_MIN_DELTA) {
              setCameraMessage("Please tilt your face up more.");
              await sleep(REGISTRATION_POSE_HINT_DELAY_MS);
              continue;
            }
            verticalTurnSign = Math.sign(dPitch) || 1;
          } else if (step.pose === "Look Down") {
            if (Math.abs(dPitch) < REGISTRATION_LOOK_DOWN_PITCH_MIN_DELTA) {
              setCameraMessage("Please tilt your face down more.");
              await sleep(REGISTRATION_POSE_HINT_DELAY_MS);
              continue;
            }
          } else if (step.pose === "Blink") {
            if (!pose?.blinkDetected) {
              setCameraMessage("Blink once to continue.");
              await sleep(REGISTRATION_POSE_HINT_DELAY_MS);
              continue;
            }
          }

          samples.push(imageData);
          captured = true;
          break;
        } catch (error) {
          if (signal?.aborted) throw error;
          const faces = getDetectedFaceCount(error);
          if (faces === 0) {
            setCameraMessage("No face detected. Align and retry.");
          } else if (faces > 1) {
            setCameraMessage("Multiple faces detected. Keep only one person.");
          } else {
            setCameraMessage("Hold still and keep your face in frame.");
          }
          await sleep(500);
        }
      }

      if (!captured) {
        throw new Error(`Could not capture a valid ${step.pose} sample.`);
      }
    }
    return samples;
  };

  const discardIncompleteEnrollment = async () => {
    if (mode !== "registration") return;
    if (!enrollmentFaceRegisteredRef.current) return;
    if (enrollmentFinalizedRef.current) return;

    const userId = String(user?.id || "").trim();
    enrollmentFaceRegisteredRef.current = false;
    enrollmentFinalizedRef.current = false;
    if (!userId) return;

    try {
      await deleteFaceUser(userId);
    } catch (error) {
      console.error("Failed to discard incomplete enrollment:", error);
    }
  };

  const handleBackToMenuFromMeasure = () => {
    void discardIncompleteEnrollment();
    setScreen("welcome");
  };

  const continueAsGuest = () => {
    setNewUserForm((form) => ({ ...form, age: "", sex: "" }));
    setUser((prev) => ({
      ...prev,
      id: `guest-${Date.now()}`,
      name: "Guest",
      age: null,
      sex: "",
      password: "",
      mustResetPassword: false,
      isGuest: true,
    }));
    setCameraPopup(null);
    setCameraCanRetry(false);
    setCameraReturnMessage("");
    setScreen("age");
  };

  const retryCameraFlow = () => {
    clearTimers();
    cameraRequestAbortRef.current?.abort();
    setCameraCanRetry(false);
    setCameraPopup(null);
    setCameraReturnMessage("");
    setCameraProgress(8);
    setCameraPose("Align your face");
    setCameraMessage("Align your face in the camera.");
    setCameraRunId((prev) => prev + 1);
  };

  const reset = () => {
    clearTimers();
    weightRequestAbortRef.current?.abort();
    heightRequestAbortRef.current?.abort();
    cameraRequestAbortRef.current?.abort();
    weightRequestAbortRef.current = null;
    heightRequestAbortRef.current = null;
    cameraRequestAbortRef.current = null;
    cameraVideoRef.current = null;
    enrollmentFaceRegisteredRef.current = false;
    enrollmentFinalizedRef.current = false;
    savedResultKeyRef.current = "";
    guestRegistrationSnapshotRef.current = null;
    setScreen("welcome");
    setAgreeTerms(false);
    setUser(randomUser());
    setNewUserForm(newUserFormDefaults());
    setResultHistory([]);
    setReturnToStartAfterSave(false);
    setCameraProgress(0);
    setCameraPose("Align your face");
    setCameraReturnMessage("");
    setCameraCanRetry(false);
    setCameraPopup(null);
    setCameraRunId(0);
    setWeightStatusType("incomplete");
    setWeightStatusLabel("INCOMPLETE");
    setWeightReturnMessage("");
    setWeightRetryCount(0);
    setWeightRunId(0);
    setWeightCaptureSecondsLeft(0);
    setHeightStatusType("incomplete");
    setHeightStatusLabel("INCOMPLETE");
    setHeightReturnMessage("");
    setHeightRetryCount(0);
    setHeightRunId(0);
    setHeightCaptureSecondsLeft(0);
    setSaveTitle("Syncing");
    setConnection("online");
    setSensorState("offline");
    setTimerBadge("Session Active");
    setFooterHint("Touchscreen enabled");
  };

  useEffect(() => () => {
    clearTimers();
    weightRequestAbortRef.current?.abort();
    heightRequestAbortRef.current?.abort();
    cameraRequestAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (isPreviewMode) return;
    if (isAdminView) return undefined;

    let mounted = true;
    let controller = new AbortController();

    const runHeartbeat = async () => {
      try {
        await flushPendingFirebaseWrites().catch(() => {});
        const snapshot = await collectAndSyncSystemMonitor(controller.signal);
        if (!mounted) return;
        setConnection("online");
        const sensorComponents = snapshot?.components ?? {};
        const measurements = snapshot?.measurements ?? {};
        const sensorConnected = Boolean(
          sensorComponents?.arduinoUno?.receivingData
          || sensorComponents?.loadCell?.status !== "offline"
          || sensorComponents?.tofSensor?.status !== "offline"
        );
        const sensorActive = Boolean(
          sensorComponents?.arduinoUno?.receivingData
          || sensorComponents?.loadCell?.status === "ok"
          || sensorComponents?.tofSensor?.status === "ok"
          || measurements?.liveWeightKg != null
          || measurements?.liveHeightCm != null
          || measurements?.weightKg != null
          || measurements?.heightCm != null
        );
        setSensorState(sensorActive ? "active" : (sensorConnected ? "ready" : "offline"));
      } catch (error) {
        if (!mounted) return;
        setConnection("offline");
        setSensorState("offline");
        console.error("System monitor heartbeat failed:", error);
      }
    };

    void runHeartbeat();
    const intervalId = setInterval(() => {
      controller.abort();
      controller = new AbortController();
      void runHeartbeat();
    }, Math.max(5000, SYSTEM_MONITOR_POLL_MS));

    return () => {
      mounted = false;
      clearInterval(intervalId);
      controller.abort();
    };
  }, [isAdminView, isPreviewMode, SYSTEM_MONITOR_POLL_MS]);

  useEffect(() => {
    if (isPreviewMode) {
      setFooterHint("Screen preview only");
      return;
    }
    if (screen === "welcome") setFooterHint("Tap Start");
    if (screen === "reminders") setFooterHint("Read reminders");
    if (screen === "terms") setFooterHint("Consent needed");
    if (screen === "identification") setFooterHint("Identifying face");
    if (screen === "identity-confirm") setFooterHint("Confirm profile");
    if (screen === "full-name") setFooterHint("Enter name");
    if (screen === "age") setFooterHint("Enter age");
    if (screen === "sex") setFooterHint("Choose profile");
    if (screen === "analytics") setFooterHint("Health advice");
  }, [screen, isPreviewMode]);

  useEffect(() => {
    if (isPreviewMode) return;
    if (screen !== "reminders") return;
    clearTimers();
    setFooterHint("Preparing measurement");
    queue(() => {
      setMode("identify");
      setScreen("weight");
    }, 3000);
  }, [screen, isPreviewMode]);

  useEffect(() => {
    if (isPreviewMode) return;
    if (screen !== "weight") return;
    setWeightRetryCount(0);
    setWeightRunId(0);
  }, [screen, isPreviewMode]);

  useEffect(() => {
    if (isPreviewMode) return;
    if (screen !== "height") return;
    setHeightRetryCount(0);
    setHeightRunId(0);
  }, [screen, isPreviewMode]);

  useEffect(() => {
    if (isPreviewMode) return;
    if (screen !== "registration" && screen !== "identification") return;
    clearTimers();
    setCameraReturnMessage("");
    setCameraCanRetry(false);
    setCameraPopup(null);
    setFooterHint(screen === "registration" ? "Registering face" : "Identifying face");
    const controller = new AbortController();
    cameraRequestAbortRef.current = controller;
        let restrictionCheckAvailable = true;
        let livenessCheckAvailable = true;
        let registrationBackendFailures = 0;
        let identificationNoMatchStreak = 0;
        let identificationCloseMatchStreak = 0;
        let faceStatus = null;

    (async () => {
      try {
        setCameraProgress(8);
        setCameraPose("Align your face");
        setCameraMessage("Preparing camera...");
        try {
          faceStatus = await getFaceStatus(controller.signal);
          if (controller.signal.aborted) return;
          if (!faceStatus?.ready) {
            setConnection("offline");
            setCameraProgress(100);
            setCameraPose("Service");
            setCameraMessage("Face service is not ready. Please check backend dependencies, then press Retry.");
            setCameraPopup({ tone: "error", title: "Face Service Unavailable", detail: "Check backend dependencies, then press Retry." });
            setCameraCanRetry(true);
            return;
          }
        } catch (error) {
          if (controller.signal.aborted) return;
          setConnection("offline");
          setCameraProgress(100);
          setCameraPose("Connection");
          setCameraMessage("Cannot reach face service. Start backend and press Retry.");
          setCameraPopup({ tone: "error", title: "Connection Error", detail: "Cannot reach face service. Start backend and press Retry." });
          setCameraCanRetry(true);
          return;
        }
        await waitForVideoReady(controller.signal);
        if (controller.signal.aborted) return;
        setCameraProgress(15);
        setCameraPose("Align your face");
        setCameraMessage("Align your face in the camera.");
        setCameraPopup(null);

        let cycleCount = 0;
        while (!controller.signal.aborted) {
          const startedAt = Date.now();
          try {
            const video = cameraVideoRef.current;
            if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
              await sleep(150);
              continue;
            }

            const imageData = captureFrame(video, CAMERA_FRAME_CAPTURE_OPTIONS);
            const shouldCheckRestrictions = !BASIC_FACE_FLOW && restrictionCheckAvailable && cycleCount % CAMERA_CHECK_RESTRICTIONS_EVERY === 0;
            const shouldCheckLiveness = !BASIC_FACE_FLOW && livenessCheckAvailable && cycleCount % CAMERA_CHECK_LIVENESS_EVERY === 0;
            cycleCount += 1;

            if (shouldCheckRestrictions) {
              try {
                const restrictionResult = await checkRestrictions({ imageData }, controller.signal);
                if (controller.signal.aborted) return;
                if (restrictionResult.blocked) {
                  setCameraProgress(18);
                  setCameraPose("Restrictions");
                  setCameraMessage(formatRestrictionMessage(restrictionResult.blockedLabels));
                  await sleep(700);
                  continue;
                }
              } catch (error) {
                if (controller.signal.aborted) return;
                restrictionCheckAvailable = false;
                setCameraProgress(20);
                setCameraPose("Restrictions");
                setCameraMessage("Restriction detector unavailable. Continuing...");
                await sleep(350);
              }
            }

            if (shouldCheckLiveness) {
              try {
                const liveness = await checkLiveness({ imageData }, controller.signal);
                if (controller.signal.aborted) return;
                if (liveness?.configured && liveness.live === false) {
                  setCameraProgress(100);
                  setCameraPose("Real face required");
                  setCameraMessage("Phone or image detected. Real face required.");
                  setCameraPopup({
                    tone: "error",
                    title: "Real Face Required",
                    detail: "Phone or image detected. Please remove the spoof attempt and press Retry.",
                  });
                  setCameraCanRetry(true);
                  return;
                }
                if (liveness?.configured === false) {
                  livenessCheckAvailable = false;
                }
              } catch (error) {
                if (controller.signal.aborted) return;
                livenessCheckAvailable = false;
                setCameraProgress(22);
                setCameraPose("Liveness");
                setCameraMessage("Liveness detector unavailable. Continuing...");
                await sleep(250);
              }
            }

            if (screen === "registration") {
              try {
                const samples = await captureRegistrationSamples(controller.signal);
                if (controller.signal.aborted) return;

                setCameraProgress(86);
                setCameraPose("Processing");
                setCameraMessage("Processing registration...");
                await registerFace({ userId: user.id, name: user.name, imageDataList: samples }, controller.signal);
                if (controller.signal.aborted) return;
                enrollmentFaceRegisteredRef.current = true;
                enrollmentFinalizedRef.current = false;
                setCameraProgress(100);
                setCameraPose("Done");
                setCameraMessage("Face saved.");
                setCameraPopup({ tone: "success", title: "Registration Complete", detail: "Face profile saved successfully." });
                queue(() => setScreen(returnToStartAfterSave ? "saving" : "weight"), 1500);
                return;
              } catch (error) {
                if (controller.signal.aborted) return;
                if (isAlreadyEnrolledError(error)) {
                  setCameraProgress(100);
                  setCameraPose("User exists");
                  setCameraMessage("User Already Enrolled");
                  setCameraPopup({ tone: "error", title: "User Already Enrolled", detail: "This user already has a registered face profile." });
                  startCameraReturnToMenuCountdown();
                  return;
                }
                if (isTooSimilarEnrollmentError(error)) {
                  setCameraProgress(100);
                  setCameraPose("Too similar");
                  setCameraMessage("Registration blocked.");
                  setCameraPopup({ tone: "error", title: "Registration Blocked", detail: "This face is too similar to an existing record, so it was not saved." });
                  startCameraReturnToMenuCountdown();
                  return;
                }
                const faces = getDetectedFaceCount(error);
                if (faces === 0) {
                  setCameraProgress(15);
                  setCameraPose("Align your face");
                  setCameraMessage("Align your face in the camera.");
                  await sleep(500);
                  continue;
                }
                if (faces > 1) {
                  setCameraProgress(18);
                  setCameraPose("One person");
                  setCameraMessage(`Multiple faces detected (${faces}). Keep only one person.`);
                  await sleep(700);
                  continue;
                }
                if (isInsufficientSampleError(error)) {
                  setCameraProgress(20);
                  setCameraPose("Align your face");
                  setCameraMessage("Keep your face centered and well-lit, then hold still.");
                  await sleep(700);
                  continue;
                }
                if (isFatalFaceServiceError(error)) {
                  setCameraProgress(100);
                  setCameraPose("Service");
                  setCameraMessage("Face registration service is not ready. Please check backend, then press Retry.");
                  setCameraPopup({ tone: "error", title: "Registration Unavailable", detail: "Face registration service is not ready." });
                  setCameraCanRetry(true);
                  return;
                }
                registrationBackendFailures += 1;
                if (isNetworkFaceError(error) || registrationBackendFailures >= 2) {
                  setCameraProgress(100);
                  setCameraPose("Connection");
                  setCameraMessage("Registration is unavailable right now. Press Retry.");
                  setCameraPopup({ tone: "error", title: "Registration Unavailable", detail: "Temporary connection issue. Please retry." });
                  setCameraCanRetry(true);
                  return;
                }
                setCameraProgress(25);
                setCameraPose("Hold still");
                setCameraMessage(`Retrying: ${error?.message || "Registration failed."}`);
                await sleep(900);
                continue;
              }
            }

            try {
              setCameraProgress(48);
              setCameraPose("Hold still");
              setCameraMessage("Verifying identity...");
              const result = await identifyWithConsensus(
                controller.signal,
                imageData,
                Number(faceStatus?.enrolledUserCount ?? 0),
              );
              if (controller.signal.aborted) return;
              if (result.matched && result.userId) {
                identificationNoMatchStreak = 0;
                identificationCloseMatchStreak = 0;
                const profile = await getUserProfile(result.userId).catch(() => null);
                if (controller.signal.aborted) return;
                setUser((prev) => ({
                  ...prev,
                  id: String(result.userId),
                  name: profile?.name ?? result.name ?? "",
                  age: profile?.age ?? null,
                  sex: profile?.sex ?? "",
                  password: profile?.password ?? prev.password,
                  mustResetPassword: typeof profile?.mustResetPassword === "boolean" ? profile.mustResetPassword : prev.mustResetPassword,
                  isGuest: false,
                }));
                setCameraProgress(100);
                setCameraPose("Done");
                setCameraMessage("Existing record found. Loading result.");
                setCameraPopup(null);
                setScreen("result");
                return;
              }

              if (result.reason === "ambiguous_match" || result.reason === "consensus_not_reached") {
                identificationCloseMatchStreak += 1;
                if (identificationCloseMatchStreak >= Math.max(1, BASIC_IDENTIFY_CLOSE_MATCH_RETRIES)) {
                  setCameraProgress(28);
                  setCameraPose("Align your face");
                  setCameraMessage("No confirmed match found.");
                  continueAsGuest();
                  return;
                }
                setCameraProgress(34);
                setCameraPose("Hold still");
                setCameraMessage("Match is close. Hold still and look straight.");
                await sleep(650);
                continue;
              }

              identificationCloseMatchStreak = 0;
              identificationNoMatchStreak += 1;
              if (identificationNoMatchStreak < Math.max(1, BASIC_IDENTIFY_MAX_NO_MATCH_RETRIES)) {
                setCameraProgress(32);
                setCameraPose("Hold still");
                setCameraMessage("No match yet. Keep face centered and look straight.");
                await sleep(550);
                continue;
              }

              setCameraProgress(28);
              setCameraPose("Align your face");
              setCameraMessage("Not registered yet.");
              continueAsGuest();
              return;
            } catch (error) {
              if (controller.signal.aborted) return;
              identificationNoMatchStreak = 0;
              identificationCloseMatchStreak = 0;
              if (isNetworkFaceError(error)) {
                setCameraProgress(100);
                setCameraPose("Connection");
                setCameraMessage("Identification is unavailable right now. Press Retry.");
                setCameraPopup({ tone: "error", title: "Identification Unavailable", detail: "Temporary connection issue. Please retry." });
                setCameraCanRetry(true);
                return;
              }
              const faces = getDetectedFaceCount(error);
              if (faces === 0) {
                setCameraProgress(15);
                setCameraPose("Align your face");
                setCameraMessage("Align your face in the camera.");
                await sleep(500);
                continue;
              }
              if (faces > 1) {
                setCameraProgress(18);
                setCameraPose("One person");
                setCameraMessage(`Multiple faces detected (${faces}). Keep only one person.`);
                await sleep(700);
                continue;
              }
              if (isFatalFaceServiceError(error)) {
                setCameraProgress(100);
                setCameraPose("Service");
                setCameraMessage("Face identification service is not ready. Please check backend, then press Retry.");
                setCameraPopup({ tone: "error", title: "Identification Unavailable", detail: "Face identification service is not ready." });
                setCameraCanRetry(true);
                return;
              }
              setCameraProgress(25);
              setCameraPose("Hold still");
              setCameraMessage(`Retrying: ${error?.message || "Face processing failed."}`);
              await sleep(900);
            }
          } finally {
            const elapsed = Date.now() - startedAt;
            const remaining = CAMERA_LOOP_MIN_INTERVAL_MS - elapsed;
            if (!controller.signal.aborted && remaining > 0) {
              await sleep(remaining);
            }
          }
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setCameraProgress(20);
        setCameraPose("Error");
        setCameraMessage(`Error: ${error?.message || "Face processing failed."}`);
      }
    })();

    return () => {
      clearTimers();
      controller.abort();
      if (cameraRequestAbortRef.current === controller) {
        cameraRequestAbortRef.current = null;
      }
    };
  }, [screen, cameraRunId, isPreviewMode]);

  useEffect(() => {
    if (isPreviewMode) return;
    if (screen !== "weight") return;
    clearTimers();
    setFooterHint("Scale sensor active");
    setUser((u) => ({ ...u, weightKg: null }));
    setWeightStatusType("incomplete");
    setWeightStatusLabel("INCOMPLETE");
    setWeightReturnMessage("");
    setWeightCaptureSecondsLeft(Math.ceil(MEASURE_CAPTURE_WINDOW_MS / 1000));
    setWeightAlertTitle("");
    setWeightAlertMessage("");
    setWeightStatus("Calibrating...");
    queue(() => setWeightStatus("Step onto platform."), 120);
    queue(() => setWeightStatus("Requesting load cell reading..."), 260);
    queue(() => setWeightStatus("Measuring weight..."), 420);

    const controller = new AbortController();
    weightRequestAbortRef.current = controller;

    queue(async () => {
      const measurementStartedAt = Date.now();
      try {
        await resetSensorSession("weight", controller.signal);
      } catch (error) {
        console.warn("Weight sensor reset skipped:", error);
      }

      while (!controller.signal.aborted) {
        try {
          const weightKg = await readWeightKg(controller.signal, {
            stableConfirmMs: SENSOR_FRONTEND_CONFIRM_MS,
            onSample: (liveWeightKg, reading) => {
              if (controller.signal.aborted) return;
              const uiWeightKg = reading?.displayValueForUi ?? liveWeightKg;
              setUser((u) => ({ ...u, weightKg: uiWeightKg }));
              setWeightCaptureSecondsLeft(Math.max(0, Math.ceil((reading?.confirmationRemainingMs ?? 0) / 1000)));
              const weightPhase = reading?.uiPhase ?? reading?.payload?.phase;
              if (reading?.confirmationReset) {
                showMeasureAlert("weight", "Stand Still", "Movement was detected. Please remain still to complete an accurate measurement.");
              }
              applyMeasurePhase(
                weightPhase,
                reading?.uiStatusMessage || reading?.payload?.statusMessage || `Live weight: ${uiWeightKg.toFixed(1)} kg`,
                "weight",
              );
            },
          });
          if (controller.signal.aborted) return;
          setUser((u) => ({ ...u, weightKg }));
          setWeightCaptureSecondsLeft(0);
          setWeightStatusType("done");
          setWeightStatusLabel("DONE");
          setWeightAlertTitle("");
          setWeightAlertMessage("");
          setWeightStatus(`Weight locked at ${weightKg.toFixed(1)} kg.`);
          setWeightReturnMessage("");
          setWeightRetryCount(0);
          startMeasureAutoNextCountdown("Weight", "height");
          return;
        } catch (error) {
          if (controller.signal.aborted) return;
          const elapsedMs = Date.now() - measurementStartedAt;
          if (isSensorWaitingError(error)) {
            if (elapsedMs >= WEIGHT_MEASURE_MAX_TOTAL_MS) {
              setWeightStatusType("incomplete");
              setWeightStatusLabel("ADJUST");
              setWeightStatus("Stand centered and hold still. Scale is still active.");
              setWeightReturnMessage("");
              setWeightCaptureSecondsLeft(0);
              showMeasureAlert("weight", "Adjust Position", "Stand centered, keep both feet planted, and hold still. The scale will keep reading.");
              await sleep(350);
              continue;
            }
            setUser((u) => ({ ...u, weightKg: null }));
            setWeightStatusType("incomplete");
            setWeightStatusLabel("WAITING");
            setWeightStatus("Step onto platform.");
            setWeightReturnMessage("");
            setWeightCaptureSecondsLeft(0);
            showMeasureAlert("weight", "Step Onto Platform", "No live reading was detected. Step onto the scale and remain still to begin measurement.");
            await sleep(250);
            continue;
          }
          if (isSensorUnstableError(error)) {
            if (elapsedMs >= WEIGHT_MEASURE_MAX_TOTAL_MS) {
              setWeightStatusType("incomplete");
              setWeightStatusLabel("ADJUST");
              setWeightStatus("Weight is still moving. Hold still to lock.");
              setWeightReturnMessage("");
              setWeightCaptureSecondsLeft(0);
              showMeasureAlert("weight", "Hold Still", "Do not shift your feet. The scale is still reading.");
              await sleep(350);
              continue;
            }
            setWeightStatusType("incomplete");
            setWeightStatusLabel("HOLD STILL");
            setWeightStatus("Waiting for stable reading...");
            setWeightReturnMessage("");
            setWeightCaptureSecondsLeft(0);
            showMeasureAlert("weight", "Stand Still", "Please remain still on the platform while the scale finalizes your measurement.");
            await sleep(150);
            continue;
          }

          const nextRetryCount = weightRetryCount + 1;
          setWeightRetryCount(nextRetryCount);
          setWeightStatusType("incomplete");
          setWeightStatusLabel("ADJUST");
          setWeightStatus("Scale is still active. Stand centered and hold still.");
          setWeightCaptureSecondsLeft(0);
          setWeightReturnMessage("");
          showMeasureAlert("weight", getSensorErrorTag(error), "The scale is still active. Stand centered and hold still.");
          await sleep(500);
          continue;
        }
      }
    }, 160);

    return () => {
      clearTimers();
      controller.abort();
      if (weightRequestAbortRef.current === controller) {
        weightRequestAbortRef.current = null;
      }
    };
  }, [screen, weightRunId, isPreviewMode]);

  useEffect(() => {
    if (isPreviewMode) return;
    if (screen !== "height") return;
    clearTimers();
    setFooterHint("Height sensor active");
    setUser((u) => ({ ...u, heightCm: null }));
    setHeightStatusType("incomplete");
    setHeightStatusLabel("INCOMPLETE");
    setHeightReturnMessage("");
    setHeightCaptureSecondsLeft(Math.ceil(MEASURE_CAPTURE_WINDOW_MS / 1000));
    setHeightAlertTitle("");
    setHeightAlertMessage("");
    setHeightStatus("Calibrating...");
    queue(() => setHeightStatus("Stand under sensor."), 120);
    queue(() => setHeightStatus("Requesting ToF reading..."), 260);
    queue(() => setHeightStatus("Tracking distance..."), 420);

    const controller = new AbortController();
    heightRequestAbortRef.current = controller;

    queue(async () => {
      const measurementStartedAt = Date.now();
      try {
        await resetSensorSession("height", controller.signal);
      } catch (error) {
        console.warn("Height sensor reset skipped:", error);
      }

      while (!controller.signal.aborted) {
        try {
          const heightCm = await readHeightCm(controller.signal, {
            stableConfirmMs: SENSOR_FRONTEND_CONFIRM_MS,
            onSample: (liveHeightCm, reading) => {
              if (controller.signal.aborted) return;
              const uiHeightCm = reading?.displayValueForUi ?? liveHeightCm;
              setUser((u) => {
                const next = { ...u, heightCm: uiHeightCm };
                const bmiData = computeBmi(next.weightKg, uiHeightCm, next.age, next.sex);
                return { ...next, ...bmiData };
              });
              setHeightCaptureSecondsLeft(Math.max(0, Math.ceil((reading?.confirmationRemainingMs ?? 0) / 1000)));
              const heightPhase = reading?.uiPhase ?? reading?.payload?.phase;
              if (reading?.confirmationReset) {
                showMeasureAlert("height", "Stand Still", "Movement was detected. Please remain still to complete an accurate measurement.");
              }
              applyMeasurePhase(
                heightPhase,
                reading?.uiStatusMessage || reading?.payload?.statusMessage || `Live height: ${uiHeightCm} cm`,
                "height",
              );
            },
          });
          if (controller.signal.aborted) return;
          setUser((u) => {
            const next = { ...u, heightCm };
            const bmiData = computeBmi(next.weightKg, heightCm, next.age, next.sex);
            return { ...next, ...bmiData };
          });
          setHeightCaptureSecondsLeft(0);
          setHeightStatusType("done");
          setHeightStatusLabel("DONE");
          setHeightAlertTitle("");
          setHeightAlertMessage("");
          setHeightStatus(`Height locked at ${heightCm} cm.`);
          setHeightReturnMessage("");
          enrollmentFinalizedRef.current = true;
          setHeightRetryCount(0);
          startMeasureAutoNextCountdown("Height", "identification");
          return;
        } catch (error) {
          if (controller.signal.aborted) return;
          const elapsedMs = Date.now() - measurementStartedAt;
          if (isSensorWaitingError(error)) {
            if (elapsedMs >= HEIGHT_MEASURE_MAX_TOTAL_MS) {
              setHeightStatusType("incomplete");
              setHeightStatusLabel("ADJUST");
              setHeightStatus("Stand centered under the sensor. Height scan is still active.");
              setHeightReturnMessage("");
              setHeightCaptureSecondsLeft(0);
              showMeasureAlert("height", "Adjust Position", "Stand straight under the sensor, keep your head level, and move hair away if needed.");
              await sleep(350);
              continue;
            }
            setUser((u) => ({ ...u, heightCm: null }));
            setHeightStatusType("incomplete");
            setHeightStatusLabel("WAITING");
            setHeightStatus("Stand under sensor.");
            setHeightReturnMessage("");
            setHeightCaptureSecondsLeft(0);
            showMeasureAlert("height", "Stand Under Sensor", "No live reading was detected. Stand under the sensor and remain still to begin measurement.");
            await sleep(250);
            continue;
          }
          if (isSensorUnstableError(error)) {
            if (elapsedMs >= HEIGHT_MEASURE_MAX_TOTAL_MS) {
              setHeightStatusType("incomplete");
              setHeightStatusLabel("ADJUST");
              setHeightStatus("Height is still stabilizing. Hold your posture.");
              setHeightReturnMessage("");
              setHeightCaptureSecondsLeft(0);
              showMeasureAlert("height", "Hold Still", "Keep your chin level and stand directly below the sensor. The scan is still active.");
              await sleep(350);
              continue;
            }
            setHeightStatusType("incomplete");
            setHeightStatusLabel("HOLD STILL");
            setHeightStatus("Waiting for stable reading...");
            setHeightReturnMessage("");
            setHeightCaptureSecondsLeft(0);
            showMeasureAlert("height", "Stand Still", "Please remain still while the system finalizes your height measurement.");
            await sleep(150);
            continue;
          }

          const nextRetryCount = heightRetryCount + 1;
          setHeightRetryCount(nextRetryCount);
          setHeightStatusType("incomplete");
          setHeightStatusLabel("ADJUST");
          setHeightStatus("Height scan is still active. Stand centered and hold still.");
          setHeightCaptureSecondsLeft(0);
          setHeightReturnMessage("");
          showMeasureAlert("height", getSensorErrorTag(error), "The height sensor is still active. Stand centered and hold still.");
          await sleep(500);
          continue;
        }
      }
    }, 160);

    return () => {
      clearTimers();
      controller.abort();
      if (heightRequestAbortRef.current === controller) {
        heightRequestAbortRef.current = null;
      }
    };
  }, [screen, heightRunId, isPreviewMode]);

  useEffect(() => {
    if (isPreviewMode) return;
    if (screen !== "welcome") return;
    void discardIncompleteEnrollment();
  }, [screen, isPreviewMode]);

  const handleCameraPopupAction = (action) => {
    if (action !== "register") return;
    clearTimers();
    setCameraCanRetry(false);
    setCameraPopup(null);
    setCameraReturnMessage("");
    setAgreeTerms(false);
    setReturnToStartAfterSave(true);
    guestRegistrationSnapshotRef.current = user?.isGuest
      ? {
          user: { ...user },
          form: { ...newUserForm },
        }
      : null;
    setUser((prev) => {
      const fresh = randomUser();
      return {
        ...prev,
        id: fresh.id,
        password: fresh.password,
        mustResetPassword: fresh.mustResetPassword,
        isGuest: false,
      };
    });
    setNewUserForm((form) => ({
      ...form,
      firstName: "",
      middleInitial: "",
      lastName: "",
      age: user.age != null ? String(user.age) : "",
      sex: user.sex || "",
    }));
    setMode("registration");
    setScreen("terms");
  };

  const startNewRegistration = () => {
    clearTimers();
    cameraRequestAbortRef.current?.abort();
    setCameraCanRetry(false);
    setCameraPopup(null);
    setCameraReturnMessage("");
    setCameraProgress(0);
    setCameraPose("Align your face");
    setCameraMessage("Align your face in the camera.");
    setAgreeTerms(false);
    setNewUserForm(newUserFormDefaults());
    setUser(randomUser());
    setReturnToStartAfterSave(false);
    guestRegistrationSnapshotRef.current = null;
    enrollmentFaceRegisteredRef.current = false;
    enrollmentFinalizedRef.current = false;
    setMode("registration");
    setScreen("terms");
  };

  const openAnalytics = async () => {
    const fallbackCurrent = {
      weightKg: user.weightKg,
      heightCm: user.heightCm,
      bmi: user.bmi,
      category: user.category,
      capturedAt: Date.now(),
    };
    if (user?.id && !user?.isGuest) {
      const history = await getUserMeasurements(user.id, { limit: 8 }).catch(() => []);
      setResultHistory(Array.isArray(history) && history.length > 0 ? history : [fallbackCurrent]);
    } else {
      setResultHistory([fallbackCurrent]);
    }
    setScreen("analytics");
  };

  const retryWeightMeasurement = () => {
    if (weightRetryCount >= MAX_SENSOR_RETRIES) return;
    clearTimers();
    weightRequestAbortRef.current?.abort();
    if (weightAlertTimeoutRef.current) clearTimeout(weightAlertTimeoutRef.current);
    weightAlertTimeoutRef.current = null;
    setWeightStatusType("incomplete");
    setWeightStatusLabel("INCOMPLETE");
    setWeightAlertTitle("");
    setWeightAlertMessage("");
    setWeightReturnMessage("");
    setWeightCaptureSecondsLeft(Math.ceil(MEASURE_CAPTURE_WINDOW_MS / 1000));
    setWeightStatus("Retrying weight measurement...");
    setWeightRunId((prev) => prev + 1);
  };

  const retryHeightMeasurement = () => {
    if (heightRetryCount >= MAX_SENSOR_RETRIES) return;
    clearTimers();
    heightRequestAbortRef.current?.abort();
    if (heightAlertTimeoutRef.current) clearTimeout(heightAlertTimeoutRef.current);
    heightAlertTimeoutRef.current = null;
    setHeightStatusType("incomplete");
    setHeightStatusLabel("INCOMPLETE");
    setHeightAlertTitle("");
    setHeightAlertMessage("");
    setHeightReturnMessage("");
    setHeightCaptureSecondsLeft(Math.ceil(MEASURE_CAPTURE_WINDOW_MS / 1000));
    setHeightStatus("Retrying height measurement...");
    setHeightRunId((prev) => prev + 1);
  };

  useEffect(() => {
    if (isPreviewMode) return;
    if (screen !== "saving") return;
    if (user.weightKg == null || user.heightCm == null || user.bmi == null) {
      setSaveMessage("Incomplete enrollment. Returning to menu...");
      void discardIncompleteEnrollment();
      queue(() => setScreen("welcome"), 1200);
      return;
    }
    clearTimers();
    setFooterHint("Saving record");
    const shouldForceOfflineQueue = connection !== "online" || (typeof navigator !== "undefined" && navigator.onLine === false);
    setSaveTitle(shouldForceOfflineQueue ? "Offline Save" : "Syncing");
    setSaveMessage(shouldForceOfflineQueue ? "No internet detected. Saving locally on this kiosk..." : "Saving to Firebase...");

    let cancelled = false;
    (async () => {
      try {
        const profileResult = await upsertUserProfile(user, { forceQueue: shouldForceOfflineQueue });
        const measurementResult = await saveMeasurement(user, { forceQueue: shouldForceOfflineQueue });
        enrollmentFinalizedRef.current = true;
        savedResultKeyRef.current = `${user.id}:${user.weightKg}:${user.heightCm}:${user.bmi}`;
        if (cancelled) return;
        const queued = Boolean(profileResult?.queued || measurementResult?.queued);
        setSaveTitle(queued ? "Saved Offline" : "Sync Complete");
        setSaveMessage(queued ? "Saved locally on the kiosk. All offline records will sync to Firebase once internet is available." : "Cloud save complete.");
        guestRegistrationSnapshotRef.current = null;
      } catch (error) {
        if (cancelled) return;
        console.error("Firebase save failed:", error);
        setSaveTitle("Saved Offline");
        setSaveMessage("Saved locally on the kiosk. All offline records will sync to Firebase once internet is available.");
      } finally {
        if (!cancelled) queue(() => {
          setReturnToStartAfterSave(false);
          setScreen("result");
        }, 1400);
      }
    })();

    return () => {
      cancelled = true;
      clearTimers();
    };
  }, [screen, user, isPreviewMode, returnToStartAfterSave]);

  useEffect(() => {
    if (isPreviewMode) return;
    if (screen !== "result") return;
    setFooterHint("Session complete");
    setTimerBadge("Auto reset in 2 mins");
    const resultKey = `${user.id}:${user.weightKg}:${user.heightCm}:${user.bmi}`;
    if (user.id && user.weightKg != null && user.heightCm != null && user.bmi != null && savedResultKeyRef.current !== resultKey) {
      savedResultKeyRef.current = resultKey;
      const shouldForceOfflineQueue = connection !== "online" || (typeof navigator !== "undefined" && navigator.onLine === false);
      void saveMeasurement(user, { forceQueue: shouldForceOfflineQueue }).catch((error) => {
        console.error("Result measurement save failed:", error);
      });
    }
    const id1 = setTimeout(() => setFooterHint("Auto reset in 2 mins"), 5000);
    const id2 = setTimeout(() => {
      setTimerBadge("Resetting");
      reset();
    }, 120000);
    return () => { clearTimeout(id1); clearTimeout(id2); };
  }, [screen, isPreviewMode, user, connection]);

  const page = useMemo(() => {
    if (isAdminView) return <AdminPage />;
    const previewCameraProps = isPreviewMode
      ? {
          pose: previewCameraPose,
          progress: previewCameraTone === "success" ? 100 : 0,
          message: previewCameraTone === "success"
            ? "Existing record loaded."
            : previewCameraTone === "error"
              ? "Cannot reach face service. Start backend and press Retry."
              : previewCameraTone === "register"
                ? "No matching face profile found."
                : "Align your face in the camera.",
          returnMessage: "Preview mode",
          popup: previewCameraTone === "success"
            ? { tone: "success", title: "User Recognized", detail: "Existing record loaded." }
            : previewCameraTone === "error"
              ? { tone: "error", title: "Connection Error", detail: "Cannot reach face service. Start backend and press Retry." }
              : previewCameraTone === "register"
                ? { tone: "error", title: "Not Registered Yet?", detail: "No matching face profile found.", actionLabel: "Register", action: "register" }
                : null,
          onRetry: ["error", "register"].includes(previewCameraTone) ? () => {} : undefined,
        }
      : null;

    if (screen === "welcome") return <IntroPage onStart={() => setScreen("reminders")} />;
    if (screen === "terms") {
      return (
        <TermsPage
          agree={agreeTerms}
          setAgree={setAgreeTerms}
          onBackToStart={reset}
          onDecline={() => {
            setAgreeTerms(false);
            if (returnToStartAfterSave && guestRegistrationSnapshotRef.current) {
              setUser(guestRegistrationSnapshotRef.current.user);
              setNewUserForm(guestRegistrationSnapshotRef.current.form);
              setReturnToStartAfterSave(false);
              guestRegistrationSnapshotRef.current = null;
              setScreen("result");
              return;
            }
            setScreen("welcome");
          }}
          onNext={() => setScreen("full-name")}
        />
      );
    }
    if (screen === "reminders") return <RemindersPage />;
    if (screen === "full-name") return <FullNamePage value={{ firstName: newUserForm.firstName, middleInitial: newUserForm.middleInitial, lastName: newUserForm.lastName }} onChange={(v) => setNewUserForm((f) => ({ ...f, ...v }))} onBack={() => setScreen("terms")} onNext={() => {
      const fullName = composeFullName(newUserForm);
      setUser((prev) => ({ ...prev, name: fullName || prev.name || "Guest" }));
      if (returnToStartAfterSave) {
        enrollmentFaceRegisteredRef.current = false;
        enrollmentFinalizedRef.current = false;
        setMode("registration");
        setScreen("registration");
        return;
      }
      setScreen("age");
    }} />;
    if (screen === "age") return <AgePage value={newUserForm.age} onChange={(v) => setNewUserForm((f) => ({ ...f, age: v }))} onBack={() => setScreen(user.isGuest ? "identification" : "full-name")} onNext={() => setScreen("sex")} />;
    if (screen === "sex") return <SexPage sex={newUserForm.sex} setSex={(v) => setNewUserForm((f) => ({ ...f, sex: v }))} onBack={() => setScreen("age")} onNext={() => {
      if (user.isGuest) {
        setUser((prev) => {
          const next = { ...prev, age: Number(newUserForm.age), sex: newUserForm.sex, name: prev.name || "Guest" };
          const bmiData = computeBmi(next.weightKg, next.heightCm, next.age, next.sex);
          return { ...next, ...bmiData };
        });
        setScreen("result");
        return;
      }
      enrollmentFaceRegisteredRef.current = false;
      enrollmentFinalizedRef.current = false;
      const fresh = randomUser();
      setUser({ ...fresh, name: composeFullName(newUserForm), age: Number(newUserForm.age), sex: newUserForm.sex });
      setReturnToStartAfterSave(false);
      setMode("registration");
      setScreen("registration");
    }} />;
    if (screen === "registration") return <CameraPage mode="registration" title="Facial Registration" pose={isPreviewMode ? previewCameraProps.pose : cameraPose} progress={isPreviewMode ? previewCameraProps.progress : cameraProgress} message={isPreviewMode ? previewCameraProps.message : cameraMessage} returnMessage={isPreviewMode ? previewCameraProps.returnMessage : cameraReturnMessage} popup={isPreviewMode ? previewCameraProps.popup : cameraPopup} onCancel={() => setScreen("welcome")} onRetry={isPreviewMode ? previewCameraProps.onRetry : (cameraCanRetry ? retryCameraFlow : undefined)} onNext={() => setScreen("weight")} onPopupAction={handleCameraPopupAction} onVideoReady={(videoEl) => { cameraVideoRef.current = videoEl; }} />;
    if (screen === "identification") return <CameraPage mode="identification" title="Facial Identification" pose={isPreviewMode ? previewCameraProps.pose : cameraPose} progress={isPreviewMode ? previewCameraProps.progress : cameraProgress} message={isPreviewMode ? previewCameraProps.message : cameraMessage} returnMessage={isPreviewMode ? previewCameraProps.returnMessage : cameraReturnMessage} popup={isPreviewMode ? previewCameraProps.popup : cameraPopup} onCancel={() => setScreen("reminders")} onRetry={isPreviewMode ? previewCameraProps.onRetry : (cameraCanRetry ? retryCameraFlow : undefined)} onPopupAction={handleCameraPopupAction} onVideoReady={(videoEl) => { cameraVideoRef.current = videoEl; }} />;
    if (screen === "identity-confirm") {
      return (
        <IdentityConfirmPage
          user={user}
          onYes={() => setScreen("result")}
          onNo={startNewRegistration}
        />
      );
    }
    if (screen === "weight") return <MeasurePage title="Weight Measurement" status={weightStatus} statusType={weightStatusType} statusLabel={weightStatusLabel} alertTitle={weightAlertTitle} alertMessage={weightAlertMessage} returnMessage={weightReturnMessage} label="Weight" loading={isPreviewMode ? false : user.weightKg == null} value={isPreviewMode ? "64.5 kg" : (user.weightKg != null ? `${user.weightKg.toFixed(1)} kg` : "--.- kg")} onCancel={handleBackToMenuFromMeasure} onBackToMenu={handleBackToMenuFromMeasure} onRetry={isPreviewMode ? () => {} : (weightStatusType === "error" && weightRetryCount < MAX_SENSOR_RETRIES ? retryWeightMeasurement : undefined)} />;
    if (screen === "height") return <MeasurePage title="Height Measurement" status={heightStatus} statusType={heightStatusType} statusLabel={heightStatusLabel} alertTitle={heightAlertTitle} alertMessage={heightAlertMessage} returnMessage={heightReturnMessage} label="Height" loading={isPreviewMode ? false : user.heightCm == null} value={isPreviewMode ? "171 cm" : (user.heightCm != null ? `${user.heightCm} cm` : "-- cm")} onCancel={handleBackToMenuFromMeasure} onBackToMenu={handleBackToMenuFromMeasure} onRetry={isPreviewMode ? () => {} : (heightStatusType === "error" && heightRetryCount < MAX_SENSOR_RETRIES ? retryHeightMeasurement : undefined)} />;
    if (screen === "saving") return <SavingPage title={isPreviewMode ? "Preview Save" : saveTitle} message={isPreviewMode ? "Previewing save screen..." : saveMessage} />;
    if (screen === "result") return <ResultPage user={user} onReset={reset} onAnalytics={!user.isGuest ? openAnalytics : undefined} onRegister={user.isGuest ? () => handleCameraPopupAction("register") : undefined} />;
    if (screen === "analytics") return <AnalyticsPage user={user} history={resultHistory} onBack={() => setScreen("result")} onFinish={reset} />;
    return <IntroPage onStart={() => setScreen("reminders")} />;
  }, [isAdminView, isPreviewMode, previewCameraPose, previewCameraTone, screen, agreeTerms, newUserForm, user, cameraMessage, cameraPose, cameraProgress, cameraReturnMessage, cameraPopup, weightStatus, weightStatusType, weightStatusLabel, weightAlertTitle, weightAlertMessage, weightReturnMessage, weightCaptureSecondsLeft, heightStatus, heightStatusType, heightStatusLabel, heightAlertTitle, heightAlertMessage, heightReturnMessage, heightCaptureSecondsLeft, saveMessage, saveTitle, returnToStartAfterSave, resultHistory]);

  return (
    <>
      <div className="ambient-bg" aria-hidden="true">
        <div className="ambient-orb orb-a" />
        <div className="ambient-orb orb-b" />
      </div>
      <main className="kiosk-shell tech-surface">
        <section className="tablet-frame">
          <header className="topbar">
            <div className="brand">
              <span className="brand-logo" aria-hidden="true">
                <svg viewBox="0 0 48 48" width="28" height="28">
                  <circle cx="24" cy="24" r="22" fill="none" stroke="rgba(167,235,242,.35)" strokeWidth="2" />
                  <path d="M10 25h8l3-8 5 15 4-11h8" fill="none" stroke="#a7ebf2" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <h1>{isAdminView ? "Smart BMI Admin" : "Smart BMI System"}</h1>
            </div>
            <div className="status-row">
              <span className={`badge ${connection === "online" ? "badge-online" : "badge-offline"}`}>{connection === "online" ? "Online" : "Offline"}</span>
              <span className={`badge ${sensorState === "offline" ? "badge-offline" : "badge-online"}`}>{sensorState === "active" ? "Sensor Active" : (sensorState === "ready" ? "Sensors Ready" : "Sensor Offline")}</span>
            </div>
          </header>
          <section className={`screen ${screen === "welcome" ? "screen-welcome" : ""}`}>
            <div className="intro-animated-bg" aria-hidden="true">
              <div className="intro-gradient" />
              <div className="intro-orb intro-orb-a" />
              <div className="intro-orb intro-orb-b" />
              <div className="intro-orb intro-orb-c" />
              <motion.div
                className="intro-float intro-float-heart"
                animate={{ y: [0, -12, 0], rotate: [0, 8, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              >
                <Heart className="intro-icon" />
              </motion.div>
              <motion.div
                className="intro-float intro-float-activity"
                animate={{ y: [0, 12, 0], rotate: [0, -8, 0] }}
                transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              >
                <Activity className="intro-icon" />
              </motion.div>
              <motion.div
                className="intro-float intro-float-scale"
                animate={{ y: [0, -10, 0], rotate: [0, 10, 0] }}
                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 2 }}
              >
                <Scale className="intro-icon" />
              </motion.div>
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={isAdminView ? "admin" : screen}
                className={`page-wrap ${
                  isAdminView || screen === "welcome" || screen === "reminders" || screen === "saving" || screen === "terms" || screen === "result"
                    ? "page-wrap-centered"
                    : ""
                } ${
                  !isAdminView && (screen === "registration" || screen === "identification")
                    ? "page-wrap-fit"
                    : ""
                }`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
              >
                {page}
              </motion.div>
            </AnimatePresence>
          </section>
        </section>
      </main>
    </>
  );
}
