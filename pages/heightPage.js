window.heightPage = function heightPage() {
  return `
    <div class="screen-grid single-col">
      <div class="panel panel-large">
        <h2>Height Measurement</h2>
        <p id="heightMessage" class="lead">Measuring height. Please remain standing straight.</p>
        <div class="meter-wrap">
          <span class="meter-label">Height</span>
          <strong id="heightValue">--- cm</strong>
        </div>
      </div>
    </div>
  `;
};
