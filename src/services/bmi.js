const BMI_FOR_AGE_CUTOFFS = {
  1: [
    { agemos: 120, p5: 14.2, p85: 19.6, p95: 22.2 },
    { agemos: 180, p5: 16.5, p85: 23.3, p95: 26.8 },
  ],
  2: [
    { agemos: 120, p5: 14.0, p85: 19.4, p95: 22.0 },
    { agemos: 180, p5: 16.3, p85: 24.0, p95: 28.0 },
  ],
};

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeSex(sex) {
  const value = String(sex ?? "").trim().toLowerCase();
  if (value === "male" || value === "m" || value === "boy") return 1;
  if (value === "female" || value === "f" || value === "girl") return 2;
  return null;
}

function parseCdcBmiAgeTable(csvText) {
  const lines = String(csvText || "").trim().split(/\r?\n/);
  const rowsBySex = { 1: [], 2: [] };
  if (lines.length < 2) return rowsBySex;

  const headers = lines[0].split(",").map((cell) => cell.trim());
  for (const rawLine of lines.slice(1)) {
    const cells = rawLine.split(",").map((cell) => cell.trim());
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    const sex = toNumber(row.Sex);
    const agemos = toNumber(row.Agemos);
    const p5 = toNumber(row.P5);
    const p85 = toNumber(row.P85);
    const p95 = toNumber(row.P95);
    if ((sex !== 1 && sex !== 2) || agemos == null || p5 == null || p85 == null || p95 == null) continue;
    rowsBySex[sex].push({ agemos, p5, p85, p95 });
  }

  rowsBySex[1].sort((a, b) => a.agemos - b.agemos);
  rowsBySex[2].sort((a, b) => a.agemos - b.agemos);
  return rowsBySex;
}

const CDC_BMI_AGE_TABLE = BMI_FOR_AGE_CUTOFFS;

function interpolateThresholdRow(rows, ageMonths) {
  if (!Array.isArray(rows) || rows.length === 0 || !Number.isFinite(ageMonths)) return null;
  if (ageMonths <= rows[0].agemos) return rows[0];
  if (ageMonths >= rows[rows.length - 1].agemos) return rows[rows.length - 1];

  for (let index = 1; index < rows.length; index += 1) {
    const prev = rows[index - 1];
    const next = rows[index];
    if (ageMonths > next.agemos) continue;
    if (ageMonths === next.agemos) return next;
    const span = next.agemos - prev.agemos;
    const ratio = span > 0 ? (ageMonths - prev.agemos) / span : 0;
    return {
      agemos: ageMonths,
      p5: prev.p5 + (next.p5 - prev.p5) * ratio,
      p85: prev.p85 + (next.p85 - prev.p85) * ratio,
      p95: prev.p95 + (next.p95 - prev.p95) * ratio,
    };
  }

  return rows[rows.length - 1];
}

export function classifyAdultBmi(bmi) {
  if (!Number.isFinite(bmi)) return "--";
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  return "Obese";
}

export function normalizeBmiCategory(category) {
  const value = String(category || "").trim().toLowerCase();
  if (value.includes("under")) return "Underweight";
  if (value.includes("healthy") || value.includes("normal")) return "Normal";
  if (value.includes("over")) return "Overweight";
  if (value.includes("obes")) return "Obese";
  return category || "--";
}

