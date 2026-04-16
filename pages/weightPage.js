window.weightPage = function weightPage() {
  return `
    <div class="screen-grid single-col">
      <div class="panel panel-large">
        <h2>Weight Measurement</h2>
        <p id="weightMessage" class="lead">Preparing scale. Please wait.</p>
        <div class="meter-wrap">
          <span class="meter-label">Weight</span>
          <strong id="weightValue">--.- kg</strong>
        </div>
      </div>
    </div>
  `;
};
