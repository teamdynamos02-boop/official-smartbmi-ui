import VirtualKeyboard from "../components/VirtualKeyboard";

export default function AgePage({ value, onChange, onBack, onNext }) {
  const num = Number(value);
  const isEmpty = String(value).trim() === "";
  const isValid = !isEmpty && Number.isFinite(num) && num >= 5 && num <= 120;
  return (
    <div className="age-stage">
      <div className="age-glow age-glow-a" aria-hidden="true" />
      <div className="age-glow age-glow-b" aria-hidden="true" />
      <div className="panel panel-large center-page input-step-panel">
        <h2 className="entry-title">Age</h2>
        <input
          className="kiosk-input kiosk-input-age age-input"
          type="number"
          placeholder="Age"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {isEmpty && <p className="message-danger age-error">Required</p>}
        {!isEmpty && !isValid && <p className="message-danger age-error">Invalid</p>}
        <VirtualKeyboard mode="age" value={value} onChange={onChange} />
      </div>
      <div className="actions age-actions">
        <button className="btn" onClick={onBack}>Back</button>
        <button className="btn btn-primary btn-xl age-next-btn" disabled={!isValid} onClick={onNext}>Next</button>
      </div>
    </div>
  );
}
