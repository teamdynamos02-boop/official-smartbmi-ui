import { Activity, AlertTriangle, CircleCheckBig, HeartPulse, MoveRight, Scale, ShieldAlert, TrendingUp, Ruler, Stethoscope } from "lucide-react";

function formatMetric(value, suffix = "") {
  if (value == null || Number.isNaN(Number(value))) return "--";
  return `${value}${suffix}`;
}

function formatCapturedLabel(entry, index) {
  if (entry?.capturedDate && entry?.capturedTime) return `${entry.capturedDate} ${entry.capturedTime}`;
  if (entry?.capturedAt) {
    const dt = new Date(entry.capturedAt);
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleString();
    }
  }
  return `Session ${index + 1}`;
}

function buildAdvice(current, previous, historyCount = 1) {
  const advice = [];
  const bmi = Number(current?.bmi);
  const weightDelta = current?.weightKg != null && previous?.weightKg != null
    ? Number((current.weightKg - previous.weightKg).toFixed(1))
    : null;
  const category = String(current?.category || "").toLowerCase();

  const addAdvice = (title, lead, body, tone = "neutral", icon = "next") => {
    advice.push({ title, lead, body, tone, icon });
  };

  if (Number.isFinite(bmi)) {
    if (bmi < 18.5) {
      addAdvice("Risk", `BMI ${bmi.toFixed(1)} is underweight.`, "Low energy, lower muscle reserve, and slower recovery can happen if this continues.", "warn", "warn");
      addAdvice("Action", "Increase intake with structure.", "Eat regular balanced meals, increase protein, and do strength-focused activity.", "action", "action");
    } else if (bmi < 25) {
      addAdvice("Status", `BMI ${bmi.toFixed(1)} is in the normal range.`, "This range supports lower weight-related risk when you maintain it.", "good", "good");
      addAdvice("Action", "Protect this range.", "Keep meals balanced, stay active, sleep well, and recheck regularly.", "action", "action");
    } else if (bmi < 30) {
      addAdvice("Risk", `BMI ${bmi.toFixed(1)} is in the overweight range.`, "If it stays here, risk for blood pressure, blood sugar, heart strain, and joint stress goes up.", "warn", "warn");
      addAdvice("Action", "Aim for slow, steady fat loss.", "Walk more, train regularly, cut liquid calories, and reduce oversized portions.", "action", "action");
    } else {
      addAdvice("Risk", `BMI ${bmi.toFixed(1)} is in the obese range.`, "Risk is higher for diabetes, heart disease, sleep problems, and joint strain.", "warn", "danger");
      addAdvice("Action", "Use a structured plan.", "Start with food control, low-impact activity, and medical follow-up if possible.", "action", "action");
    }
  }

  if (weightDelta != null) {
    if (weightDelta > 1.5) addAdvice("Trend", `Weight is up by ${weightDelta.toFixed(1)} kg.`, "If this continues, your BMI will likely rise.", "trend", "trend");
    else if (weightDelta < -1.5) addAdvice("Trend", `Weight is down by ${Math.abs(weightDelta).toFixed(1)} kg.`, "If this was intentional, keep the change slow and consistent.", "trend", "trend");
    else addAdvice("Trend", "Your recent weight is stable.", "That makes it easier to judge whether your routine is working.", "good", "good");
  }

  if (historyCount <= 1) {
    addAdvice("Next check", "This is your first recorded session.", "More readings will make the advice more accurate.", "neutral", "next");
  } else if (category.includes("normal")) {
    addAdvice("Next check", "Use this as your maintenance baseline.", "Try to keep future readings close to this range.", "good", "next");
  } else {
    addAdvice("Next check", "Recheck on a schedule.", "That will show whether your BMI is improving, stable, or getting worse.", "neutral", "next");
  }

  addAdvice("Important", "This is not a diagnosis.", "Use this page for guidance only. See a clinician for treatment decisions.", "neutral", "danger");
  return advice;
}

function AdviceIcon({ icon }) {
  if (icon === "good") return <CircleCheckBig />;
  if (icon === "warn") return <AlertTriangle />;
  if (icon === "danger") return <ShieldAlert />;
  if (icon === "trend") return <TrendingUp />;
  if (icon === "action") return <MoveRight />;
  return <Stethoscope />;
}

