import { useState } from "react";
import { Activity, ArrowRight, KeyRound, QrCode, ShieldCheck, UserRound } from "lucide-react";
import QRCode from "react-qr-code";
import { normalizeBmiCategory } from "../services/bmi";

const BMI_MIN = 10;
const BMI_MAX = 40;
const BMI_SEGMENTS = [
  { key: "underweight", label: "Underweight", range: "Below 18.5", start: BMI_MIN, end: 18.5, color: "#8fd8f8" },
  { key: "normal", label: "Normal", range: "18.5 - 24.9", start: 18.5, end: 25, color: "#38b772" },
  { key: "overweight", label: "Overweight", range: "25.0 - 29.9", start: 25, end: 30, color: "#f0af3d" },
  { key: "obese", label: "Obese", range: "30.0 and above", start: 30, end: BMI_MAX, color: "#df5a5a" },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function polarToCartesian(cx, cy, radius, angleDegrees) {
  const angleRadians = (angleDegrees - 90) * Math.PI / 180.0;
  return {
    x: cx + radius * Math.cos(angleRadians),
    y: cy + radius * Math.sin(angleRadians),
  };
}

function describeArc(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function bmiToAngle(bmi) {
  const normalized = (clamp(Number.isFinite(bmi) ? bmi : BMI_MIN, BMI_MIN, BMI_MAX) - BMI_MIN) / (BMI_MAX - BMI_MIN);
  return -90 + normalized * 180;
}

function segmentToAngles(start, end) {
  const safeStart = clamp(start, BMI_MIN, BMI_MAX);
  const safeEnd = clamp(end, BMI_MIN, BMI_MAX);
  const startAngle = bmiToAngle(safeStart);
  const endAngle = bmiToAngle(safeEnd);
  return { startAngle, endAngle };
}

function getBmiSegmentKey(category) {
  const value = String(category || "").toLowerCase();
  if (value.includes("under")) return "underweight";
  if (value.includes("normal")) return "normal";
  if (value.includes("over")) return "overweight";
  if (value.includes("obese")) return "obese";
  return "";
}

function kgToLb(kg) {
  if (!Number.isFinite(Number(kg))) return "--";
  return `${(Number(kg) * 2.20462).toFixed(1)} lb`;
}

function cmToFeetInches(cm) {
  if (!Number.isFinite(Number(cm))) return "--";
  const totalInches = Number(cm) / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return `${feet} ft ${inches} in`;
}

export default function ResultPage({ user, offlineNotice = "", onReset, onRegister, onAnalytics }) {
  const dashboardUrl = `https://dynamos-smart-bmi.vercel.app/?userId=${encodeURIComponent(user.id)}`;
  const displayPassword = user?.password || "12345";
  const isGuest = Boolean(user?.isGuest);
  const [weightUnit, setWeightUnit] = useState("kg");
  const [heightUnit, setHeightUnit] = useState("cm");
  const bmiValue = Number(user?.bmi);
  const hasBmiValue = Number.isFinite(bmiValue);
  const normalizedCategory = normalizeBmiCategory(user?.category);
  const activeSegmentKey = getBmiSegmentKey(normalizedCategory);
  const markerAngle = bmiToAngle(hasBmiValue ? bmiValue : 22);
  const categoryKey = String(normalizedCategory || "").toLowerCase();
  const categoryTone = categoryKey.includes("normal")
    ? { accent: "#0d8f7b", soft: "#e9fbf7", title: "Healthy Range" }
    : categoryKey.includes("under")
      ? { accent: "#16789c", soft: "#eef8fc", title: "Needs Attention" }
      : categoryKey.includes("over")
        ? { accent: "#c97912", soft: "#fff5e8", title: "Weight Watch" }
        : categoryKey.includes("obese")
          ? { accent: "#c64d4d", soft: "#fff0f0", title: "Action Needed" }
          : { accent: "#16789c", soft: "#eef8fc", title: "Measurement Ready" };
  const weightDisplay = weightUnit === "lb"
    ? kgToLb(user?.weightKg)
    : (user.weightKg != null ? `${user.weightKg} kg` : "--");
  const heightDisplay = heightUnit === "ft-in"
    ? cmToFeetInches(user?.heightCm)
    : (user.heightCm != null ? `${user.heightCm} cm` : "--");
  const resultTiles = [
    ["Name", user.name || "--", <UserRound />],
    ["Age", user.age ?? "--"],
    ["Sex", user.sex || "--"],
    ["Weight", weightDisplay, null, "weight"],
    ["Height", heightDisplay, null, "height"],
  ];

  return (
    <div className="page-with-actions result-page">
      <div
        className="result-layout"
        style={{
          width: "min(1820px, 100%)",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.6fr) minmax(340px, 0.95fr)",
          gap: 16,
          alignItems: "stretch",
          paddingTop: 4,
          minHeight: "100%",
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 24,
            border: "1px solid rgba(84,172,191,.18)",
            boxShadow: "0 20px 46px rgba(2,56,89,.12)",
            padding: "18px 18px 16px",
            display: "grid",
            gridTemplateRows: "auto",
            alignContent: "stretch",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10, fontSize: "26px", color: "#14527b" }}>
              <Activity />
              Result Page
            </h2>
            <span
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                background: "#eef8fc",
                border: "1px solid rgba(84,172,191,.18)",
                color: "#16789c",
                fontSize: "12px",
                fontWeight: 800,
                letterSpacing: "0.05em",
              }}
            >
              {isGuest ? "GUEST SESSION" : "PROFILE CONFIRMED"}
            </span>
          </div>

          {!!offlineNotice && (
            <div
              role="status"
              aria-live="polite"
              style={{
                padding: "12px 16px",
                borderRadius: 16,
                background: "#eef8fc",
                border: "1px solid rgba(84,172,191,.18)",
                color: "#14527b",
                fontSize: "16px",
                fontWeight: 700,
                lineHeight: 1.35,
              }}
            >
              {offlineNotice}
            </div>
          )}

          <div
            className="result-main-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.08fr) minmax(0, 0.92fr)",
              gap: 14,
              alignItems: "start",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, alignContent: "start" }}>
              {resultTiles.map(([k, v, icon, type], i) => (
              <div
                key={k}
                style={{
                  padding: "14px 18px 12px",
                  borderRadius: "16px",
                  minHeight: "94px",
                  background: "linear-gradient(135deg, #55b7cf 0%, #4caec8 62%, #52a7da 100%)",
                  color: "white",
                  boxShadow: "0 12px 24px rgba(63,169,203,.18)",
                  display: "grid",
                  alignContent: "space-between",
                }}
              >
                <div
                  style={{
                    fontSize: "17px",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    textTransform: "uppercase",
                    letterSpacing: "0.03em",
                    opacity: 0.95,
                  }}
                >
                  {icon}
                  {k}
                </div>
                <div style={{ fontSize: k === "Name" ? "40px" : "36px", lineHeight: 1.05, fontWeight: 800, marginTop: 8 }}>
                  {v}
                </div>
                {type === "weight" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                    {["kg", "lb"].map((unit) => {
                      const isActive = weightUnit === unit;
                      return (
                        <button
                          key={unit}
                          type="button"
                          onClick={() => setWeightUnit(unit)}
                          style={{
                            minHeight: "34px",
                            padding: "3px 10px",
                            borderRadius: 999,
                            border: isActive ? "2px solid rgba(255,255,255,.95)" : "1px solid rgba(255,255,255,.45)",
                            background: isActive ? "rgba(18,76,112,.26)" : "rgba(255,255,255,.10)",
                            color: "#fff",
                            fontSize: "17px",
                            fontWeight: 800,
                          }}
                        >
                          {unit}
                        </button>
                      );
                    })}
                  </div>
                )}
                {type === "height" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                    {[
                      { key: "cm", label: "cm" },
                      { key: "ft-in", label: "ft / in" },
                    ].map((unit) => {
                      const isActive = heightUnit === unit.key;
                      return (
                        <button
                          key={unit.key}
                          type="button"
                          onClick={() => setHeightUnit(unit.key)}
                          style={{
                            minHeight: "34px",
                            padding: "3px 10px",
                            borderRadius: 999,
                            border: isActive ? "2px solid rgba(255,255,255,.95)" : "1px solid rgba(255,255,255,.45)",
                            background: isActive ? "rgba(18,76,112,.26)" : "rgba(255,255,255,.10)",
                            color: "#fff",
                            fontSize: "17px",
                            fontWeight: 800,
                          }}
                        >
                          {unit.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            </div>

            <div
              className="bmi-parameters-card"
              style={{
                display: "grid",
                gap: 12,
                padding: "16px 16px 14px",
                borderRadius: 20,
                background: "#fafdff",
                border: "1px solid rgba(84,172,191,.14)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,.65)",
              }}
            >
              <div style={{ display: "grid", gap: 6 }}>
                <h3 style={{ margin: 0, fontSize: "34px", lineHeight: 1, color: "#124c70" }}>BMI Parameters</h3>
                <p style={{ margin: 0, fontSize: "17px", lineHeight: 1.35, color: "#3c6d81" }}>
                  Use this guide to understand what your BMI score means at a glance.
                </p>
              </div>

              <div style={{ display: "grid", justifyItems: "center", gap: 10 }}>
                <svg viewBox="0 0 360 205" style={{ width: "100%", maxWidth: 300, overflow: "visible" }} aria-label="BMI gauge">
                  <path
                    d={describeArc(180, 176, 98, -90, 90)}
                    stroke="#d8edf6"
                    strokeWidth="24"
                    fill="none"
                    strokeLinecap="round"
                  />
                  {BMI_SEGMENTS.map((segment) => {
                    const { startAngle, endAngle } = segmentToAngles(segment.start, segment.end);
                    const isActive = segment.key === activeSegmentKey;
                    return (
                      <path
                        key={segment.key}
                        d={describeArc(180, 176, 98, startAngle, endAngle)}
                        stroke={segment.color}
                        strokeWidth={isActive ? "28" : "24"}
                        fill="none"
                        strokeLinecap="round"
                        style={{ filter: isActive ? "drop-shadow(0 6px 14px rgba(18,76,112,.16))" : "none" }}
                      />
                    );
                  })}

                  <line
                    x1={180}
                    y1={176}
                    x2={polarToCartesian(180, 176, 64, markerAngle).x}
                    y2={polarToCartesian(180, 176, 64, markerAngle).y}
                    stroke="#123d56"
                    strokeWidth="7"
                    strokeLinecap="round"
                  />
                  <circle cx={180} cy={176} r="14" fill="#123d56" />
                  <circle cx={polarToCartesian(180, 176, 98, markerAngle).x} cy={polarToCartesian(180, 176, 98, markerAngle).y} r="8" fill="#123d56" stroke="#ffffff" strokeWidth="4" />

                  {[10, 18.5, 25, 30, 40].map((tick) => {
                    const angle = bmiToAngle(tick);
                    const start = polarToCartesian(180, 176, 118, angle);
                    const end = polarToCartesian(180, 176, 130, angle);
                    const label = polarToCartesian(180, 176, 144, angle);
                    return (
                      <g key={tick}>
                        <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#6d99ae" strokeWidth="3" strokeLinecap="round" />
                        <text
                          x={label.x}
                          y={label.y}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#315e75"
                          fontSize="16"
                          fontWeight="700"
                        >
                          {tick}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                <div
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 16,
                    background: `${categoryTone.soft}`,
                    border: `2px solid ${categoryTone.accent}22`,
                    textAlign: "center",
                    display: "grid",
                    gap: 4,
                  }}
                >
                  <strong style={{ fontSize: "22px", color: "#124c70", lineHeight: 1.08 }}>
                    Your BMI is {hasBmiValue ? user.bmi : "--"} - {normalizedCategory || "--"}
                  </strong>
                  <span style={{ fontSize: "17px", color: categoryTone.accent, fontWeight: 800 }}>
                    {hasBmiValue ? `Marker positioned at BMI ${user.bmi}` : "BMI marker is waiting for a valid reading"}
                  </span>
                </div>
              </div>

              <div
                className="bmi-guide-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  alignContent: "center",
                }}
              >
                {BMI_SEGMENTS.map((segment) => {
                  const isActive = segment.key === activeSegmentKey;
                  return (
                    <div
                      key={segment.key}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "14px 1fr auto",
                        gap: 8,
                        alignItems: "center",
                        padding: "10px 12px",
                        borderRadius: 16,
                        background: isActive ? `${segment.color}33` : "#ffffff",
                        border: isActive ? `3px solid ${segment.color}` : "1px solid rgba(84,172,191,.18)",
                        boxShadow: isActive ? "0 10px 22px rgba(18,76,112,.10)" : "none",
                      }}
                    >
                      <span style={{ width: 14, height: 14, borderRadius: "50%", background: segment.color, display: "block" }} />
                      <div style={{ display: "grid", gap: 2 }}>
                        <strong style={{ fontSize: "20px", lineHeight: 1.08, color: "#124c70" }}>{segment.label}</strong>
                        <span style={{ fontSize: "17px", lineHeight: 1.2, color: "#456d80" }}>{segment.range}</span>
                      </div>
                      <strong style={{ fontSize: "17px", color: isActive ? "#124c70" : "#7d9aaa" }}>
                        {isActive ? "Current" : ""}
                      </strong>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            margin: 0,
            padding: "16px",
            borderRadius: "24px",
            background: "#fff",
            border: "1px solid rgba(84,172,191,.18)",
            boxShadow: "0 20px 46px rgba(2,56,89,.12)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {isGuest ? (
            <div style={{ display: "grid", gap: "16px", alignContent: "center", minHeight: "100%" }}>
              <div style={{ display: "grid", gap: 10 }}>
                <h3 style={{ fontSize: "28px", lineHeight: 1.2, margin: 0, color: "#14527b" }}>Register This Result?</h3>
                <span style={{ display: "inline-flex", width: "fit-content", padding: "8px 12px", borderRadius: 999, background: "#eef8fc", color: "#16789c", fontSize: "12px", fontWeight: 800, letterSpacing: "0.05em" }}>
                  GUEST ONLY
                </span>
              </div>
              <div style={{ fontSize: "16px", lineHeight: 1.5, color: "#33667f" }}>
                Save this guest result to a profile and set up facial recognition for future use.
              </div>
              <div style={{ display: "grid", gap: "12px" }}>
                {typeof onRegister === "function" && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={onRegister}
                    style={{ minHeight: "128px", borderRadius: "22px", fontSize: "40px", fontWeight: 800, boxShadow: "0 12px 26px rgba(35,170,210,.22)" }}
                  >
                    Yes, Register
                  </button>
                )}
                <button
                  type="button"
                  className="btn"
                  onClick={onReset}
                  style={{ minHeight: "128px", borderRadius: "22px", fontSize: "34px", fontWeight: 800, background: "linear-gradient(135deg, #67c7de, #44b2d0)", color: "#fff", border: "none" }}
                >
                  No, Return to Idle
                </button>
              </div>
              <div
                style={{
                  padding: "18px",
                  borderRadius: 16,
                  background: "#f8fcfe",
                  border: "1px solid rgba(84,172,191,.12)",
                  display: "grid",
                  gap: 10,
                }}
              >
                <strong style={{ color: "#14527b", fontSize: "18px" }}>Guest session only</strong>
                <span style={{ color: "#4a6e7f", lineHeight: 1.45 }}>
                  This reading is available now, but it will not be linked to a reusable Smart BMI profile unless you register.
                </span>
                <span style={{ color: "#16789c", fontWeight: 700 }}>
                  Registering now lets the kiosk recognize you on future visits.
                </span>
              </div>
            </div>
          ) : (
            <>
              <div>
                <h3 style={{ fontSize: "24px", lineHeight: 1.2, margin: 0, display: "flex", alignItems: "center", gap: 10, color: "#14527b" }}>
                  <ShieldCheck />
                  Access Your Smart BMI Profile
                </h3>
              </div>
              <div style={{ fontSize: "15px", lineHeight: 1.45, color: "#33667f" }}>
                Scan the QR code, then use your User ID and password to open your Smart BMI profile.
              </div>
              <div
                role="note"
                aria-label={`User ID ${user.id}`}
                style={{
                  padding: "20px 22px",
                  borderRadius: "20px",
                  background: "linear-gradient(180deg,#f5fbfd,#edf8fc)",
                  border: "1px solid rgba(84,172,191,.16)",
                  textAlign: "center",
                }}
              >
                <span style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#16789c", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  User ID
                </span>
                <strong style={{ display: "block", fontSize: "56px", color: "#14527b", marginTop: 8, lineHeight: 1 }}>{user.id}</strong>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "44px 1fr", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 12, background: "#f8fcfe", border: "1px solid rgba(84,172,191,.12)" }}>
                  <span style={{ width: 38, height: 38, borderRadius: "50%", display: "grid", placeItems: "center", background: "#e8f7fb", color: "#1992b6" }}>
                    <QrCode size={18} />
                  </span>
                  <p style={{ margin: 0, color: "#214f66", lineHeight: 1.4 }}>Scan the QR code to open your Smart BMI profile securely.</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "44px 1fr", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 12, background: "#f8fcfe", border: "1px solid rgba(84,172,191,.12)" }}>
                  <span style={{ width: 38, height: 38, borderRadius: "50%", display: "grid", placeItems: "center", background: "#e8f7fb", color: "#1992b6" }}>
                    <UserRound size={18} />
                  </span>
                  <p style={{ margin: 0, color: "#214f66", lineHeight: 1.4 }}>Sign in using the User ID shown above.</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "44px 1fr", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 12, background: "#f8fcfe", border: "1px solid rgba(84,172,191,.12)" }}>
                  <span style={{ width: 38, height: 38, borderRadius: "50%", display: "grid", placeItems: "center", background: "#e8f7fb", color: "#1992b6" }}>
                    <KeyRound size={18} />
                  </span>
                  <p style={{ margin: 0, color: "#214f66", lineHeight: 1.4 }}>Password: <strong>{displayPassword}</strong></p>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "176px 1fr",
                  gap: "14px",
                  alignItems: "center",
                  padding: "16px 14px",
                  borderRadius: 16,
                  background: "#f8fcfe",
                  border: "1px solid rgba(84,172,191,.12)",
                }}
              >
                <div style={{ width: 172, height: 172, padding: 10, borderRadius: 16, background: "#fff", boxShadow: "0 8px 18px rgba(2,56,89,.08)" }}>
                  <QRCode
                    value={dashboardUrl}
                    size={152}
                    bgColor="#ffffff"
                    fgColor="#0f224a"
                    level="M"
                  />
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <strong style={{ fontSize: "22px", color: "#14527b" }}>Smart BMI Profile Login</strong>
                  <span style={{ fontSize: "15px", lineHeight: 1.4, color: "#4a6e7f" }}>
                    Scan the QR code, then enter your User ID and the password shown above to access your dashboard.
                  </span>
                </div>
              </div>
              {typeof onAnalytics === "function" && (
                <button
                  type="button"
                  onClick={onAnalytics}
                  style={{
                    padding: "16px 18px",
                    borderRadius: "18px",
                    minHeight: "104px",
                    width: "100%",
                    background: "linear-gradient(135deg, #2b7a9d, #1d5f84)",
                    color: "white",
                    border: "none",
                    textAlign: "left",
                    boxShadow: "0 12px 24px rgba(31,95,133,.2)",
                    display: "grid",
                    alignContent: "space-between",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      textTransform: "uppercase",
                      letterSpacing: "0.03em",
                      opacity: 0.95,
                    }}
                  >
                    <Activity />
                    BMI Analytics
                  </span>
                  <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                    <strong style={{ fontSize: "26px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      View Analytics
                      <ArrowRight size={24} />
                    </strong>
                    <span style={{ fontSize: "15px", lineHeight: 1.35, opacity: 0.92 }}>
                      Tap here to open your BMI trends and recommendations.
                    </span>
                  </div>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="actions">
        {!isGuest && (
          <button className="btn btn-primary result-finish-btn" onClick={onReset}>
            Finish
          </button>
        )}
      </div>
    </div>
  );
}
