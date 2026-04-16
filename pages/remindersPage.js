window.remindersPage = function remindersPage() {
  return `
    <div class="screen-grid">
      <div class="panel">
        <h3>How to Stand</h3>
        <ul>
          <li>Face the camera directly.</li>
          <li>Stand upright with both feet flat at the center.</li>
          <li>Stay still during weight and height scanning.</li>
        </ul>
        <div class="notice">
          <strong>Safety notice:</strong> Ensure feet are dry before stepping on the platform.
        </div>
      </div>
      <div class="panel panel-large">
        <h3>Before You Start</h3>
        <div class="icon-grid icon-grid-images">
          <div class="restriction-card">
            <img src="restrictions/remove-shoes.svg" alt="Remove shoes" />
            <span class="icon-tag">Remove Shoes</span>
          </div>
          <div class="restriction-card">
            <img src="restrictions/remove-cap.svg" alt="Remove cap" />
            <span class="icon-tag">Remove Cap</span>
          </div>
          <div class="restriction-card">
            <img src="restrictions/remove-glasses.svg" alt="Remove glasses" />
            <span class="icon-tag">Remove Glasses</span>
          </div>
          <div class="restriction-card">
            <img src="restrictions/remove-mask.svg" alt="Remove mask" />
            <span class="icon-tag">Remove Mask</span>
          </div>
          <div class="restriction-card">
            <img src="restrictions/remove-backpack.svg" alt="Remove backpack" />
            <span class="icon-tag">Remove Backpack</span>
          </div>
          <div class="restriction-card">
            <img src="restrictions/remove-heavy.svg" alt="No heavy objects" />
            <span class="icon-tag">No Heavy Objects</span>
          </div>
        </div>
      </div>
    </div>
    <div class="actions">
      <button data-action="reminders-next" class="btn btn-primary btn-xl">Continue</button>
    </div>
  `;
};
