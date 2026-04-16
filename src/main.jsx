import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";
import "./styles.css";
import "./video-reference.css";

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    try {
      const payload = {
        message: String(event?.message || "Unknown error"),
        stack: String(event?.error?.stack || ""),
        source: String(event?.filename || ""),
        line: Number(event?.lineno || 0),
        column: Number(event?.colno || 0),
        at: Date.now(),
      };
      window.localStorage.setItem("smartbmi.last_ui_error", JSON.stringify(payload));
    } catch {
      // Ignore storage failures.
    }
  });
  window.addEventListener("unhandledrejection", (event) => {
    try {
      const reason = event?.reason;
      const payload = {
        message: String(reason?.message || reason || "Unhandled rejection"),
        stack: String(reason?.stack || ""),
        at: Date.now(),
      };
      window.localStorage.setItem("smartbmi.last_ui_error", JSON.stringify(payload));
    } catch {
      // Ignore storage failures.
    }
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