export default function AnalyticsPage({ user, history = [], onBack, onFinish }) {
  const sortedHistory = Array.isArray(history) ? [...history].sort((a, b) => (Number(a.capturedAt) || 0) - (Number(b.capturedAt) || 0)) : [];
  const fallbackCurrent = {
    weightKg: user?.weightKg ?? null,
    heightCm: user?.heightCm ?? null,
    bmi: user?.bmi ?? null,
    category: user?.category ?? "",
    capturedAt: Date.now(),
  };
  const points = sortedHistory.length > 0 ? sortedHistory : [fallbackCurrent];
  const current = points[points.length - 1] ?? fallbackCurrent;
  const previous = points.length > 1 ? points[points.length - 2] : null;
  const weightDelta = current?.weightKg != null && previous?.weightKg != null ? Number((current.weightKg - previous.weightKg).toFixed(1)) : null;
  const heightDelta = current?.heightCm != null && previous?.heightCm != null ? Number((current.heightCm - previous.heightCm).toFixed(1)) : null;
  const bmiDelta = current?.bmi != null && previous?.bmi != null ? Number((current.bmi - previous.bmi).toFixed(1)) : null;
  const advice = buildAdvice(current, previous, points.length);

  return (
    <div className="page-with-actions analytics-page">
      <div className="screen-grid analytics-screen-grid">
        <div className="panel panel-large analytics-main-panel">
          <div className="analytics-top">
            <div className="analytics-head">
              <h2><TrendingUp /> Analytics Page</h2>
              <span className="result-chip">PROGRESS TRACKING</span>
            </div>
            <div className="analytics-subtitle">
              Height, weight, and BMI changes across visits for {user?.name || "this user"}.
            </div>
            <div className="analytics-summary-grid">
              <div className="analytics-stat-card">
                <div className="analytics-stat-label"><Scale /> Weight Change</div>
                <div className="analytics-stat-value">{weightDelta == null ? formatMetric(current?.weightKg, " kg") : `${weightDelta > 0 ? "+" : ""}${weightDelta} kg`}</div>
                <div className="analytics-stat-note">Current: {formatMetric(current?.weightKg, " kg")}</div>
              </div>
              <div className="analytics-stat-card">
                <div className="analytics-stat-label"><Ruler /> Height Change</div>
                <div className="analytics-stat-value">{heightDelta == null ? formatMetric(current?.heightCm, " cm") : `${heightDelta > 0 ? "+" : ""}${heightDelta} cm`}</div>
                <div className="analytics-stat-note">Current: {formatMetric(current?.heightCm, " cm")}</div>
              </div>
              <div className="analytics-stat-card">
                <div className="analytics-stat-label"><Activity /> BMI Change</div>
                <div className="analytics-stat-value">{bmiDelta == null ? formatMetric(current?.bmi) : `${bmiDelta > 0 ? "+" : ""}${bmiDelta}`}</div>
                <div className="analytics-stat-note">Current: {formatMetric(current?.bmi)}</div>
              </div>
              <div className="analytics-stat-card">
                <div className="analytics-stat-label"><HeartPulse /> Overall Progress</div>
                <div className="analytics-stat-value">{current?.category || "--"}</div>
                <div className="analytics-stat-note">{points.length} recorded session{points.length === 1 ? "" : "s"}</div>
              </div>
            </div>
          </div>

          <div className="analytics-history-grid">
            <div className="panel analytics-history-panel">
              <div className="analytics-panel-head">Measurement History</div>
              <div className="analytics-history-list">
                {points.slice().reverse().map((entry, index) => (
                  <div className="analytics-history-item" key={`${entry?.capturedAt || "session"}-${index}`}>
                    <div className="analytics-history-time">{formatCapturedLabel(entry, points.length - index - 1)}</div>
                    <div className="analytics-history-metrics">
                      <div className="analytics-history-metric-chip">
                        <span className="analytics-history-metric-label">Weight</span>
                        <strong className="analytics-history-metric-value">{formatMetric(entry?.weightKg, " kg")}</strong>
                      </div>
                      <div className="analytics-history-metric-chip">
                        <span className="analytics-history-metric-label">Height</span>
                        <strong className="analytics-history-metric-value">{formatMetric(entry?.heightCm, " cm")}</strong>
                      </div>
                      <div className="analytics-history-metric-chip">
                        <span className="analytics-history-metric-label">BMI</span>
                        <strong className="analytics-history-metric-value">{formatMetric(entry?.bmi)}</strong>
                      </div>
                    </div>
                    <div className="analytics-history-category">{entry?.category || "--"}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel analytics-advice-panel">
              <div className="analytics-panel-head"><Stethoscope /> Health Advice</div>
              <div className="analytics-advice-list">
                {advice.map((item) => (
                  <div className={`analytics-advice-item analytics-advice-item-${item.tone}`} key={`${item.title}-${item.lead}-${item.body}`}>
                    <div className="analytics-advice-title-row">
                      <span className="analytics-advice-icon"><AdviceIcon icon={item.icon} /></span>
                      <strong>{item.title}</strong>
                    </div>
                    <div className="analytics-advice-lead">{item.lead}</div>
                    <div className="analytics-advice-body">{item.body}</div>
                  </div>
                ))}
              </div>
              <div className="analytics-medical-note">
                Note: If you need diagnosis, treatment decisions, or symptom review, please seek medical guidance.
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="actions analytics-actions">
        <button className="btn" onClick={onBack}>Back</button>
        <button className="btn btn-primary" onClick={onFinish}>Finish</button>
      </div>
    </div>
  );
}
