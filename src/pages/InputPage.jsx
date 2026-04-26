import VirtualKeyboard from "../components/VirtualKeyboard";
import { Mars, Venus } from "lucide-react";

export default function InputPage({ value, onChange, onBack, onNext, onCancel }) {
  const ageValue = String(value?.age ?? "");
  const sexValue = String(value?.sex ?? "");
  const num = Number(ageValue);
  const isAgeEmpty = ageValue.trim() === "";
  const isAgeValid = !isAgeEmpty && Number.isFinite(num) && num >= 5 && num <= 120;
  const isSexValid = Boolean(sexValue);
  const isValid = isAgeValid && isSexValid;

  return (
    <div className="age-stage input-page">
      <div className="age-glow age-glow-a" aria-hidden="true" />
      <div className="age-glow age-glow-b" aria-hidden="true" />
      <div className="panel panel-large center-page input-step-panel">
        <h2 className="entry-title">Guest Information</h2>
        <p className="lead input-page-subtitle">Enter age and sex to compute and save the guest result.</p>
        <div className="input-page-layout">
          <section className="input-page-column input-page-sex-column">
            <h3 className="input-page-section-title">Sex</h3>
            <div className="sex-buttons input-page-sex-buttons">
              <button
                type="button"
                className={`btn sex-btn sex-btn-male ${sexValue === "Male" ? "sex-btn-active" : ""}`}
                onClick={() => onChange({ ...value, sex: "Male" })}
              >
                <Mars className="sex-btn-icon" />
                Male
              </button>
              <button
                type="button"
                className={`btn sex-btn sex-btn-female ${sexValue === "Female" ? "sex-btn-active" : ""}`}
                onClick={() => onChange({ ...value, sex: "Female" })}
              >
                <Venus className="sex-btn-icon" />
                Female
              </button>
            </div>
            {!isSexValid && <p className="message-danger sex-error">Select one.</p>}
          </section>

          <section className="input-page-column input-page-age-column">
            <h3 className="input-page-section-title">Age</h3>
            <input
              className="kiosk-input kiosk-input-age age-input"
              type="number"
              placeholder="Age"
              value={ageValue}
              onChange={(event) => onChange({ ...value, age: event.target.value })}
            />
            {isAgeEmpty && <p className="message-danger age-error">Age is required.</p>}
            {!isAgeEmpty && !isAgeValid && <p className="message-danger age-error">Enter a valid age from 5 to 120.</p>}
            <div className="input-page-keyboard-wrap">
              <VirtualKeyboard mode="age" value={ageValue} onChange={(nextAge) => onChange({ ...value, age: nextAge })} />
            </div>
          </section>
        </div>
      </div>
      <div className="actions age-actions">
        {typeof onCancel === "function" && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
        <button type="button" className="btn" onClick={onBack}>Back</button>
        <button type="button" className="btn btn-primary btn-xl age-next-btn" disabled={!isValid} onClick={onNext}>Next</button>
      </div>
    </div>
  );
}
