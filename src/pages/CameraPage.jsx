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

  const constraints = {
    advanced,
  };

  if (supported.width) constraints.width = { ideal: 1920 };
  if (supported.height) constraints.height = { ideal: 1080 };
  if (supported.frameRate) constraints.frameRate = { ideal: 30, max: 30 };

  try {
    if (advanced.length > 0 || constraints.width || constraints.height || constraints.frameRate) {
      await track.applyConstraints(constraints);
    }
  } catch (error) {
    console.warn("Camera auto-focus constraints were not applied:", error);
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
        title: title,
        detail: mode === "registration" && !isDone && !isIssue ? directionalInstruction : message,
        tone: isDone ? "success" : (isIssue ? "error" : "info"),
      };
  const statusProgress = activeNotice.tone === "success" ? 100 : 0;

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
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div className="page-with-actions camera-page">
      <div className="screen-grid single-col">
        <div className="panel panel-large camera-view">
          <div className={`facial-shell ${mode === "registration" ? "facial-shell-registration" : ""}`}>
            {(mode === "identification" || mode === "registration") && (
              <h2 className="facial-page-title">{title}</h2>
            )}
            <div className={`facial-top-rail facial-top-rail-${activeNotice.tone}`}>
              {mode === "registration" && (
                <div className={`facial-rail-cue facial-rail-cue-left facial-side-cue-${poseDirection}`} aria-hidden="true">
                  <div className={`facial-direction-stack facial-direction-stack-${poseDirection}`}>
                    <span className="facial-chevron" />
                    <span className="facial-chevron" />
                    <span className="facial-chevron" />
                  </div>
                </div>
              )}
              <div className="facial-top-copy">
                {mode !== "identification" && mode !== "registration" && (
                  <span className="facial-message facial-message-primary">{activeNotice.title}</span>
                )}
                {activeNotice.detail && <span className="facial-message">{activeNotice.detail}</span>}
              </div>
              {mode === "registration" && (
                <div className={`facial-rail-cue facial-rail-cue-right facial-side-cue-${poseDirection}`} aria-hidden="true">
                  <div className={`facial-direction-stack facial-direction-stack-${poseDirection}`}>
                    <span className="facial-chevron" />
                    <span className="facial-chevron" />
                    <span className="facial-chevron" />
                  </div>
                </div>
              )}
              {activeNotice.action && activeNotice.actionLabel && typeof onPopupAction === "function" ? (
                <div className="facial-inline-actions">
                  {activeNotice.action && activeNotice.actionLabel && typeof onPopupAction === "function" && (
                    <button
                      type="button"
                      className="btn btn-primary facial-inline-action-btn"
                      onClick={() => onPopupAction(activeNotice.action)}
                    >
                      {activeNotice.actionLabel}
                    </button>
                  )}
                </div>
              ) : null}
            </div>

            <div className="facial-stage">
              <div className="facial-camera-orb">
                <div className="facial-camera-ring" aria-hidden="true" />
                <div className="facial-camera-lens">
                  <video ref={videoRef} autoPlay playsInline muted className="camera-feed facial-camera-feed" />
                </div>
                <div className={`facial-face-layout ${mode === "identification" ? "facial-face-layout-identify" : "facial-face-layout-register"}`} aria-hidden="true">
                  <svg viewBox="0 0 220 220" className="face-layout-svg">
                    <ellipse cx="110" cy="110" rx="92" ry="108" className="face-layout-line" />
                    <ellipse cx="76" cy="96" rx="12" ry="9" className="face-layout-line" />
                    <ellipse cx="144" cy="96" rx="12" ry="9" className="face-layout-line" />
                    <path d="M110 106v38" className="face-layout-line" />
                    <path d="M76 162c14 12 54 12 68 0" className="face-layout-line" />
                  </svg>
                </div>
              </div>
              {cameraState !== "ready" && cameraError && <p className="camera-error facial-camera-error">{cameraError}</p>}
            </div>

            <div className="facial-progress">
              <div className="facial-progress-head">
                <span>Progress</span>
                <strong>{statusProgress}%</strong>
              </div>
              <div className="facial-progress-track">
                <div className="facial-progress-fill" style={{ width: `${statusProgress}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="actions camera-actions">
        {returnMessage && <p className="camera-returning-msg">{returnMessage}</p>}
        <button className="btn camera-cancel-btn" onClick={onCancel}>Cancel</button>
        {typeof onRetry === "function" && (
          <button className="btn btn-primary camera-next-btn" onClick={onRetry}>Retry</button>
        )}
        {isDone && typeof onNext === "function" && (
          <button className="btn btn-primary camera-next-btn" onClick={onNext}>Next</button>
        )}
      </div>
    </div>
  );
}
