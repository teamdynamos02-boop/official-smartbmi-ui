import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.reloadTimer = null;
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    try {
      console.error("SmartBMI UI crash:", error, info);
      window.localStorage.setItem("smartbmi.last_ui_error", JSON.stringify({
        message: String(error?.message || error),
        stack: String(error?.stack || ""),
        at: Date.now(),
      }));
    } catch {
      // Ignore logging errors.
    }
    if (typeof window !== "undefined") {
      this.reloadTimer = window.setTimeout(() => {
        window.location.reload();
      }, 3000);
    }
  }

  componentWillUnmount() {
    if (this.reloadTimer) {
      window.clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
  }

  render() {
    const { hasError, error } = this.state;
    if (!hasError) return this.props.children;
    const errorMessage = error?.message ? String(error.message) : "Unknown error";
    let lastErrorDetails = "";
    try {
      const raw = window.localStorage.getItem("smartbmi.last_ui_error");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.stack) lastErrorDetails = String(parsed.stack);
      }
    } catch {
      // Ignore storage read errors.
    }
    return (
      <div className="page-with-actions">
        <div className="screen-grid single-col">
          <div className="panel panel-large">
            <h2>Something Went Wrong</h2>
            <p className="lead">The screen ran into an error and needs to restart.</p>
            <p className="measure-status message-warning">{errorMessage}</p>
            {error?.stack && (
              <pre className="measure-status message-warning" style={{ whiteSpace: "pre-wrap" }}>
                {String(error.stack)}
              </pre>
            )}
            {!error?.stack && lastErrorDetails && (
              <pre className="measure-status message-warning" style={{ whiteSpace: "pre-wrap" }}>
                {lastErrorDetails}
              </pre>
            )}
            <p>The kiosk will reload automatically in a moment.</p>
            <div className="actions">
              <button className="btn btn-primary" onClick={() => window.location.reload()}>
                Return to Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
