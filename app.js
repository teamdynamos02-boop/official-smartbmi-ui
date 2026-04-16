const screenArea = document.getElementById("screenArea");
const footerHint = document.getElementById("footerHint");
const connectionBadge = document.getElementById("connectionBadge");
const timerBadge = document.getElementById("timerBadge");

const state = {
  screen: "welcome",
  isNewUser: true,
  agreeTerms: false,
  cameraAttempts: 0,
  mode: "registration",
  user: {
    id: "39241",
    name: "Guest User",
    age: 24,
    sex: "Female",
    weightKg: null,
    heightCm: null,
    bmi: null,
    category: null,
  },
  saveMode: "online",
  resultTimeout: null,
  autoTimers: [],
  newUserForm: {
    fullName: "",
    age: "",
    sex: "",
  },
};

const cameraMessages = {
  multiple: "Only one person should stand in front of the camera.",
  notDetected: "Move closer to the camera.",
  tooClose: "Move slightly backward.",
  dark: "Face the light source.",
  tilted: "Look straight and slowly move head left, right, up, and down.",
  glasses: "Please remove your glasses.",
  cap: "Please remove your cap.",
  mask: "Please remove your face mask.",
  high: "Raise your head slightly.",
  low: "Lower your head slightly.",
  successRegistration: "Face captured successfully. Profile registration complete.",
  successRecognition: "Face recognized. Profile loaded.",
  unknown: "User not recognized. Please register as new user.",
};

function setConnectionBadge(mode) {
  const isOnline = mode !== "offline";
  connectionBadge.textContent = isOnline ? "Online" : "Offline";
  connectionBadge.classList.toggle("badge-online", isOnline);
  connectionBadge.classList.toggle("badge-offline", !isOnline);
}

function setFooter(text) {
  footerHint.textContent = text;
}

function setTimer(text) {
  timerBadge.textContent = text;
}

function clearAutoTimers() {
  state.autoTimers.forEach((id) => clearTimeout(id));
  state.autoTimers = [];
}

function queueTimer(fn, delay) {
  const id = setTimeout(fn, delay);
  state.autoTimers.push(id);
}

function resetSession() {
  clearAutoTimers();
  if (state.resultTimeout) {
    clearTimeout(state.resultTimeout);
  }
  state.screen = "welcome";
  state.cameraAttempts = 0;
  state.agreeTerms = false;
  state.user = {
    id: String(Math.floor(10000 + Math.random() * 90000)),
    name: "Guest User",
    age: 24,
    sex: Math.random() > 0.5 ? "Male" : "Female",
    weightKg: null,
    heightCm: null,
    bmi: null,
    category: null,
  };
  state.saveMode = "online";
  state.newUserForm = { fullName: "", age: "", sex: "" };
  setConnectionBadge("online");
  setTimer("Session Active");
  render();
}

function computeBmi(weightKg, heightCm) {
  const meters = heightCm / 100;
  const bmi = weightKg / (meters * meters);
  let category = "Obese";
  if (bmi < 18.5) category = "Underweight";
  else if (bmi < 25) category = "Normal";
  else if (bmi < 30) category = "Overweight";
  return { bmi: Number(bmi.toFixed(1)), category };
}

function renderResultGrid() {
  const grid = document.getElementById("resultGrid");
  const rows = [
    ["Name", state.user.name],
    ["User ID", state.user.id],
    ["Age", String(state.user.age)],
    ["Sex", state.user.sex],
    ["Weight", `${state.user.weightKg} kg`],
    ["Height", `${state.user.heightCm} cm`],
    ["BMI", String(state.user.bmi)],
    ["Category", state.user.category],
  ];
  grid.innerHTML = rows
    .map(
      ([label, value]) => `
      <div class="result-item">
        <div class="result-label">${label}</div>
        <div class="result-value">${value}</div>
      </div>`
    )
    .join("");
}

function renderCamera(mode) {
  screenArea.innerHTML = cameraPage();

  document.getElementById("cameraTitle").textContent =
    mode === "registration" ? "Facial Registration" : "Facial Identification";

  setFooter(mode === "registration" ? "Registering new user face template" : "Identifying existing user");
  startCameraAutomation(mode);
}

