window.menuPage = function menuPage() {
  return `
    <div class="panel panel-large">
      <h2>Main Menu</h2>
      <p>Select how you want to proceed.</p>
    </div>
    <div class="actions actions-split">
      <button data-action="new-user" class="btn btn-accent btn-xl">New User</button>
      <button data-action="existing-user" class="btn btn-primary btn-xl">Existing User</button>
    </div>
  `;
};
