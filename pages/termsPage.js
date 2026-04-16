window.termsPage = function termsPage() {
  return `
    <div class="panel panel-large">
      <h2>Terms and Conditions</h2>
      <p>
        By continuing, you consent to automated face identification and measurement processing for BMI calculation.
      </p>
      <p class="notice">
        <strong>Privacy notice:</strong> Facial data is used only for identification and will not be shared publicly.
      </p>
      <label class="checkbox-row">
        <input id="agreeInput" type="checkbox" />
        <span>I agree to the collection and secure storage of my biometric and health-related data.</span>
      </label>
    </div>
    <div class="actions">
      <button data-action="back-home" class="btn">Back</button>
      <button data-action="terms-next" id="termsNextBtn" class="btn btn-primary" disabled>Next</button>
    </div>
  `;
};