export function classifyMinorBmi({ bmi, age, sex }) {
  const sexCode = normalizeSex(sex);
  const ageYears = toNumber(age);
  if (!Number.isFinite(bmi) || ageYears == null || sexCode == null) {
    return { category: "--", basis: "minor-unavailable", percentileBand: null };
  }
  if (ageYears < 2 || ageYears >= 20) {
    return { category: "--", basis: "minor-out-of-range", percentileBand: null };
  }

  const thresholds = interpolateThresholdRow(CDC_BMI_AGE_TABLE[sexCode], ageYears * 12);
  if (!thresholds) {
    return {
      category: classifyAdultBmi(bmi),
      basis: "minor-fallback-adult-thresholds",
      percentileBand: null,
    };
  }

  if (bmi < thresholds.p5) {
    return { category: "Underweight", basis: "minor-percentile", percentileBand: "<5th" };
  }
  if (bmi < thresholds.p85) {
    return { category: "Normal", basis: "minor-percentile", percentileBand: "5th-<85th" };
  }
  if (bmi < thresholds.p95) {
    return { category: "Overweight", basis: "minor-percentile", percentileBand: "85th-<95th" };
  }
  return { category: "Obese", basis: "minor-percentile", percentileBand: ">=95th" };
}

export function computeBmiAssessment({ weightKg, heightCm, age, sex }) {
  const weight = toNumber(weightKg);
  const height = toNumber(heightCm);
  if (weight == null || height == null || height <= 0) {
    return { bmi: null, category: "--", basis: null, percentileBand: null };
  }

  const bmi = Number((weight / ((height / 100) ** 2)).toFixed(1));
  const ageYears = toNumber(age);
  if (ageYears != null && ageYears >= 2 && ageYears < 20) {
    return { bmi, ...classifyMinorBmi({ bmi, age: ageYears, sex }) };
  }

  return {
    bmi,
    category: classifyAdultBmi(bmi),
    basis: "adult",
    percentileBand: null,
  };
}

const BMI_ANALYTICS_CONTENT = {
  Underweight: {
    title: "Underweight",
    range: "Less than 18.5",
    statusMessage: "BMI is below the normal range. It may be linked with lower energy reserves, reduced muscle mass, and slower recovery.",
    prediction: "If BMI stays low, the user may feel fatigue, have less physical reserve, need nutrition support, and weight management.",
    recommendedAction: "Encourage balanced meals, strength-building activity, enough sleep, and regular follow-up checks.",
    professionalApprovalNote: "Should be checked by a healthcare professional like doctors and nurse especially if there is appetite loss, unexplained weight loss or weakness. If experience any of the symptoms consult or seek advice to any medical healthcare personnel.",
  },
  Normal: {
    title: "Normal",
    range: "18.5 to 24.9",
    statusMessage: "BMI is within the normal range and supports lower weight-related risk when maintained with steady habits.",
    prediction: "Maintaining this range may support steady energy, easier movement, and lower risk of any weight-related conditions.",
    recommendedAction: "Continue balanced meals, regular activity, good sleep, and regular BMI monitoring.",
    professionalApprovalNote: "Monitor weight to ensure body composition remains healthy and monitoring weight to focus on consistency and maintaining healthy lifestyle habits",
  },
  Overweight: {
    title: "Overweight",
    range: "25.0 to 29.9",
    statusMessage: "BMI is above the normal range and may increase weight-related health risk over time.",
    prediction: "If BMI remains in this range, there will be higher risk for any heart condition disease, lack of sleep quality and blood sugar related condition or disease plus other weight related disease condition.",
    recommendedAction: "Start lifestyle changes such as balance diet, walking, exercise, better sleep and monitoring weight",
    professionalApprovalNote: "Weight-management advice should be reviewed by a healthcare professional.",
  },
  Obese: {
    title: "Obese",
    range: "30.0 and above",
    statusMessage: "BMI is in the obesity range and is linked with higher risk for weight-related health conditions.",
    prediction: "Higher risk for any heart related disease like hypertension and blood sugar disease like diabetes plus other weight related problem",
    recommendedAction: "Balance diet, better sleep habits plus monitoring of weight",
    professionalApprovalNote: "Must be clearly reviewed or approved by a qualified health professional.",
  },
};

export function getBmiAnalyticsContent(category) {
  const normalized = normalizeBmiCategory(category);
  return BMI_ANALYTICS_CONTENT[normalized] || null;
}