function setCameraMessage(key) {
  const msg = cameraMessages[key] || key;
  const messageEl = document.getElementById("cameraMessage");
  if (!messageEl) return;
  messageEl.textContent = msg;
  messageEl.className = "camera-message";
}

function startCameraAutomation(mode) {
  clearAutoTimers();
  setCameraMessage("multiple");
  queueTimer(() => setCameraMessage("notDetected"), 1200);
  queueTimer(() => setCameraMessage("tooClose"), 2400);
  queueTimer(() => setCameraMessage("dark"), 3600);

  if (mode === "registration") {
    queueTimer(() => {
      const messageEl = document.getElementById("cameraMessage");
      if (messageEl) {
        messageEl.textContent = cameraMessages.successRegistration;
        messageEl.className = "camera-message message-ok";
      }
      state.cameraAttempts = 0;
      queueTimer(() => {
        state.screen = "weight";
        render();
      }, 900);
    }, 4800);
    return;
  }

  queueTimer(() => {
    const fail = Math.random() < 0.4;
    const messageEl = document.getElementById("cameraMessage");
    if (!messageEl) return;

    if (!fail) {
      messageEl.textContent = cameraMessages.successRecognition;
      messageEl.className = "camera-message message-ok";
      state.cameraAttempts = 0;
      queueTimer(() => {
        state.screen = "weight";
        render();
      }, 900);
      return;
    }

    state.cameraAttempts += 1;
    messageEl.textContent = cameraMessages.unknown;
    messageEl.className = "camera-message message-warning";
    if (state.cameraAttempts >= 3) {
      queueTimer(() => {
        state.screen = "menu";
        state.cameraAttempts = 0;
        render();
      }, 1200);
    } else {
      queueTimer(() => renderCamera("identify"), 1200);
    }
  }, 4800);
}

function renderWeight() {
  screenArea.innerHTML = weightPage();
  setFooter("Load cell sensor active");
  startWeightAutomation();
}

function setWeightMessage(text, className = "") {
  const msg = document.getElementById("weightMessage");
  msg.textContent = text;
  msg.className = `lead ${className}`.trim();
}

function applyWeight(value) {
  state.user.weightKg = value;
  document.getElementById("weightValue").textContent = `${value.toFixed(1)} kg`;
  setWeightMessage("Weight measurement complete. Please remain on the platform.", "message-ok");
  queueTimer(() => {
    state.screen = "height";
    render();
  }, 900);
}

function weightSensorError() {
  setWeightMessage("Weight sensor error. Please inform administrator. Returning to Main Menu.", "message-danger");
  queueTimer(() => {
    state.screen = "menu";
    render();
  }, 1200);
}

function startWeightAutomation() {
  clearAutoTimers();
  setWeightMessage("Preparing scale. Please wait.");
  queueTimer(() => setWeightMessage("You may now step onto the platform.", "message-ok"), 900);
  queueTimer(() => setWeightMessage("Measuring weight. Please stand at the center and keep both feet flat."), 1800);
  queueTimer(() => setWeightMessage("Please stand still and do not hold any object.", "message-warning"), 3000);
  queueTimer(() => {
    const sensorError = Math.random() < 0.08;
    if (sensorError) {
      weightSensorError();
      return;
    }
    applyWeight(Number((58 + Math.random() * 20).toFixed(1)));
  }, 4200);
}

function renderHeight() {
  screenArea.innerHTML = heightPage();
  setFooter("ToF height sensor active");
  startHeightAutomation();
}

function setHeightMessage(text, className = "") {
  const msg = document.getElementById("heightMessage");
  msg.textContent = text;
  msg.className = `lead ${className}`.trim();
}

