window.fullNamePage = function fullNamePage() {
  return `
    <div class="panel panel-large center-page">
      <h2>Enter Your Full Name</h2>
      <input id="fullNameInput" class="kiosk-input" type="text" placeholder="Full Name" />
      <p id="fullNameError" class="message-danger hidden">Please enter your full name.</p>
    </div>
    <div class="actions">
      <button data-action="full-name-next" id="fullNameNextBtn" class="btn btn-primary btn-xl" disabled>Next</button>
    </div>
  `;
};

