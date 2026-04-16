export default function RegisterPromptPage({ onYes, onNo }) {
  return (
    <div className="register-prompt-stage">
      <div className="panel panel-large register-prompt-panel">
        <h2 className="register-prompt-title">Register This Result?</h2>
        <p className="lead" style={{ marginTop: 12 }}>
          Do you want to register this result and create a face profile for future measurements?
        </p>
      </div>
      <div className="actions register-prompt-actions">
        <button className="btn register-prompt-no-btn" onClick={onNo}>No</button>
        <button className="btn btn-primary register-prompt-yes-btn" onClick={onYes}>Yes</button>
      </div>
    </div>
  );
}