function applyHeight(value) {
  state.user.heightCm = value;
  document.getElementById("heightValue").textContent = `${value} cm`;
  setHeightMessage("Height measurement complete.", "message-ok");
  queueTimer(() => {
    const bmiData = computeBmi(state.user.weightKg, state.user.heightCm);
    state.user.bmi = bmiData.bmi;
    state.user.category = bmiData.category;
    state.screen = "saving";
    render();
  }, 900);
}

function heightSensorError() {
  setHeightMessage("Height sensor not responding. Returning to Main Menu.", "message-danger");
  queueTimer(() => {
    state.screen = "menu";
    render();
  }, 1200);
}

function startHeightAutomation() {
  clearAutoTimers();
  setHeightMessage("Measuring height. Please remain standing straight.");
  queueTimer(() => setHeightMessage("Stand directly under the height sensor.", "message-warning"), 1000);
  queueTimer(() => setHeightMessage("Please stand straight and do not move.", "message-warning"), 2200);
  queueTimer(() => {
    const sensorError = Math.random() < 0.08;
    if (sensorError) {
      heightSensorError();
      return;
    }
    applyHeight(160 + Math.floor(Math.random() * 20));
  }, 3600);
}

function renderSaving() {
  clearAutoTimers();
  screenArea.innerHTML = savingPage();
  setFooter("Saving measurement record");

  const message = document.getElementById("savingMessage");
  const modeRoll = Math.random();
  if (modeRoll < 0.15) {
    state.saveMode = "offline";
    setConnectionBadge("offline");
    message.textContent = "Internet unavailable. Record stored locally (offline mode).";
  } else if (modeRoll < 0.4) {
    state.saveMode = "slow";
    setConnectionBadge("online");
    message.textContent = "Saving locally. Uploading to server in background.";
  } else {
    state.saveMode = "online";
    setConnectionBadge("online");
    message.textContent = "Record saved to cloud database.";
  }

  queueTimer(() => {
    state.screen = "result";
    render();
  }, 1400);
}

function renderResult() {
  clearAutoTimers();
  screenArea.innerHTML = resultPage();
  renderResultGrid();
  setFooter("Session complete");
  setTimer("Auto reset in 15s");

  if (state.resultTimeout) clearTimeout(state.resultTimeout);
  state.resultTimeout = setTimeout(() => {
    setTimer("Resetting");
    resetSession();
  }, 15000);

  setTimeout(() => {
    setFooter("Session will reset in 10 seconds. Tap screen to continue.");
  }, 5000);
}

function render() {
  clearAutoTimers();
  switch (state.screen) {
    case "welcome": {
      screenArea.innerHTML = introPage();
      setFooter("Touch Start to begin");
      break;
    }
    case "reminders": {
      screenArea.innerHTML = remindersPage();
      setFooter("Review reminders before proceeding");
      break;
    }
    case "terms": {
      screenArea.innerHTML = termsPage();
      setFooter("Agreement required to continue");

      const agreeInput = document.getElementById("agreeInput");
      const nextBtn = document.getElementById("termsNextBtn");
      agreeInput.checked = state.agreeTerms;
      nextBtn.disabled = !state.agreeTerms;
      agreeInput.addEventListener("change", (e) => {
        state.agreeTerms = e.target.checked;
        nextBtn.disabled = !state.agreeTerms;
      });
      break;
    }
    case "menu": {
      screenArea.innerHTML = menuPage();
      setFooter("Select New User or Existing User");
      break;
    }
    case "full-name": {
      screenArea.innerHTML = fullNamePage();
      setFooter("Enter full name");
      renderFullNameStep();
      break;
    }
    case "age": {
      screenArea.innerHTML = agePage();
      setFooter("Enter age");
      renderAgeStep();
      break;
    }
    case "sex": {
      screenArea.innerHTML = sexPage();
      setFooter("Select sex");
      renderSexStep();
      break;
    }
    case "registration":
      state.mode = "registration";
      renderCamera("registration");
      break;
    case "identification":
      state.mode = "identify";
      renderCamera("identify");
      break;
    case "weight":
      renderWeight();
      break;
    case "height":
      renderHeight();
      break;
    case "saving":
      renderSaving();
      break;
    case "result":
      renderResult();
      break;
    default:
      state.screen = "welcome";
      render();
      break;
  }
}

