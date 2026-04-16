import { Venus, Mars } from "lucide-react";

export default function SexPage({ sex, setSex, onBack, onNext }) {
  const valid = Boolean(sex);
  return (
    <div className="sex-stage">
      <div className="sex-glow sex-glow-a" aria-hidden="true" />
      <div className="sex-glow sex-glow-b" aria-hidden="true" />
      <div className="panel panel-large center-page input-step-panel">
        <h2 className="entry-title">Sex</h2>
        <div className="sex-buttons">
          <button className={`btn sex-btn sex-btn-male ${sex === "Male" ? "sex-btn-active" : ""}`} onClick={() => setSex("Male")}>
            <Mars className="sex-btn-icon" />
            Male
          </button>
          <button className={`btn sex-btn sex-btn-female ${sex === "Female" ? "sex-btn-active" : ""}`} onClick={() => setSex("Female")}>
            <Venus className="sex-btn-icon" />
            Female
          </button>
        </div>
        {!valid && <p className="message-danger sex-error">Pick one</p>}
      </div>
      <div className="actions sex-actions">
        <button className="btn" onClick={onBack}>Back</button>
        <button className="btn btn-primary btn-xl sex-next-btn" disabled={!valid} onClick={onNext}>Next</button>
      </div>
    </div>
  );
}
