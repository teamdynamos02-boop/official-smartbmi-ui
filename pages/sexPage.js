window.sexPage = function sexPage() {
  return `
    <div class="panel panel-large center-page">
      <h2>Select Your Sex</h2>
      <div class="sex-buttons">
        <button data-action="select-sex" data-value="Male" class="btn sex-btn">Male</button>
        <button data-action="select-sex" data-value="Female" class="btn sex-btn">Female</button>
      </div>
      <p id="sexError" class="message-danger hidden">Please select your sex.</p>
    </div>
    <div class="actions">
      <button data-action="sex-back" class="btn">Back</button>
      <button data-action="sex-next" id="sexNextBtn" class="btn btn-primary btn-xl" disabled>Next</button>
    </div>
  `;
};

