import { useEffect, useRef, useState } from "react";

async function configureCameraTrack(track) {
  if (!track || typeof track.applyConstraints !== "function") return;

  const capabilities = typeof track.getCapabilities === "function"
    ? track.getCapabilities()
    : {};
  const supported = navigator.mediaDevices?.getSupportedConstraints?.() ?? {};
  const advanced = [];

  const chooseMode = (key, preferred) => {
    const options = capabilities?.[key];
    return Array.isArray(options) && options.includes(preferred) ? preferred : null;
  };

  const focusMode = chooseMode("focusMode", "continuous");
  const exposureMode = chooseMode("exposureMode", "continuous");
  const whiteBalanceMode = chooseMode("whiteBalanceMode", "continuous");
  const resizeMode = chooseMode("resizeMode", "crop-and-scale");

  if (focusMode) advanced.push({ focusMode });
  if (exposureMode) advanced.push({ exposureMode });
  if (whiteBalanceMode) advanced.push({ whiteBalanceMode });
  if (resizeMode) advanced.push({ resizeMode });

  const constraints = { advanced };
  if (supported.width) constraints.width = { ideal: 1920 };
  if (supported.height) constraints.height = { ideal: 1080 };
  if (supported.frameRate) constraints.frameRate = { ideal: 30, max: 30 };

  try {
    if (advanced.length > 0 || constraints.width || constraints.height || constraints.frameRate) {
      await track.applyConstraints(constraints);
    }
  } catch (error) {
    if (String(import.meta.env.VITE_CAMERA_DEBUG ?? "false").toLowerCase() === "true") {
      console.warn("Camera auto-focus constraints were not applied:", error);
    }
  }
}

