export default function IntroPage({ onStart }) {
  const handleStart = () => {
    console.log("[DEBUG] WELCOME START CLICKED");
    if (typeof onStart === "function") onStart();
  };

  return (
    <div
      className="intro-tap-zone"
      role="button"
      tabIndex={0}
      onPointerUp={(e) => {
        if (e.target instanceof Element && e.target.closest("a,button")) return;
        handleStart();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleStart();
        }
      }}
      aria-label="Tap anywhere to start"
    >
      <div className="panel panel-large center-page clean-start intro-page-panel intro-hero-panel">
        <div className="intro-animated-bg" aria-hidden="true">
          <div className="intro-gradient" />
          <div className="intro-orb intro-orb-a" />
          <div className="intro-orb intro-orb-b" />
          <div className="intro-orb intro-orb-c" />
          <div className="intro-float intro-float-heart">
            <svg viewBox="0 0 24 24" className="intro-icon icon-heart" role="img">
              <path d="M12 21s-7-4.6-9.4-8.3C.6 9.8 2 6.4 5.2 5.4c2.2-.7 4 .2 5 1.6 1-1.4 2.8-2.3 5-1.6 3.2 1 4.6 4.4 2.6 7.3C19 16.4 12 21 12 21Z" fill="currentColor" />
            </svg>
          </div>
          <div className="intro-float intro-float-activity">
            <svg viewBox="0 0 24 24" className="intro-icon icon-activity" role="img">
              <path d="M2 12h5l2-4 4 9 2-5h7" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
        <div className="intro-content">
          <div className="intro-health-top">
            <div className="intro-health-chip">
              <svg className="intro-health-chip-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 21s-7-4.6-7-10.3c0-2.9 2-5 4.6-5 1.6 0 2.8.7 3.4 1.9.6-1.2 1.8-1.9 3.4-1.9C19 5.7 21 7.8 21 10.7 21 16.4 14 21 14 21h-2z" />
              </svg>
              <span>Automated Health System</span>
            </div>
          </div>
          <h2 className="intro-title">Know Your Body,<br />Know Your Health</h2>
          <p className="touch-text">Touch the screen to begin</p>
        </div>
      </div>
      <div className="actions">
        <a
          href="?start=1"
          className="btn btn-primary btn-xl"
          role="button"
          onPointerDown={handleStart}
          onClick={handleStart}
        >
          Start
        </a>
      </div>
    </div>
  );
}
