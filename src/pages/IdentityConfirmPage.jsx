import { BadgeCheck, Calendar, UserRound, Venus } from "lucide-react";

export default function IdentityConfirmPage({ user, onYes, onNo }) {
  return (
    <div className="identity-confirm-stage">
      <div className="panel panel-large identity-confirm-panel">
        <h2 className="identity-title"><BadgeCheck /> Confirm Profile</h2>
        <div className="identity-grid">
          <div className="identity-row">
            <span className="identity-label"><UserRound /> Name</span>
            <strong className="identity-value">{user.name || "--"}</strong>
          </div>
          <div className="identity-row">
            <span className="identity-label"><Calendar /> Age</span>
            <strong className="identity-value">{user.age ?? "--"}</strong>
          </div>
          <div className="identity-row">
            <span className="identity-label"><Venus /> Sex</span>
            <strong className="identity-value">{user.sex || "--"}</strong>
          </div>
        </div>
      </div>
      <div className="actions identity-actions">
        <button className="btn identity-no-btn" onClick={onNo}>No</button>
        <button className="btn btn-primary identity-yes-btn" onClick={onYes}>Yes</button>
      </div>
    </div>
  );
}
