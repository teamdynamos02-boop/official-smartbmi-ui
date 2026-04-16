import { Droplets, Hourglass, PersonStanding, ScanFace } from "lucide-react";

export default function RemindersPage({ onNext }) {
  const postureGuides = [
    {
      icon: ScanFace,
      title: "Look directly at the camera",
    },
    {
      icon: PersonStanding,
      title: "Stand straight at the center",
    },
    {
      icon: Hourglass,
      title: "Remain still during scanning",
    },
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
    <div className="reminders-page reminders-page-minimal reminders-page-display reminders-page-exact">
      <div className="reminders-exact-shell">
        <div className="reminders-exact-board">
          <section className="reminders-exact-panel reminders-exact-left">
            <h3>Before Scanning</h3>
            <div className="reminder-list">
              {postureGuides.map((item, index) => {
                const Icon = item.icon;
                return (
                  <article className="reminder-item reminder-item-display" key={item.title} style={{ "--delay": `${index * 120}ms` }}>
                    <Icon className="reminder-icon" />
                    <div>
                      <p>{item.title}</p>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="notice reminder-note reminder-note-display">
              <Droplets className="reminder-note-icon" />
              Keep feet dry before stepping on the scale.
            </div>
          </section>

          <section className="reminders-exact-panel reminders-exact-right">
            <h3>Remove These Items</h3>
            <div className="icon-grid icon-grid-images">
              {restrictionGuides.map(([src, label], index) => (
                <div className="restriction-card restriction-pending restriction-display-card" key={src} style={{ "--delay": `${index * 90}ms` }}>
                  <div className="restriction-media">
                    <img src={`/restrictions/${src}`} alt={label} />
                    <span className="restriction-x-badge" aria-hidden="true">&times;</span>
                  </div>
                  <span className="icon-tag">{label}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <p className="reminders-exact-caption">
          Please remove restricted items and stand on the scale before scanning.
        </p>
      </div>

      {typeof onNext === "function" && (
        <div className="actions reminders-actions">
          <button className="btn btn-primary btn-xl reminders-begin-btn" onClick={onNext}>Open Camera</button>
        </div>
      )}
    </div>
  );
}
