window.agePage = function agePage() {
  return `
    <div class="panel panel-large center-page">
      <h2>Enter Your Age</h2>
      <input id="ageInput" class="kiosk-input" type="number" placeholder="Age" min="5" max="120" />
      <p id="ageEmptyError" class="message-danger hidden">Please enter your age.</p>
      <p id="ageInvalidError" class="message-danger hidden">Please enter a valid age.</p>
    </div>
    <div class="actions">
      <button data-action="age-back" class="btn">Back</button>
      <button data-action="age-next" id="ageNextBtn" class="btn btn-primary btn-xl" disabled>Next</button>
    </div>
  `;
};
