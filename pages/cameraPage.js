window.cameraPage = function cameraPage() {
  return `
    <div class="screen-grid single-col">
      <div class="panel panel-large camera-view">
        <h2 id="cameraTitle">Camera Process</h2>
        <div class="camera-box">
          <div class="face-ring"></div>
          <p id="cameraMessage" class="camera-message">Position your face inside the guide.</p>
        </div>
      </div>
    </div>
    <div class="actions">
      <button data-action="cancel-menu" class="btn">Cancel</button>
    </div>
  `;
};
