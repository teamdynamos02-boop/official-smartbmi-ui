import { Droplets, Hourglass, PersonStanding, ScanFace } from "lucide-react";

export default function RemindersPage({ onNext, onCancel }) {
  const postureGuides = [
    { icon: ScanFace, title: "Look directly at the camera" },
    { icon: PersonStanding, title: "Stand straight at the center" },
    { icon: Hourglass, title: "Remain still during scanning" },
  ];

  const restrictionGuides = [
    ["remove-shoes.svg", "Shoes"],
    ["remove-cap.svg", "Cap"],
    ["remove-glasses.svg", "Glasses"],
    ["remove-mask.svg", "Mask"],
    ["remove-backpack.svg", "Bag"],
    ["remove-heavy.svg", "Heavy Items"],
  ];

  return (
    <div className="page-with-actions reminders-page" style={{ width: "100%", minHeight: 0 }}>
      <div
        style={{
          width: "min(1140px, 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          margin: "0 auto",
          minHeight: 0,
        }}
      >
        <div
          style={{
            width: "100%",
            padding: "26px 30px 20px",
            borderRadius: "22px",
            background: "#fff",
            border: "1px solid rgba(84,172,191,.18)",
            boxShadow: "0 22px 50px rgba(2,56,89,.14)",
          }}
        >
          <div
            style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 20, alignItems: "start" }}
          >
            <section style={{ paddingRight: 10, borderRight: "1px solid rgba(84,172,191,.14)" }}>
              <h3 style={{ fontSize: "28px", fontWeight: "700", lineHeight: 1.2, margin: "0 0 18px", color: "#1d4e68", textAlign: "center", letterSpacing: "0.06em" }}>
                Before Scanning
              </h3>
              <div style={{ display: "grid", gap: 12 }}>
                {postureGuides.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <article
                      key={item.title}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "42px 1fr",
                        minHeight: 70,
                        padding: "14px 18px",
                        borderRadius: 14,
                        background: "linear-gradient(180deg,#f7fdff,#eef9fc)",
                        border: "1px solid rgba(84,172,191,.18)",
                        alignItems: "center",
                        boxShadow: index === 0 ? "0 8px 20px rgba(84,172,191,.08)" : "none",
                      }}
                    >
                      <Icon style={{ width: "20px", height: "20px", color: "#1c79b4" }} />
                      <p style={{ fontSize: "18px", lineHeight: 1.3, fontWeight: 600, margin: 0, color: "#214f66" }}>
                        {item.title}
                      </p>
                    </article>
                  );
                })}
              </div>
              <div
                style={{
                  marginTop: 14,
                  fontSize: "14px",
                  lineHeight: 1.3,
                  padding: "10px 14px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  borderRadius: 12,
                  background: "#f6fbfe",
                  border: "1px solid rgba(84,172,191,.15)",
                  color: "#33667f",
                  fontWeight: 600,
                }}
              >
                <Droplets style={{ width: "16px", height: "16px", color: "#23a3c2" }} />
                Keep feet dry before stepping on the scale.
              </div>
            </section>

            <section>
              <h3 style={{ fontSize: "28px", fontWeight: "700", lineHeight: 1.2, margin: "0 0 18px", color: "#1d4e68", textAlign: "center", letterSpacing: "0.06em" }}>
                Remove These Items
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 14 }}>
                {restrictionGuides.map(([src, label]) => (
                  <div
                    key={src}
                    style={{
                      minHeight: 148,
                      padding: "14px 12px 12px",
                      borderRadius: 16,
                      background: "linear-gradient(180deg,#f7fdff,#eef9fc)",
                      border: "1px solid rgba(84,172,191,.18)",
                      display: "grid",
                      alignContent: "space-between",
                      justifyItems: "center",
                      gap: 10,
                    }}
                  >
                    <div style={{ width: "100%", minHeight: 82, display: "grid", placeItems: "center", position: "relative" }}>
                      <img src={`/restrictions/${src}`} alt={label} style={{ width: "58px", height: "58px", objectFit: "contain" }} />
                      <span
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          top: -2,
                          right: 6,
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          display: "grid",
                          placeItems: "center",
                          background: "#31b3cb",
                          color: "#fff",
                          fontWeight: 700,
                          fontSize: "13px",
                        }}
                      >
                        ×
                      </span>
                    </div>
                    <div
                      style={{
                        width: "100%",
                        minHeight: 38,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "7px 8px",
                        borderRadius: 12,
                        background: "#fff",
                        border: "1px solid rgba(84,172,191,.16)",
                      }}
                    >
                      <span style={{ fontSize: "17px", lineHeight: 1.12, fontWeight: 700, color: "#214f66", textAlign: "center" }}>
                        {label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        <p style={{ fontSize: "14px", margin: 0, color: "#34657e", fontWeight: 600 }}>
          Please remove restricted items and stand on the scale before scanning.
        </p>
      </div>
      <div className="actions reminders-actions">
        {typeof onCancel === "function" && (
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        )}
        {typeof onNext === "function" && (
          <button type="button" className="btn btn-primary" onClick={onNext}>Continue</button>
        )}
      </div>
    </div>
  );
}
