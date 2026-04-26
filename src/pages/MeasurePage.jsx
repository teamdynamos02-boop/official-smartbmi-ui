import { Ruler, ScanLine, Weight } from "lucide-react";

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
  onNext,
}) {
  const isWeight = label.toLowerCase().includes("weight");
  const icon = isWeight ? <Weight /> : <Ruler />;
  const chipText = status;
  const isDone = statusType === "done";
  const isError = statusType === "error";
  const returnMessageClass = isDone
    ? "measure-returning-msg measure-next-msg"
    : "measure-returning-msg measure-returning-msg-alert";
  const instructionLabel = isDone ? "DONE" : (isError ? (statusLabel || "ERROR") : "MEASURING");
  const rawValue = String(value ?? (isWeight ? "--.- kg" : "-- cm"));
  const valueMatch = rawValue.match(/^(.+?)\s*(kg|cm)$/i);
  const displayDigits = valueMatch ? valueMatch[1] : rawValue;
  const displayUnit = valueMatch ? valueMatch[2] : "";
  const meterModeLabel = "Auto";
  const liveLabel = isWeight ? "Weight" : "Height";
  const centerInstruction = isWeight
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

  return (
    <div className="page-with-actions measure-page">
      <div className="screen-grid single-col" style={{ minHeight: "100%", alignContent: "center", justifyItems: "center" }}>
        <div
          style={{
            width: "min(1860px, 100%)",
            margin: "0 auto",
            padding: "18px 18px 10px",
            minHeight: "calc(100% - 72px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 1760,
              background: "#fff",
              borderRadius: 26,
              border: "1px solid rgba(84,172,191,.18)",
              boxShadow: "0 20px 46px rgba(2,56,89,.12)",
              padding: "28px 30px 22px",
              display: "grid",
              gap: 16,
            }}
          >
            {!isDone && !isError && (
              <div style={{ display: "grid", gap: 14 }}>
                <div role="note" aria-live="polite" style={{ minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <strong style={{ fontSize: "34px", fontWeight: 700, lineHeight: 1.1, color: "#214f66" }}>
                    {centerInstruction.title}
                  </strong>
                </div>
                <div aria-label={`${label} guidance`} style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 14 }}>
                  {centerInstruction.steps.map((step, index) => (
                    <div
                      key={step}
                      style={{
                        fontSize: "18px",
                        padding: "14px 18px",
                        minHeight: 48,
                        borderRadius: 14,
                        background: "linear-gradient(180deg,#f2fbfe,#ebf7fb)",
                        border: "1px solid rgba(84,172,191,.16)",
                        display: "grid",
                        gridTemplateColumns: "34px 1fr",
                        alignItems: "center",
                        gap: 12,
                        color: "#214f66",
                        fontWeight: 600,
                      }}
                    >
                      <b
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          display: "grid",
                          placeItems: "center",
                          background: "#d7f1f7",
                          color: "#18789d",
                          fontSize: "14px",
                        }}
                      >
                        {index + 1}
                      </b>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18 }}>
              <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 12, fontSize: "32px", lineHeight: 1.1, color: "#14527b", fontWeight: 700 }}>
                {icon}
                {title}
              </h2>
              <span
                style={{
                  padding: "10px 20px",
                  borderRadius: 999,
                  background: "#47b8d2",
                  color: "#fff",
                  fontSize: "18px",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                }}
              >
                {instructionLabel}
              </span>
            </div>

            {!isError && (
              <p style={{ fontSize: "22px", lineHeight: 1.3, fontWeight: 600, color: "#26acc8", textAlign: "center", margin: 0 }}>
                {chipText}
              </p>
            )}

            {!isError && !isDone && !!alertMessage && (
              <div
                role="status"
                aria-live="assertive"
                style={{
                  justifySelf: "center",
                  minWidth: 320,
                  padding: "16px 24px",
                  borderRadius: 14,
                  background: "#0d5f56",
                  color: "#fff",
                  textAlign: "center",
                  boxShadow: "0 12px 22px rgba(13,95,86,.25)",
                }}
              >
                <strong style={{ display: "block", fontSize: "22px" }}>{alertTitle || "Hold Position"}</strong>
                <span style={{ fontSize: "18px" }}>{alertMessage}</span>
              </div>
            )}

            {!isError && isDone && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  justifySelf: "center",
                  minWidth: 320,
                  padding: "16px 24px",
                  borderRadius: 14,
                  background: "#0d5f56",
                  color: "#fff",
                  textAlign: "center",
                  boxShadow: "0 12px 22px rgba(13,95,86,.25)",
                }}
              >
                <strong style={{ display: "block", fontSize: "22px" }}>Done</strong>
                <span style={{ fontSize: "18px" }}>{value}</span>
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: "196px",
                overflow: "visible",
                marginBottom: "2px",
                borderRadius: 18,
                background: "linear-gradient(180deg,#d8f0f8,#cfeaf5)",
                border: "1px solid rgba(84,172,191,.2)",
                position: "relative",
              }}
            >
              {isWeight ? (
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", width: "100%", height: "100%", overflow: "visible" }}>
                  <div
                    style={{
                      width: 252,
                      height: 112,
                      position: "relative",
                      borderRadius: 24,
                      background: "linear-gradient(180deg,#2b4f8e,#244780)",
                      boxShadow: "0 14px 24px rgba(25,64,120,.22)",
                      overflow: "visible",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 14,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: 96,
                        height: 24,
                        borderRadius: 7,
                        background: "linear-gradient(180deg,#19335e,#244780)",
                        boxShadow: "inset 0 0 0 1px rgba(131,217,239,.2)",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "grid",
                          placeItems: "center",
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.08em",
                          color: "#58d5e9",
                        }}
                      >
                        KG
                      </span>
                    </div>
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 20,
                        height: 50,
                        borderRadius: 16,
                        background: "linear-gradient(180deg,#457bbf,#346cb0)",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        left: "50%",
                        top: 16,
                        transform: "translateX(-50%)",
                        width: 124,
                        height: 56,
                        borderRadius: 16,
                        background: "rgba(12,29,67,.88)",
                        display: "grid",
                        placeItems: "center",
                        boxShadow: "inset 0 0 0 1px rgba(131,217,239,.35)",
                      }}
                    >
                      <span
                        style={{ fontSize: "36px", fontWeight: 700, color: "#6be0ef", lineHeight: 1 }}
                      >
                        {displayDigits}
                      </span>
                    </div>
                    <div
                      style={{
                        position: "absolute",
                        left: "50%",
                        bottom: 40,
                        width: 100,
                        height: 2,
                        marginLeft: -50,
                        background: "linear-gradient(90deg,transparent,#69dbef,transparent)",
                      }}
                    />
                    <div aria-hidden="true" style={{ position: "absolute", left: 42, right: 42, bottom: 12, display: "flex", justifyContent: "space-between" }}>
                      {Array.from({ length: 4 }).map((_, i) => (
                        <i key={i} style={{ width: 16, height: 10, borderRadius: 4, background: "#1c2f58", display: "block" }} />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", width: "100%", height: "100%", overflow: "visible" }}>
                  <div style={{ position: "relative", width: 150, height: 132, display: "grid", placeItems: "center" }}>
                    <div
                      style={{
                        width: 36,
                        height: 98,
                        borderRadius: 18,
                        background: "linear-gradient(180deg,#7dbbf1,#6fa8ea 55%,#88c2f1)",
                        boxShadow: "inset 0 0 10px rgba(255,255,255,.5), 0 10px 18px rgba(42,96,157,.18)",
                      }}
                    />
                    <div style={{ position: "absolute", right: 22, top: 16, width: 22, height: 88, display: "grid", alignContent: "space-between" }}>
                      {Array.from({ length: 7 }).map((_, i) => (
                        <span key={i} style={{ display: "block", width: i % 2 === 0 ? 20 : 12, height: 3, background: "rgba(100,177,221,.85)", justifySelf: "start" }} />
                      ))}
                    </div>
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      width: 72,
                      height: 5,
                      borderRadius: 999,
                      background: "linear-gradient(90deg,transparent,#3fc8ea,transparent)",
                    }}
                  />
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: 0,
                minHeight: 68,
                padding: "16px 22px",
                borderRadius: 14,
                background: "linear-gradient(90deg,#2bb4d0,#329fd3)",
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                alignItems: "center",
                gap: 18,
                boxShadow: "0 14px 24px rgba(31,162,201,.18)",
              }}
            >
              <div style={{ color: "#fff", display: "grid", gap: 2 }}>
                <span style={{ fontSize: "58px", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.03em" }}>{liveLabel}</span>
                <span style={{ fontSize: "44px", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.03em", opacity: 0.9 }}>{meterModeLabel}</span>
              </div>
              <div
                style={{
                  justifySelf: "end",
                  fontSize: "132px",
                  lineHeight: 0.95,
                  display: "flex",
                  alignItems: "baseline",
                  gap: "12px",
                  color: "#fff",
                  fontWeight: 700,
                  letterSpacing: "-0.03em",
                }}
              >
                <span>{displayDigits}</span>
                {displayUnit && <span style={{ fontSize: "0.82em", opacity: 0.98 }}>{displayUnit}</span>}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#34657e", fontSize: "15px", fontWeight: 600 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <ScanLine size={14} />
                Signal
              </span>
              <div aria-hidden="true" style={{ display: "flex", alignItems: "flex-end", gap: 3 }}>
                {[8, 12, 16, 20].map((h) => (
                  <i key={h} style={{ display: "block", width: 5, height: h + 2, borderRadius: 999, background: "linear-gradient(180deg,#a3e8f0,#37b4d0)" }} />
                ))}
              </div>
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
        {isDone && typeof onNext === "function" && (
          <button className="btn btn-primary measure-next-btn" onClick={onNext}>Continue</button>
        )}
      </div>
    </div>
  );
}
