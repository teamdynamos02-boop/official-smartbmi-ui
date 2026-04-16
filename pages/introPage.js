window.introPage = function introPage() {
  return `
    <div class="panel panel-large center-page clean-start intro-page-panel">
      <div class="intro-animated-bg" aria-hidden="true">
        <div class="intro-gradient"></div>
        <div class="intro-orb intro-orb-a"></div>
        <div class="intro-orb intro-orb-b"></div>
        <div class="intro-orb intro-orb-c"></div>
        <div class="intro-float intro-float-heart">
          <svg viewBox="0 0 24 24" class="intro-icon icon-heart" role="img">
            <path d="M12 21s-7-4.6-9.4-8.3C.6 9.8 2 6.4 5.2 5.4c2.2-.7 4 .2 5 1.6 1-1.4 2.8-2.3 5-1.6 3.2 1 4.6 4.4 2.6 7.3C19 16.4 12 21 12 21Z" fill="currentColor"/>
          </svg>
        </div>
        <div class="intro-float intro-float-activity">
          <svg viewBox="0 0 24 24" class="intro-icon icon-activity" role="img">
            <path d="M2 12h5l2-4 4 9 2-5h7" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="intro-float intro-float-scale">
          <svg viewBox="0 0 24 24" class="intro-icon icon-scale" role="img">
            <path d="M4 7h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" fill="none" stroke="currentColor" stroke-width="2"/>
            <path d="M12 10v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M9 10a3 3 0 0 1 6 0" fill="none" stroke="currentColor" stroke-width="2"/>
          </svg>
        </div>
      </div>
      <div class="intro-content">
        <div class="tech-chip">Automated Health Monitoring</div>
        <h2>Know Your Body,<br />Know Your Health</h2>
        <p class="touch-text">Touch the screen to begin</p>
      </div>
    </div>
    <div class="actions">
      <button data-action="start" class="btn btn-primary btn-xl">Start</button>
    </div>
  `;
};
