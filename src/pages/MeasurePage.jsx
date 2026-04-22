import { Ruler, ScanLine, Weight } from "lucide-react";
import { motion } from "framer-motion";

export default function MeasurePage({
  title,
  status,
  label,
  value,
  loading,
  statusType = "incomplete",
  statusLabel,
  alertTitle = "",
  alertMessage = "",
  returnMessage = "",
  onBackToMenu,
  onRetry,
  onCancel,
}) {
  const isWeight = label.toLowerCase().includes("weight");
  const icon = isWeight ? <Weight /> : <Ruler />;
  const chipText = status;
  const isDone = statusType === "done";
  const isError = statusType === "error";
  const returnMessageClass = isDone
    ? "measure-returning-msg measure-next-msg"
    : "measure-returning-msg measure-returning-msg-alert";
  const instructionLabel = statusLabel || (isDone ? "DONE" : "INCOMPLETE");
  const instructionClass = isDone ? "instruction-done" : "instruction-alert";
  const displayDigits = isWeight
    ? String(value ?? "--.- kg").replace(/\s*kg\s*$/i, "")
    : String(value ?? "--");
  const hasLiveDigits = isWeight
    ? displayDigits !== "--.-"
    : displayDigits !== "--";
  const meterModeLabel = isDone ? "Locked" : (hasLiveDigits ? "Live" : "Scanning");
  const centerInstruction = isWeight
    ? {
        title: "Do Not Move",
        steps: [
          "Step fully onto the platform.",
          "Keep both feet planted and your body centered.",
          "Wait until the reading becomes stable.",
        ],
      }
    : {
        title: "Stand Still",
        steps: [
          "Stand directly below the height sensor.",
          "Look straight ahead with your chin level.",
          "Wait until the height reading becomes stable.",
        ],
      };

  return (
    <div className="page-with-actions measure-page">
      <div className="screen-grid single-col">
        <div className="panel panel-large measure-panel">
          {!isDone && !isError && (
            <div className="measure-guidance-wrap">
              <div className="measure-top-instruction" role="note" aria-live="polite">
                <strong>{centerInstruction.title}</strong>
              </div>
              <div className="measure-guidance-strip" aria-label={`${label} guidance`}>
                {centerInstruction.steps.map((step, index) => (
                  <div key={step} className="measure-guidance-card">
                    <b>{index + 1}</b>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="measure-head">
            <h2 className="measure-title">{icon}{title}</h2>
            <span className={`measure-chip instruction-pill ${instructionClass}`}>{instructionLabel}</span>
          </div>
          {!isError && (
            <p className={`measure-status ${isDone ? "message-ok" : "message-warning"}`}>{chipText}</p>
          )}
          {!isError && !isDone && !!alertMessage && (
            <div className="measure-alert-popup" role="status" aria-live="assertive">
              <strong>{alertTitle || "Hold Position"}</strong>
              <span>{alertMessage}</span>
            </div>
          )}
          {!isError && isDone && (
            <div className="measure-done-popup" role="status" aria-live="polite">
              <strong>Done</strong>
              <span>{value}</span>
            </div>
          )}

          <div className={`measure-visual-stage ${isWeight ? "visual-weight" : "visual-height"}`}>
            {isWeight ? (
              <div className="weight-visual">
                <div className="weight-scale">
                  <div className="weight-display">
                    <span className="weight-display-label">KG</span>
                    <motion.span
                      className="weight-display-digits"
                      animate={{ opacity: [0.7, 1, 0.7] }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                    >
                      {displayDigits}
                    </motion.span>
                  </div>
                  <motion.div
                    className="weight-scan-line"
                    animate={{ x: [-48, 48] }}
                    transition={{ duration: 1.7, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
                  />
                  <div className="weight-pad" />
                  <div className="weight-feet" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
                <div className="weight-shadow" />
              </div>
            ) : (
              <div className="height-visual">
                <div className="height-ruler" />
                <motion.div
                  className="height-scan-beam"
                  animate={{ y: [-68, 68] }}
                  transition={{ duration: 1.8, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
                />
                <div className="height-ticks" aria-hidden="true">
                  {Array.from({ length: 6 }).map((_, i) => <span key={i} />)}
                </div>
              </div>
            )}
          </div>

          <div className={`meter-wrap measure-meter ${isWeight ? "measure-meter-weight" : "measure-meter-height"}`}>
            <div className="measure-metric">
              <span className="meter-label">{label}</span>
              <span className="measure-sub">{meterModeLabel}</span>
            </div>
            <motion.strong
              animate={{ scale: loading ? [1, 1.05, 1] : [1, 1.02, 1] }}
              transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
            >
              {value}
            </motion.strong>
          </div>
          <div className="measure-signal">
            <span><ScanLine /> Signal</span>
            <div className="measure-signal-bars" aria-hidden="true">
              <i className="bar bar-a" />
              <i className="bar bar-b" />
              <i className="bar bar-c" />
              <i className="bar bar-d" />
            </div>
          </div>
        </div>
      </div>

      <div className="actions measure-actions">
        {!isDone && typeof onCancel === "function" && (
          <button className="btn measure-cancel-btn" onClick={onCancel}>Cancel</button>
        )}
        {isError && typeof onBackToMenu === "function" && (
          <>
            <p className={returnMessageClass}>{returnMessage}</p>
            {typeof onRetry === "function" && (
              <button className="btn btn-primary measure-next-btn" onClick={onRetry}>Retry</button>
            )}
            <button className="btn measure-back-btn" onClick={onBackToMenu}>Back to Menu</button>
          </>
        )}
        {!isError && isDone && !!returnMessage && (
          <p className={returnMessageClass}>{returnMessage}</p>
        )}
      </div>
    </div>
  );
}