function renderFullNameStep() {
  const input = document.getElementById("fullNameInput");
  const error = document.getElementById("fullNameError");
  const nextBtn = document.getElementById("fullNameNextBtn");
  if (!input || !error || !nextBtn) return;

  input.value = state.newUserForm.fullName;
  const validate = () => {
    const value = input.value.trim();
    state.newUserForm.fullName = value;
    const valid = value.length > 0;
    nextBtn.disabled = !valid;
    error.classList.toggle("hidden", valid);
  };
  input.addEventListener("input", validate);
  validate();
}

function renderAgeStep() {
  const input = document.getElementById("ageInput");
  const emptyError = document.getElementById("ageEmptyError");
  const invalidError = document.getElementById("ageInvalidError");
  const nextBtn = document.getElementById("ageNextBtn");
  if (!input || !emptyError || !invalidError || !nextBtn) return;

  input.value = state.newUserForm.age;
  const validate = () => {
    const raw = input.value.trim();
    state.newUserForm.age = raw;
    const num = Number(raw);
    const isEmpty = raw.length === 0;
    const isValid = !isEmpty && Number.isFinite(num) && num >= 5 && num <= 120;

    emptyError.classList.toggle("hidden", !isEmpty);
    invalidError.classList.toggle("hidden", isEmpty || isValid);
    nextBtn.disabled = !isValid;
  };
  input.addEventListener("input", validate);
  validate();
}

function renderSexStep() {
  const error = document.getElementById("sexError");
  const nextBtn = document.getElementById("sexNextBtn");
  if (!error || !nextBtn) return;

  const buttons = Array.from(document.querySelectorAll('[data-action="select-sex"]'));
  buttons.forEach((btn) => {
    const value = btn.dataset.value;
    if (value === state.newUserForm.sex) btn.classList.add("btn-primary");
    else btn.classList.remove("btn-primary");
  });

  const valid = !!state.newUserForm.sex;
  nextBtn.disabled = !valid;
  error.classList.toggle("hidden", valid);
}

screenArea.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.action;
  if (!action) return;

  switch (action) {
    case "start":
      state.screen = "reminders";
      break;
    case "reminders-next":
      state.screen = "terms";
      break;
    case "back-home":
      state.screen = "welcome";
      break;
    case "terms-next":
      if (!state.agreeTerms) return;
      state.screen = "menu";
      break;
    case "new-user":
      state.isNewUser = true;
      state.newUserForm = { fullName: "", age: "", sex: "" };
      state.screen = "full-name";
      break;
    case "existing-user":
      state.isNewUser = false;
      state.user.name = "Maria Reyes";
      state.user.age = 29;
      state.user.sex = "Female";
      state.screen = "identification";
      break;
    case "cancel-menu":
      state.screen = "menu";
      break;
    case "full-name-next":
      if (!state.newUserForm.fullName.trim()) return;
      state.screen = "age";
      break;
    case "age-back":
      state.screen = "full-name";
      break;
    case "age-next": {
      const age = Number(state.newUserForm.age);
      if (!state.newUserForm.age || age < 5 || age > 120) return;
      state.screen = "sex";
      break;
    }
    case "sex-back":
      state.screen = "age";
      break;
    case "select-sex":
      if (target.dataset.value) {
        state.newUserForm.sex = target.dataset.value;
      }
      break;
    case "sex-next":
      if (!state.newUserForm.sex) return;
      state.user.name = state.newUserForm.fullName;
      state.user.age = Number(state.newUserForm.age);
      state.user.sex = state.newUserForm.sex;
      state.screen = "registration";
      break;
    case "reset":
      resetSession();
      return;
    default:
      break;
  }
  render();
});

document.body.addEventListener("click", () => {
  if (state.screen === "result") {
    setTimer("Session Active");
    if (state.resultTimeout) {
      clearTimeout(state.resultTimeout);
      state.resultTimeout = setTimeout(() => {
        resetSession();
      }, 15000);
    }
  }
});

render();
