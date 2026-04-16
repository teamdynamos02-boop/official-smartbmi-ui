import { useMemo, useState } from "react";
import VirtualKeyboard from "../components/VirtualKeyboard";

const FIELD_MAX = {
  firstName: 24,
  middleInitial: 2,
  lastName: 24,
};

function sanitizeNamePart(value, maxLen) {
  return String(value ?? "")
    .replace(/[^a-zA-Z\s'.-]/g, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, maxLen);
}

function normalizeNameCase(value) {
  const lower = String(value ?? "").toLowerCase();
  let shouldUppercase = true;
  let out = "";
  for (const ch of lower) {
    if (/[a-z]/.test(ch)) {
      out += shouldUppercase ? ch.toUpperCase() : ch;
      shouldUppercase = false;
      continue;
    }
    out += ch;
    if (ch === " ") shouldUppercase = true;
  }
  return out;
}

export default function FullNamePage({ value, onChange, onBack, onNext }) {
  const [activeField, setActiveField] = useState("firstName");

  const valid = value.firstName.trim().length > 0 && value.lastName.trim().length > 0;

  const activeValue = useMemo(() => {
    if (activeField === "firstName") return value.firstName;
    if (activeField === "middleInitial") return value.middleInitial;
    return value.lastName;
  }, [activeField, value.firstName, value.middleInitial, value.lastName]);

  const updateField = (field, raw) => {
    const cleaned = sanitizeNamePart(raw, FIELD_MAX[field]);
    if (field === "middleInitial") {
      onChange({ ...value, middleInitial: cleaned.replace(/\s/g, "").toUpperCase() });
      return;
    }
    onChange({ ...value, [field]: normalizeNameCase(cleaned) });
  };

  const handleKeyboardChange = (next) => {
    updateField(activeField, next);
  };

  return (
    <div className="name-stage">
      <div className="name-glow name-glow-a" aria-hidden="true" />
      <div className="name-glow name-glow-b" aria-hidden="true" />
      <div className="panel panel-large center-page input-step-panel">
        <h2 className="entry-title">Identity Name</h2>

        <div className="name-fields-grid">
          <div className={`name-field-card ${activeField === "firstName" ? "name-field-card-active" : ""}`}>
            <label htmlFor="firstNameInput" className="name-field-label">First Name</label>
            <input
              id="firstNameInput"
              className="kiosk-input kiosk-input-wide name-input"
              type="text"
              placeholder="First Name"
              value={value.firstName}
              onFocus={() => setActiveField("firstName")}
              onChange={(e) => updateField("firstName", e.target.value)}
            />
          </div>

          <div className={`name-field-card name-field-card-mi ${activeField === "middleInitial" ? "name-field-card-active" : ""}`}>
            <label htmlFor="miInput" className="name-field-label">MI</label>
            <input
              id="miInput"
              className="kiosk-input kiosk-input-wide name-input name-input-mi"
              type="text"
              placeholder="MI"
              value={value.middleInitial}
              onFocus={() => setActiveField("middleInitial")}
              onChange={(e) => updateField("middleInitial", e.target.value)}
            />
          </div>

          <div className={`name-field-card ${activeField === "lastName" ? "name-field-card-active" : ""}`}>
            <label htmlFor="lastNameInput" className="name-field-label">Last Name</label>
            <input
              id="lastNameInput"
              className="kiosk-input kiosk-input-wide name-input"
              type="text"
              placeholder="Last Name"
              value={value.lastName}
              onFocus={() => setActiveField("lastName")}
              onChange={(e) => updateField("lastName", e.target.value)}
            />
          </div>
        </div>

        {!valid && <p className="message-danger name-error">First Name and Last Name are required.</p>}
        <VirtualKeyboard mode="name" value={activeValue} onChange={handleKeyboardChange} />
      </div>
      <div className="actions name-actions">
        <button className="btn" onClick={onBack}>Back</button>
        <button className="btn btn-primary btn-xl name-next-btn" disabled={!valid} onClick={onNext}>Next</button>
      </div>
    </div>
  );
}