export default function CameraPage({
  mode,
  title,
  pose,
  progress,
  message,
  returnMessage = "",
  popup = null,
  onCancel,
  onNext,
  onRetry,
  onPopupAction,
  onVideoReady,
  previewMode = false,
}) {
  const videoRef = useRef(null);
  const [cameraState, setCameraState] = useState("initializing");
  const [cameraError, setCameraError] = useState("");
  const poseKey = String(pose || "").toLowerCase();
  const poseDirection = poseKey.includes("left")
    ? "left"
    : poseKey.includes("right")
      ? "right"
      : poseKey.includes("up")
        ? "up"
        : poseKey.includes("down")
          ? "down"
          : poseKey.includes("blink")
            ? "blink"
            : "center";
  const msg = String(message || "").toLowerCase();
  const isDone = progress >= 100 && (
    msg.includes("saved")
    || msg.includes("match found")
    || msg.includes("face saved")
    || msg.includes("recognized")
  );
  const isIssue = (
    msg.includes("no match")
    || msg.includes("error")
    || msg.includes("denied")
    || msg.includes("not recognized")
    || msg.includes("register")
  );
  const directionalInstruction = poseDirection === "left"
    ? "Turn left."
    : poseDirection === "right"
      ? "Turn right."
      : poseDirection === "up"
        ? "Look up."
        : poseDirection === "down"
          ? "Look down."
          : poseDirection === "blink"
            ? "Blink"
            : "Align your face in the camera.";
  const activeNotice = popup
    ? {
        title: popup.title,
        detail: popup.detail,
        tone: popup.tone || "info",
        action: popup.action,
        actionLabel: popup.actionLabel,
      }
    : {
        title,
        detail: mode === "registration" && !isDone && !isIssue ? directionalInstruction : message,
        tone: isDone ? "success" : (isIssue ? "error" : "info"),
      };
  const statusProgress = activeNotice.tone === "success"
    ? 100
    : Math.max(0, Math.min(100, Number(progress) || 0));
  const displayTitle = mode === "identification" ? "Face Recognition" : title;

  useEffect(() => {
    let stream;
    async function startCamera() {
      setCameraError("");
      setCameraState("initializing");
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState("unsupported");
        setCameraError("Camera API is not supported in this browser.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: false,
        });
        const [videoTrack] = stream.getVideoTracks();
        await configureCameraTrack(videoTrack);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraState("ready");
          setCameraError("");
          if (typeof onVideoReady === "function") onVideoReady(videoRef.current);
        }
      } catch {
        setCameraState("denied");
        setCameraError("Camera access denied. Allow camera permission to continue.");
      }
    }

    startCamera();
    return () => {
      if (typeof onVideoReady === "function") onVideoReady(null);
      if (stream) stream.getTracks().forEach((track) => track.stop());
    };
  }, [onVideoReady]);

  return (
    <div className="page-with-actions camera-page">
      <div className="screen-grid single-col">
        <div
          style={{
            width: "min(760px, 100%)",
            margin: "0 auto",
            paddingTop: 8,
          }}
        >
          <div
            style={{
              width: "min(640px, 100%)",
              margin: "0 auto",
              padding: "26px 28px 24px",
              borderRadius: 24,
              background: "#fff",
              border: "1px solid rgba(84,172,191,.18)",
              boxShadow: "0 24px 56px rgba(2,56,89,.14)",
              display: "grid",
              gap: 18,
            }}
          >
            {(mode === "identification" || mode === "registration") && (
              <h2 style={{ fontSize: "28px", margin: 0, textAlign: "center", color: "#214f66", fontWeight: 700 }}>
                {displayTitle}
              </h2>
            )}

            <div
              style={{
                minHeight: 56,
                padding: "14px 18px",
                borderRadius: 999,
                background: "#e6f1f8",
                border: "1px solid rgba(84,172,191,.18)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <div style={{ display: "grid", placeItems: "center", textAlign: "center" }}>
                {mode !== "identification" && mode !== "registration" && (
                  <span>{activeNotice.title}</span>
                )}
                {activeNotice.detail && (
                  <span style={{ fontSize: "16px", fontWeight: 600, color: "#33667f" }}>
                    {activeNotice.detail}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: "grid", placeItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 360,
                  height: 360,
                  borderRadius: "50%",
                  padding: 10,
                  background: "linear-gradient(180deg,#d9f0f8,#cfeaf5)",
                  boxShadow: "0 18px 42px rgba(44,186,207,.16)",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    border: "5px solid #2ea5c6",
                    overflow: "hidden",
                    position: "relative",
                    background: "#0b2a3a",
                  }}
                >
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="camera-feed"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: cameraState === "ready" ? "block" : "none",
                    }}
                  />
                  {cameraState !== "ready" && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: "50%",
                        background: previewMode
                          ? "radial-gradient(circle at 50% 34%, rgba(224,199,179,.92) 0 18%, transparent 19%), radial-gradient(circle at 50% 63%, rgba(44,28,40,.82) 0 25%, transparent 26%), radial-gradient(circle at 50% 78%, rgba(31,66,91,.9) 0 23%, transparent 24%), linear-gradient(180deg, #556b88 0%, #22384f 48%, #0f2232 100%)"
                          : "#0b2a3a",
                        display: "grid",
                        placeItems: "center",
                        color: "#d7eef7",
                        fontSize: "14px",
                        textAlign: "center",
                        padding: "20px",
                      }}
                    >
                      {!previewMode && (
                        <span>{cameraState === "denied" ? "Camera preview unavailable" : "Starting camera..."}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {!previewMode && cameraState !== "ready" && cameraError && (
                <p
                  style={{
                    margin: 0,
                    padding: "14px 18px",
                    borderRadius: 14,
                    background: "#fff1f3",
                    border: "1px solid rgba(228,101,123,.35)",
                    color: "#a5283f",
                    fontSize: "14px",
                    fontWeight: 600,
                    textAlign: "center",
                  }}
                >
                  {cameraError}
                </p>
              )}
            </div>

            <div
              style={{
                maxWidth: 420,
                margin: "0 auto",
                width: "100%",
                padding: "18px 18px 16px",
                borderRadius: 18,
                background: "#f4fbfe",
                border: "1px solid rgba(84,172,191,.16)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#33667f",
                }}
              >
                <span>Progress</span>
                <strong style={{ color: "#18789d" }}>{statusProgress}%</strong>
              </div>
              <div style={{ height: 12, borderRadius: 999, background: "#d6edf6", overflow: "hidden" }}>
                <div style={{ width: `${statusProgress}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#2bb4d0,#7fd8ea)" }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="actions camera-actions">
        {typeof onNext === "function" && (
          <button className="btn camera-continue-btn" onClick={onNext}>Continue</button>
        )}
        <button className="btn camera-cancel-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
