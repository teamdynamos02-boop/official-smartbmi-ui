import { Activity, KeyRound, QrCode, ShieldCheck, UserRound } from "lucide-react";
import QRCode from "react-qr-code";
import { motion } from "framer-motion";

export default function ResultPage({ user, onReset, onRegister, onAnalytics }) {
  const dashboardUrl = `https://dynamos-smart-bmi.vercel.app/?userId=${encodeURIComponent(user.id)}`;
  const displayPassword = user?.password || "12345";
  const isGuest = Boolean(user?.isGuest);
  const resultTiles = [
    ["Name", user.name || "--", <UserRound />],
    ["Age", user.age ?? "--"],
    ["Sex", user.sex || "--"],
    ["Weight", user.weightKg != null ? `${user.weightKg} kg` : "--"],
    ["Height", user.heightCm != null ? `${user.heightCm} cm` : "--"],
    ["BMI", user.bmi != null ? String(user.bmi) : "--"],
    ["Category", user.category || "--"],
  ];

  return (
    <div className="page-with-actions result-page">
      <div className="screen-grid">
        <div className="panel panel-large result-panel">
          <div className="result-head">
            <h2><Activity /> Result</h2>
            <span className="result-chip">ANALYSIS COMPLETE</span>
          </div>
          <div className="result-grid">
            {resultTiles.map(([k, v, icon], i) => (
              <motion.div
                className="result-item"
                key={k}
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.24, delay: i * 0.05, ease: "easeOut" }}
              >
                <div className="result-label">{icon}{k}</div>
                <div className={`result-value ${k === "Name" ? "result-value-name" : ""}`}>{v}</div>
              </motion.div>
            ))}
          </div>
        </div>
        <div className="panel result-message-panel">
          <div className="result-message-head">
            <h3><ShieldCheck /> {isGuest ? "Guest Result" : "Access Your Smart BMI Profile"}</h3>
          </div>
          <div className="result-access-subtitle">
            {isGuest
              ? "This result is saved as a guest session. Register if you want a permanent Smart BMI profile for future visits."
              : "Scan the QR code, then use your User ID and password to open your Smart BMI profile."}
          </div>
          {isGuest ? (
            <div className="result-message-list result-guest-list">
              <div className="result-message-item">
                <span className="result-message-dot"><ShieldCheck /></span>
                <p>Guest result completed successfully.</p>
              </div>
              <div className="result-message-item">
                <span className="result-message-dot"><UserRound /></span>
                <p>You can register this result and face profile now.</p>
              </div>
              <div className="result-message-item">
                <span className="result-message-dot"><KeyRound /></span>
                <p>If you skip registration, the kiosk returns to the start page.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="result-user-id-hero" role="note" aria-label={`User ID ${user.id}`}>
                <span className="result-user-id-hero-label">User ID</span>
                <strong className="result-user-id-hero-value">{user.id}</strong>
              </div>
              <div className="result-message-list">
                <div className="result-message-item">
                  <span className="result-message-dot"><QrCode /></span>
                  <p>Scan the QR code to open your Smart BMI profile securely.</p>
                </div>
                <div className="result-message-item">
                  <span className="result-message-dot"><UserRound /></span>
                  <p>Sign in using the User ID shown above.</p>
                </div>
                <div className="result-message-item">
                  <span className="result-message-dot"><KeyRound /></span>
                  <p>Password: {displayPassword}</p>
                </div>
              </div>
              <div className="result-qr-card">
                <div className="result-qr-code">
                  <QRCode
                    value={dashboardUrl}
                    size={140}
                    bgColor="#ffffff"
                    fgColor="#0f224a"
                    level="M"
                  />
                </div>
                <div className="result-qr-text">
                  <strong>Smart BMI Profile Login</strong>
                  <span>Scan the QR code, then enter your User ID and the password shown above to access your dashboard.</span>
                </div>
              </div>
            </>
          )}
          {isGuest && (
            <div className="result-register-card">
              <strong>Register this guest result?</strong>
              <span>Create a profile so the system can recognize you next time.</span>
            </div>
          )}
        </div>
      </div>
      <div className="actions">
        {isGuest && typeof onRegister === "function" && (
          <button className="btn btn-accent result-register-btn" onClick={onRegister}>Register</button>
        )}
        {!isGuest && typeof onAnalytics === "function" && (
          <button className="btn btn-accent result-analytics-btn" onClick={onAnalytics}>Analytics</button>
        )}
        <button className="btn btn-primary result-finish-btn" onClick={onReset}>
          {isGuest ? "No, Finish" : "Finish"}
        </button>
      </div>
    </div>
  );
}
