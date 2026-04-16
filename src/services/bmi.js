const cdcBmiAgeCsv = "";

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

const CDC_BMI_AGE_TABLE = parseCdcBmiAgeTable(cdcBmiAgeCsv);

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
    return { category: "Healthy Weight", basis: "minor-percentile", percentileBand: "5th-<85th" };
  }
  if (bmi < thresholds.p95) {
    return { category: "Overweight", basis: "minor-percentile", percentileBand: "85th-<95th" };
  }
  return { category: "Obesity", basis: "minor-percentile", percentileBand: ">=95th" };
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
