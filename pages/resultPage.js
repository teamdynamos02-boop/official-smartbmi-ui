window.resultPage = function resultPage() {
  return `
    <div class="screen-grid">
      <div class="panel panel-large">
        <h2>Result Summary</h2>
        <div class="result-grid" id="resultGrid"></div>
      </div>
      <div class="panel">
        <h3>System Messages</h3>
        <ul>
          <li>Record saved successfully.</li>
          <li>To view your profile and history, visit our website and enter your 5-digit User ID.</li>
          <li>Thank you for using the system.</li>
        </ul>
      </div>
    </div>
    <div class="actions">
      <button data-action="reset" class="btn btn-primary">Finish</button>
    </div>
  `;
};
