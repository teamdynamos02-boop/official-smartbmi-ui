import { Ruler, ScanLine, Scale, Weight } from "lucide-react";
import { motion } from "framer-motion";

function buildInstruction(isWeight) {
  return isWeight
    ? {
        title: "Stand Still",
        steps: [
          "Step fully onto the platform.",
          "Keep both feet planted and your body centered.",
          "Do not sway or step down until the reading locks.",
        ],
      }
    : {
        title: "Stand Straight",
        steps: [
          "Stand directly below the height sensor.",
          "Look straight ahead with your chin level.",
          "Keep your heels flat and do not tiptoe or bend.",
        ],
      };
}

function resolveDefaultStatus(kind, tone) {
  if (tone === "error") {
    return kind === "weight" ? "Weight measurement failed." : "Height measurement failed.";
  }
  if (tone === "incomplete") {
    return kind === "weight" ? "Preparing scale. Please wait." : "Stand under sensor.";
  }
  return kind === "weight" ? "Weight captured." : "Height captured.";
}

function resolveStatusLabel(tone) {
  if (tone === "error") return "ERROR";
  if (tone === "incomplete") return "CHECKING";
  return "CHECKED";
}

function MeasureComboTile({
  kind,
  status,
  statusType,
  statusLabel,
  value,
  alertTitle,
  alertMessage,
  lightMotion,
}) {
  const isWeight = kind === "weight";
  const icon = isWeight ? <Weight /> : <Ruler />;
  const isDone = statusType === "done";
  const isError = statusType === "error";
  const instructionLabel = statusLabel || (isDone ? "CHECKED" : "INCOMPLETE");
  const instructionClass = isDone ? "instruction-done" : "instruction-alert";
  const displayDigits = isWeight
    ? String(value ?? "--.- kg").replace(/\s*kg\s*$/i, "")
    : String(value ?? "--");
  const centerInstruction = buildInstruction(isWeight);

  return (
    <div className="panel measure-panel measure-combo-panel">
      {!isDone && !isError && (
        <div className="measure-guidance-wrap">
          <div className="measure-top-instruction" role="note" aria-live="polite">
            <strong>{centerInstruction.title}</strong>
          </div>
          <div className="measure-guidance-strip" aria-label={`${isWeight ? "Weight" : "Height"} guidance`}>
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
        <h2 className="measure-title">{icon}{isWeight ? "Weight Measurement" : "Height Measurement"}</h2>
        <span className={`measure-chip instruction-pill ${instructionClass}`}>{instructionLabel}</span>
      </div>
      {!isError && (
        <p className={`measure-status ${isDone ? "message-ok" : "message-warning"}`}>{status}</p>
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
                  animate={lightMotion ? undefined : { opacity: [0.7, 1, 0.7] }}
                  transition={lightMotion ? undefined : { duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                >
                  {displayDigits}
                </motion.span>
              </div>
              <motion.div
                className="weight-scan-line"
                animate={lightMotion ? undefined : { x: [-48, 48] }}
                transition={lightMotion ? undefined : { duration: 1.7, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
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
              animate={lightMotion ? undefined : { y: [-68, 68] }}
              transition={lightMotion ? undefined : { duration: 1.8, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
            />
            <div className="height-ticks" aria-hidden="true">
              {Array.from({ length: 6 }).map((_, i) => <span key={i} />)}
            </div>
          </div>
        )}
      </div>

      <div className={`meter-wrap measure-meter ${isWeight ? "measure-meter-weight" : "measure-meter-height"}`}>
        <div className="measure-metric">
          <span className="meter-label">{isWeight ? "Weight" : "Height"}</span>
          <span className="measure-sub">Auto</span>
        </div>
        <motion.strong
          animate={lightMotion ? undefined : { scale: [1, 1.02, 1] }}
          transition={lightMotion ? undefined : { duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
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
  );
}

export default function MeasureComboPage({
  title = "Measurement Preview",
  subtitle = "Weight then height",
  weightValue = "--.- kg",
  heightValue = "-- cm",
  tone = "done",
  returnMessage = "",
  onBackToMenu,
}) {
  const LIGHT_MOTION = String(import.meta.env.VITE_KIOSK_LIGHT_MOTION ?? "true").toLowerCase() === "true";
  const normalizedTone = ["done", "error", "incomplete"].includes(tone) ? tone : "done";
  const weightStatus = resolveDefaultStatus("weight", normalizedTone);
  const heightStatus = resolveDefaultStatus("height", normalizedTone);
  const statusLabel = resolveStatusLabel(normalizedTone);

  return (
    <div className="page-with-actions measure-combo-page">
      <div className="screen-grid single-col measure-combo-stack">
        <div className="measure-combo-header">
          <h2 className="measure-combo-title"><Scale /> {title}</h2>
          <div className="measure-combo-meta">
            <span className="measure-chip measure-combo-chip">PREVIEW</span>
            <span className="measure-combo-subtitle">{subtitle}</span>
          </div>
        </div>
        <MeasureComboTile
          kind="weight"
          status={weightStatus}
          statusType={normalizedTone}
          statusLabel={statusLabel}
          value={weightValue}
          lightMotion={LIGHT_MOTION}
        />
        <MeasureComboTile
          kind="height"
          status={heightStatus}
          statusType={normalizedTone}
          statusLabel={statusLabel}
          value={heightValue}
          lightMotion={LIGHT_MOTION}
        />
      </div>
      <div className="actions measure-actions">
        {!!returnMessage && <p className="measure-returning-msg measure-next-msg">{returnMessage}</p>}
        {typeof onBackToMenu === "function" && (
          <button className="btn measure-back-btn" onClick={onBackToMenu}>Back to Menu</button>
        )}
      </div>
    </div>
  );
}
