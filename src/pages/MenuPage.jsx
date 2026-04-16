import { Fingerprint, UserPlus } from "lucide-react";

export default function MenuPage({ onNewUser, onExistingUser }) {
  return (
    <div className="menu-stage">
      <div className="menu-glow menu-glow-a" aria-hidden="true" />
      <div className="menu-glow menu-glow-b" aria-hidden="true" />
      <div className="actions actions-split menu-actions">
        <button className="btn btn-accent btn-xl menu-btn" onClick={onNewUser}>
          <UserPlus className="menu-btn-icon" />
          <span>New User</span>
        </button>
        <button className="btn btn-primary btn-xl menu-btn" onClick={onExistingUser}>
          <Fingerprint className="menu-btn-icon" />
          <span>Existing</span>
        </button>
      </div>
      <p className="menu-note">Select profile mode</p>
    </div>
  );
}
