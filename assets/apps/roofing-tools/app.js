const STORAGE_KEY = "roofing.tools.state.v1";
const TAB_KEY = "roofing.tools.tab.v1";
const INPUT_DEBOUNCE_MS = 90;

const tabs = [...document.querySelectorAll(".tool-tab")];
const panels = [...document.querySelectorAll(".tool-panel")];
const cards = [...document.querySelectorAll(".tool-card[data-tool]")];

const presetSelect = document.getElementById("jobPreset");
const applyPresetBtn = document.getElementById("applyPreset");
const copyFullReportBtn = document.getElementById("copyFullReport");
const resetBtn = document.getElementById("resetForms");

const defaultSnapshot = {};
const latestResults = {};

function setTab(tabId) {
  tabs.forEach((tab) => {
    const active = tab.dataset.tab === tabId;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-pressed", String(active));
  });

  panels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.panel === tabId);
  });

  localStorage.setItem(TAB_KEY, tabId);
}

function numberFrom(formData, name, fallback = 0, min = Number.NEGATIVE_INFINITY) {
  const parsed = Number(formData.get(name));
  if (!Number.isFinite(parsed)) return fallback;
  return parsed < min ? min : parsed;
}

function format(value, digits = 2) {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function toFeetInches(inches) {
  const value = Math.max(inches, 0);
  const feet = Math.floor(value / 12);
  const remaining = value - feet * 12;
  return `${feet} ft ${format(remaining, 2)} in`;
}

function pitchMultiplier(rise, run = 12) {
  if (run <= 0) return 0;
  return Math.sqrt(run * run + rise * rise) / run;
}

function result(lines, notes = []) {
  return { lines, notes };
}

function asMoney(amount) {
  return `$${format(amount)}`;
}

function gallonsPerMinute(areaSqFt, rainfallInPerHour) {
  return (areaSqFt * rainfallInPerHour * 0.623) / 60;
}

function fahrenheitToCelsius(value) {
  return (value - 32) * (5 / 9);
}

function celsiusToFahrenheit(value) {
  return (value * (9 / 5)) + 32;
}

function dewPointF(tempF, rhPercent) {
  const tempC = fahrenheitToCelsius(tempF);
  const rh = Math.min(Math.max(rhPercent, 1), 100);
  const a = 17.27;
  const b = 237.7;
  const alpha = ((a * tempC) / (b + tempC)) + Math.log(rh / 100);
  const dewC = (b * alpha) / (a - alpha);
  return celsiusToFahrenheit(dewC);
}

function formDataToObject(formData) {
  const out = {};
  formData.forEach((value, key) => {
    out[key] = String(value);
  });
  return out;
}

function objectToForm(form, values) {
  [...form.elements].forEach((el) => {
    if (!el.name || !(el.name in values)) return;
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
      el.value = values[el.name];
    }
  });
}

function captureDefaults() {
  cards.forEach((card) => {
    const tool = card.dataset.tool;
    const form = card.querySelector("form");
    if (!tool || !form) return;
    defaultSnapshot[tool] = formDataToObject(new FormData(form));
  });
}

function saveState() {
  const payload = {};
  cards.forEach((card) => {
    const tool = card.dataset.tool;
    const form = card.querySelector("form");
    if (!tool || !form) return;
    payload[tool] = formDataToObject(new FormData(form));
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    cards.forEach((card) => {
      const tool = card.dataset.tool;
      const form = card.querySelector("form");
      if (!tool || !form || !parsed[tool]) return;
      objectToForm(form, parsed[tool]);
    });
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function resetToDefaults() {
  cards.forEach((card) => {
    const tool = card.dataset.tool;
    const form = card.querySelector("form");
    if (!tool || !form || !defaultSnapshot[tool]) return;
    objectToForm(form, defaultSnapshot[tool]);
  });
  runAll();
}

function applyNamedPreset(name) {
  const presets = {
    residential: {
      rise: "6",
      waste: "10",
      complexity: "moderate",
      cutup: "8",
      steep: "0",
      bps: "3",
      nailsPerSquare: "320",
      intakePct: "50",
      margin: "22",
      ratio: "300",
      rate: "0.7",
      loss: "12",
      rain: "2",
      ridgeNfaPerFt: "18",
      tearOffRate: "38",
      taxPct: "7",
      marginPct: "22",
      areaPerDrain: "600",
      indoorRh: "45",
      groundPsf: "30",
    },
    steep: {
      rise: "10",
      waste: "15",
      complexity: "complex",
      cutup: "14",
      steep: "1",
      bps: "3",
      nailsPerSquare: "480",
      intakePct: "52",
      margin: "28",
      ratio: "300",
      rate: "0.55",
      loss: "18",
      rain: "2.5",
      ridgeNfaPerFt: "18",
      tearOffRate: "50",
      taxPct: "7",
      marginPct: "30",
      areaPerDrain: "500",
      indoorRh: "48",
      groundPsf: "40",
    },
    low: {
      rise: "3",
      waste: "7",
      complexity: "simple",
      cutup: "5",
      steep: "0",
      bps: "3",
      nailsPerSquare: "280",
      intakePct: "50",
      margin: "18",
      ratio: "150",
      rate: "0.9",
      loss: "8",
      rain: "1.5",
      ridgeNfaPerFt: "12",
      tearOffRate: "25",
      taxPct: "6",
      marginPct: "18",
      areaPerDrain: "900",
      indoorRh: "42",
      groundPsf: "20",
    },
    commercial: {
      rise: "4",
      waste: "8",
      complexity: "moderate",
      cutup: "7",
      steep: "0",
      bps: "3",
      nailsPerSquare: "300",
      intakePct: "50",
      margin: "20",
      ratio: "300",
      rate: "1.1",
      loss: "10",
      rain: "3",
      ridgeNfaPerFt: "18",
      tearOffRate: "32",
      taxPct: "7",
      marginPct: "20",
      areaPerDrain: "800",
      indoorRh: "40",
      groundPsf: "28",
    },
  };

  const preset = presets[name] || presets.residential;

  cards.forEach((card) => {
    const form = card.querySelector("form");
    if (!form) return;
    [...form.elements].forEach((el) => {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return;
      if (!el.name || !(el.name in preset)) return;
      el.value = preset[el.name];
    });
  });

  runAll();
}

const calculators = {
  "pitch-from-rise": (formData) => {
    const rise = numberFrom(formData, "rise", 6, 0);
    const run = numberFrom(formData, "run", 12, 0.01);
    const angle = Math.atan2(rise, run) * (180 / Math.PI);
    const multiplier = pitchMultiplier(rise, run);
    return result([
      `<span class="result-strong">Pitch:</span> ${format(rise, 3)} in ${format(run, 3)}`,
      `<span class="result-strong">Roof angle:</span> ${format(angle, 2)}°`,
      `<span class="result-strong">Pitch multiplier:</span> ${format(multiplier, 4)}`,
    ]);
  },

  "pitch-from-angle": (formData) => {
    const angle = numberFrom(formData, "angle", 26.57, 0);
    const clamped = Math.min(angle, 89.9);
    const radians = (clamped * Math.PI) / 180;
    const risePer12 = Math.tan(radians) * 12;
    const multiplier = 1 / Math.cos(radians);
    return result([
      `<span class="result-strong">Angle:</span> ${format(clamped, 2)}°`,
      `<span class="result-strong">Pitch:</span> ${format(risePer12, 3)} in 12`,
      `<span class="result-strong">Pitch multiplier:</span> ${format(multiplier, 4)}`,
    ], angle >= 90 ? ["Angle was clamped below 90° for valid roof math."] : []);
  },

  "roof-area": (formData) => {
    const length = numberFrom(formData, "length", 0, 0);
    const width = numberFrom(formData, "width", 0, 0);
    const overhangIn = numberFrom(formData, "overhang", 0, 0);
    const rise = numberFrom(formData, "rise", 0, 0);
    const wastePct = numberFrom(formData, "waste", 0, 0);

    const overhangFt = overhangIn / 12;
    const footprint = (length + overhangFt * 2) * (width + overhangFt * 2);
    const slopeArea = Math.max(footprint, 0) * pitchMultiplier(rise, 12);
    const orderArea = slopeArea * (1 + wastePct / 100);

    return result([
      `<span class="result-strong">Slope area:</span> ${format(slopeArea)} sq ft`,
      `<span class="result-strong">Base squares:</span> ${format(slopeArea / 100, 3)}`,
      `<span class="result-strong">Order area:</span> ${format(orderArea)} sq ft`,
      `<span class="result-strong">Order squares:</span> ${format(orderArea / 100, 3)}`,
    ]);
  },

  "rafter-length": (formData) => {
    const spanFt = numberFrom(formData, "span", 0, 0);
    const rise = numberFrom(formData, "rise", 0, 0);
    const ridgeBoardIn = numberFrom(formData, "ridge", 0, 0);
    const overhangIn = numberFrom(formData, "overhang", 0, 0);

    const halfRunIn = Math.max(((spanFt * 12) - ridgeBoardIn) / 2, 0);
    const riseMainIn = halfRunIn * (rise / 12);
    const mainRafterIn = Math.hypot(halfRunIn, riseMainIn);
    const tailIn = Math.hypot(overhangIn, overhangIn * (rise / 12));

    return result([
      `<span class="result-strong">Common rafter:</span> ${format(mainRafterIn / 12, 3)} ft`,
      `<span class="result-strong">Total with tail:</span> ${format((mainRafterIn + tailIn) / 12, 3)} ft`,
      `<span class="result-strong">Ridge height above plate:</span> ${toFeetInches(riseMainIn)}`,
    ]);
  },

  "slope-percent": (formData) => {
    const rise = numberFrom(formData, "rise", 6, 0);
    const run = numberFrom(formData, "run", 12, 0.01);
    const slopePct = (rise / run) * 100;
    const angle = Math.atan2(rise, run) * (180 / Math.PI);
    return result([
      `<span class="result-strong">Slope:</span> ${format(slopePct, 2)}%`,
      `<span class="result-strong">Angle:</span> ${format(angle, 2)}°`,
      `<span class="result-strong">Ratio:</span> ${format(rise, 3)} : ${format(run, 3)}`,
    ]);
  },

  "valley-angle": (formData) => {
    const mainRise = numberFrom(formData, "mainRise", 6, 0);
    const crossRise = numberFrom(formData, "crossRise", 8, 0);
    const mainAngle = Math.atan(mainRise / 12) * (180 / Math.PI);
    const crossAngle = Math.atan(crossRise / 12) * (180 / Math.PI);
    const avgAngle = (mainAngle + crossAngle) / 2;
    const cutGuide = 45 + ((crossAngle - mainAngle) / 2);
    return result([
      `<span class="result-strong">Main roof angle:</span> ${format(mainAngle, 2)}°`,
      `<span class="result-strong">Cross roof angle:</span> ${format(crossAngle, 2)}°`,
      `<span class="result-strong">Field cut guide:</span> ${format(cutGuide, 2)}°`,
      `<span class="result-strong">Average valley reference:</span> ${format(avgAngle, 2)}°`,
    ], ["Use as field guide; verify with actual layout cuts."]);
  },

  "bundle-estimator": (formData) => {
    const squares = numberFrom(formData, "squares", 0, 0);
    const bundlesPerSquare = numberFrom(formData, "bps", 3, 0.01);
    const shinglesPerBundle = numberFrom(formData, "spb", 21, 1);

    const bundles = Math.ceil(squares * bundlesPerSquare);
    const shingles = bundles * shinglesPerBundle;

    return result([
      `<span class="result-strong">Bundles required:</span> ${format(bundles, 0)}`,
      `<span class="result-strong">Estimated shingle count:</span> ${format(shingles, 0)}`,
      `<span class="result-strong">Coverage basis:</span> ${format(bundlesPerSquare, 2)} bundles/square`,
    ]);
  },

  "edge-cap": (formData) => {
    const eave = numberFrom(formData, "eave", 0, 0);
    const rake = numberFrom(formData, "rake", 0, 0);
    const ridge = numberFrom(formData, "ridge", 0, 0);
    const hip = numberFrom(formData, "hip", 0, 0);
    const dripPiece = numberFrom(formData, "dripPiece", 10, 0.01);
    const ridgeCoverage = numberFrom(formData, "ridgeCoverage", 33, 0.01);
    const waste = numberFrom(formData, "waste", 0, 0);

    const dripFt = (eave + rake) * (1 + waste / 100);
    const capFt = (ridge + hip) * (1 + waste / 100);

    return result([
      `<span class="result-strong">Drip edge total:</span> ${format(dripFt)} ft (${format(Math.ceil(dripFt / dripPiece), 0)} pcs)`,
      `<span class="result-strong">Ridge/Hip cap total:</span> ${format(capFt)} ft (${format(Math.ceil(capFt / ridgeCoverage), 0)} bundles)`,
    ]);
  },

  underlayment: (formData) => {
    const roofArea = numberFrom(formData, "roofArea", 0, 0);
    const synCoverage = numberFrom(formData, "synCoverage", 400, 0.01);
    const eaveLength = numberFrom(formData, "eaveLength", 0, 0);
    const iceWidth = numberFrom(formData, "iceWidth", 3, 0);
    const courses = numberFrom(formData, "courses", 1, 0);
    const iceCoverage = numberFrom(formData, "iceCoverage", 200, 0.01);

    const iceArea = eaveLength * iceWidth * courses;
    const syntheticArea = Math.max(roofArea - iceArea, 0);

    return result([
      `<span class="result-strong">Ice & water area:</span> ${format(iceArea)} sq ft (${format(Math.ceil(iceArea / iceCoverage), 0)} rolls)`,
      `<span class="result-strong">Synthetic area:</span> ${format(syntheticArea)} sq ft (${format(Math.ceil(syntheticArea / synCoverage), 0)} rolls)`,
    ]);
  },

  nails: (formData) => {
    const squares = numberFrom(formData, "squares", 0, 0);
    const nailsPerSquare = numberFrom(formData, "nailsPerSquare", 320, 1);
    const nailsPerBox = numberFrom(formData, "nailsPerBox", 7200, 1);

    const totalNails = Math.ceil(squares * nailsPerSquare);
    return result([
      `<span class="result-strong">Total nails:</span> ${format(totalNails, 0)}`,
      `<span class="result-strong">Boxes/coil packs:</span> ${format(Math.ceil(totalNails / nailsPerBox), 0)}`,
    ]);
  },

  decking: (formData) => {
    const roofArea = numberFrom(formData, "roofArea", 0, 0);
    const sheetType = numberFrom(formData, "sheetType", 32, 0.01);
    const waste = numberFrom(formData, "waste", 0, 0);

    const areaWithWaste = roofArea * (1 + waste / 100);
    const sheets = Math.ceil(areaWithWaste / sheetType);

    return result([
      `<span class="result-strong">Decking area w/ waste:</span> ${format(areaWithWaste)} sq ft`,
      `<span class="result-strong">Sheet count:</span> ${format(sheets, 0)} sheets`,
      `<span class="result-strong">Sheet coverage:</span> ${format(sheetType, 0)} sq ft per sheet`,
    ]);
  },

  "valley-flashing": (formData) => {
    const valley = numberFrom(formData, "valley", 0, 0);
    const stepCount = numberFrom(formData, "stepCount", 0, 0);
    const pieceLen = numberFrom(formData, "pieceLen", 10, 0.01);
    const waste = numberFrom(formData, "waste", 0, 0);
    const valleyWithWaste = valley * (1 + waste / 100);
    const valleyPieces = Math.ceil(valleyWithWaste / pieceLen);

    return result([
      `<span class="result-strong">Valley metal:</span> ${format(valleyWithWaste)} ft (${format(valleyPieces, 0)} pieces)`,
      `<span class="result-strong">Step flashing pieces:</span> ${format(Math.ceil(stepCount * (1 + waste / 100)), 0)}`,
    ]);
  },

  "starter-strip": (formData) => {
    const eaveLength = numberFrom(formData, "eaveLength", 0, 0);
    const bundleCoverage = numberFrom(formData, "bundleCoverage", 105, 0.01);
    const waste = numberFrom(formData, "waste", 0, 0);
    const totalLength = eaveLength * (1 + waste / 100);
    const bundles = Math.ceil(totalLength / bundleCoverage);
    return result([
      `<span class="result-strong">Starter length with waste:</span> ${format(totalLength)} ft`,
      `<span class="result-strong">Starter bundles:</span> ${format(bundles, 0)}`,
      `<span class="result-strong">Coverage basis:</span> ${format(bundleCoverage, 2)} linear ft / bundle`,
    ]);
  },

  "material-weight": (formData) => {
    const squares = numberFrom(formData, "squares", 0, 0);
    const weightPerSquare = numberFrom(formData, "weightPerSquare", 240, 0.01);
    const liftCap = numberFrom(formData, "liftCap", 2500, 1);
    const totalWeight = squares * weightPerSquare;
    const lifts = Math.ceil(totalWeight / liftCap);
    return result([
      `<span class="result-strong">Total material weight:</span> ${format(totalWeight, 0)} lb`,
      `<span class="result-strong">Equivalent metric:</span> ${format(totalWeight * 0.45359237, 1)} kg`,
      `<span class="result-strong">Delivery/lift loads:</span> ${format(lifts, 0)} loads`,
    ]);
  },

  "waste-advisor": (formData) => {
    const complexity = String(formData.get("complexity") || "moderate");
    const cutup = numberFrom(formData, "cutup", 8, 0);
    const steep = numberFrom(formData, "steep", 0, 0);
    const baseByComplexity = complexity === "simple" ? 6 : complexity === "complex" ? 12 : 9;
    const advised = baseByComplexity + (cutup * 0.35) + (steep >= 1 ? 4 : 0);
    const rounded = Math.ceil(advised);
    return result([
      `<span class="result-strong">Recommended waste factor:</span> ${format(rounded, 0)}%`,
      `<span class="result-strong">Model output:</span> ${format(advised, 2)}%`,
      `<span class="result-strong">Complexity basis:</span> ${complexity}`,
    ], ["Field conditions can increase waste. Round up where uncertain."]);
  },

  ventilation: (formData) => {
    const atticArea = numberFrom(formData, "atticArea", 0, 0);
    const ratio = numberFrom(formData, "ratio", 300, 1);
    const intakePct = numberFrom(formData, "intakePct", 50, 0);
    const intakeClamped = Math.min(intakePct, 100);
    const totalNfaSqIn = (atticArea * 144) / ratio;
    const intakeSqIn = totalNfaSqIn * (intakeClamped / 100);
    const exhaustSqIn = totalNfaSqIn - intakeSqIn;

    return result([
      `<span class="result-strong">Total required NFA:</span> ${format(totalNfaSqIn)} sq in`,
      `<span class="result-strong">Intake:</span> ${format(intakeSqIn)} sq in`,
      `<span class="result-strong">Exhaust:</span> ${format(exhaustSqIn)} sq in`,
    ], intakePct !== intakeClamped ? ["Intake split was clamped to 100% max."] : []);
  },

  "safety-lines": (formData) => {
    const length = numberFrom(formData, "length", 0, 0);
    const width = numberFrom(formData, "width", 0, 0);
    const runs = numberFrom(formData, "runs", 1, 1);
    const slack = numberFrom(formData, "slack", 0, 0);
    const base = (length + width) * runs;
    const total = base * (1 + slack / 100);

    return result([
      `<span class="result-strong">Base line length:</span> ${format(base)} ft`,
      `<span class="result-strong">Required with contingency:</span> ${format(total)} ft`,
      `<span class="result-strong">Recommendation:</span> Round up to next standard rope size.`,
    ]);
  },

  summary: (formData) => {
    const squares = numberFrom(formData, "squares", 0, 0);
    const waste = numberFrom(formData, "waste", 0, 0);
    const laborRate = numberFrom(formData, "laborRate", 0, 0);
    const matRate = numberFrom(formData, "matRate", 0, 0);
    const margin = numberFrom(formData, "margin", 0, 0);

    const billableSquares = squares * (1 + waste / 100);
    const labor = billableSquares * laborRate;
    const material = billableSquares * matRate;
    const subtotal = labor + material;
    const total = subtotal * (1 + margin / 100);

    return result([
      `<span class="result-strong">Billable squares:</span> ${format(billableSquares, 3)}`,
      `<span class="result-strong">Labor:</span> ${asMoney(labor)}`,
      `<span class="result-strong">Materials:</span> ${asMoney(material)}`,
      `<span class="result-strong">Subtotal:</span> ${asMoney(subtotal)}`,
      `<span class="result-strong">Final price:</span> ${asMoney(total)}`,
    ]);
  },

  production: (formData) => {
    const squares = numberFrom(formData, "squares", 0, 0);
    const crew = numberFrom(formData, "crew", 1, 1);
    const rate = numberFrom(formData, "rate", 0.7, 0.01);
    const hours = numberFrom(formData, "hours", 8, 1);
    const loss = numberFrom(formData, "loss", 0, 0);

    const grossPerDay = crew * rate;
    const netPerDay = grossPerDay * (1 - Math.min(loss, 95) / 100);
    const days = netPerDay > 0 ? squares / netPerDay : 0;
    const manHours = days * crew * hours;

    return result([
      `<span class="result-strong">Net production:</span> ${format(netPerDay, 2)} squares/day`,
      `<span class="result-strong">Estimated install days:</span> ${format(days, 2)} days`,
      `<span class="result-strong">Estimated labor hours:</span> ${format(manHours, 1)} man-hours`,
    ]);
  },

  runoff: (formData) => {
    const area = numberFrom(formData, "area", 0, 0);
    const rain = numberFrom(formData, "rain", 0, 0);
    const spoutCapacity = numberFrom(formData, "spoutCapacity", 12, 0.01);

    const gpm = gallonsPerMinute(area, rain);
    const spouts = Math.ceil(gpm / spoutCapacity);

    return result([
      `<span class="result-strong">Estimated runoff:</span> ${format(gpm, 2)} gallons/minute`,
      `<span class="result-strong">Downspouts required:</span> ${format(spouts, 0)}`,
      `<span class="result-strong">Capacity basis:</span> ${format(spoutCapacity, 2)} gpm per downspout`,
    ]);
  },

  "ridge-vent-plan": (formData) => {
    const atticArea = numberFrom(formData, "atticArea", 0, 0);
    const ratio = numberFrom(formData, "ratio", 300, 1);
    const intakePct = numberFrom(formData, "intakePct", 50, 0);
    const intakeClamped = Math.min(intakePct, 100);
    const ridgeNfaPerFt = numberFrom(formData, "ridgeNfaPerFt", 18, 0.01);

    const totalNfaSqIn = (atticArea * 144) / ratio;
    const intakeSqIn = totalNfaSqIn * (intakeClamped / 100);
    const exhaustSqIn = totalNfaSqIn - intakeSqIn;
    const ridgeLinearFt = exhaustSqIn / ridgeNfaPerFt;

    return result([
      `<span class="result-strong">Required exhaust NFA:</span> ${format(exhaustSqIn)} sq in`,
      `<span class="result-strong">Ridge vent length:</span> ${format(ridgeLinearFt, 2)} linear ft`,
      `<span class="result-strong">Intake target:</span> ${format(intakeSqIn)} sq in`,
    ], intakePct !== intakeClamped ? ["Intake split was clamped to 100% max."] : []);
  },

  "estimate-package": (formData) => {
    const squares = numberFrom(formData, "squares", 0, 0);
    const waste = numberFrom(formData, "waste", 0, 0);
    const materialRate = numberFrom(formData, "materialRate", 0, 0);
    const laborRate = numberFrom(formData, "laborRate", 0, 0);
    const tearOffRate = numberFrom(formData, "tearOffRate", 0, 0);
    const permitFee = numberFrom(formData, "permitFee", 0, 0);
    const dumpFee = numberFrom(formData, "dumpFee", 0, 0);
    const taxPct = numberFrom(formData, "taxPct", 0, 0);
    const marginPct = numberFrom(formData, "marginPct", 0, 0);

    const billableSquares = squares * (1 + waste / 100);
    const material = billableSquares * materialRate;
    const labor = billableSquares * laborRate;
    const tearOff = billableSquares * tearOffRate;
    const hardSubtotal = material + labor + tearOff + permitFee + dumpFee;
    const tax = material * (taxPct / 100);
    const subtotal = hardSubtotal + tax;
    const total = subtotal * (1 + marginPct / 100);

    return result([
      `<span class="result-strong">Billable squares:</span> ${format(billableSquares, 3)}`,
      `<span class="result-strong">Material:</span> ${asMoney(material)}`,
      `<span class="result-strong">Labor:</span> ${asMoney(labor)}`,
      `<span class="result-strong">Tear-off:</span> ${asMoney(tearOff)}`,
      `<span class="result-strong">Permit + dump:</span> ${asMoney(permitFee + dumpFee)}`,
      `<span class="result-strong">Tax on material:</span> ${asMoney(tax)}`,
      `<span class="result-strong">Final quoted total:</span> ${asMoney(total)}`,
    ]);
  },

  "unit-conversion": (formData) => {
    const lengthFt = numberFrom(formData, "lengthFt", 0, 0);
    const areaSqFt = numberFrom(formData, "areaSqFt", 0, 0);
    const rainInHr = numberFrom(formData, "rainInHr", 0, 0);
    const weightLb = numberFrom(formData, "weightLb", 0, 0);

    const lengthM = lengthFt * 0.3048;
    const areaSqM = areaSqFt * 0.09290304;
    const rainMmHr = rainInHr * 25.4;
    const weightKg = weightLb * 0.45359237;

    return result([
      `<span class="result-strong">Length:</span> ${format(lengthFt, 3)} ft = ${format(lengthM, 3)} m`,
      `<span class="result-strong">Area:</span> ${format(areaSqFt, 2)} sq ft = ${format(areaSqM, 2)} m²`,
      `<span class="result-strong">Rainfall:</span> ${format(rainInHr, 2)} in/hr = ${format(rainMmHr, 2)} mm/hr`,
      `<span class="result-strong">Weight:</span> ${format(weightLb, 2)} lb = ${format(weightKg, 2)} kg`,
    ]);
  },

  "drain-spacing": (formData) => {
    const length = numberFrom(formData, "length", 0, 0);
    const width = numberFrom(formData, "width", 0, 0);
    const areaPerDrain = numberFrom(formData, "areaPerDrain", 600, 1);
    const area = length * width;
    const drains = Math.max(1, Math.ceil(area / areaPerDrain));
    const spacing = drains > 0 ? length / drains : 0;
    return result([
      `<span class="result-strong">Roof area:</span> ${format(area)} sq ft`,
      `<span class="result-strong">Minimum drains/scuppers:</span> ${format(drains, 0)}`,
      `<span class="result-strong">Approx. spacing along length:</span> ${format(spacing, 2)} ft`,
    ], ["Verify final drain layout with local code and hydraulic calcs."]);
  },

  "dewpoint-risk": (formData) => {
    const indoorTemp = numberFrom(formData, "indoorTemp", 70);
    const indoorRh = numberFrom(formData, "indoorRh", 45, 1);
    const deckTemp = numberFrom(formData, "deckTemp", 40);
    const dewF = dewPointF(indoorTemp, indoorRh);
    const risk = deckTemp <= dewF ? "High" : deckTemp - dewF < 5 ? "Moderate" : "Low";
    return result([
      `<span class="result-strong">Indoor dew point:</span> ${format(dewF, 2)}°F`,
      `<span class="result-strong">Deck temperature:</span> ${format(deckTemp, 2)}°F`,
      `<span class="result-strong">Condensation risk:</span> ${risk}`,
    ], ["Use this as a quick screen; hygrothermal analysis is recommended for critical assemblies."]);
  },

  "snow-load-quick": (formData) => {
    const groundPsf = numberFrom(formData, "groundPsf", 30, 0);
    const ct = numberFrom(formData, "ct", 1, 0.1);
    const iFactor = numberFrom(formData, "iFactor", 1, 0.1);
    const ce = numberFrom(formData, "ce", 1, 0.1);
    const roofLoad = 0.7 * ce * ct * iFactor * groundPsf;
    return result([
      `<span class="result-strong">Approx. roof snow load:</span> ${format(roofLoad, 2)} psf`,
      `<span class="result-strong">Inputs:</span> Pg ${format(groundPsf, 2)} | Ce ${format(ce, 2)} | Ct ${format(ct, 2)} | I ${format(iFactor, 2)}`,
      `<span class="result-strong">Load class:</span> ${roofLoad >= 40 ? "Heavy" : roofLoad >= 25 ? "Moderate" : "Light"}`,
    ], ["Preliminary only. Engineer and code-required combinations govern final design."]);
  },

  "measurement-pack": (formData) => {
    const faces = numberFrom(formData, "faces", 1, 1);
    const valleys = numberFrom(formData, "valleys", 0, 0);
    const penetrations = numberFrom(formData, "penetrations", 0, 0);
    const skylights = numberFrom(formData, "skylights", 0, 0);
    const totalDetailItems = valleys + penetrations + skylights;
    return result([
      `<span class="result-strong">Measure roof faces:</span> ${format(faces, 0)} entries`,
      `<span class="result-strong">Detail zones to document:</span> ${format(totalDetailItems, 0)}`,
      `<span class="result-strong">Photo checklist minimum:</span> ${format((faces * 2) + (totalDetailItems * 2), 0)} photos`,
      `<span class="result-strong">Flashing points:</span> valleys ${format(valleys, 0)}, penetrations ${format(penetrations, 0)}, skylights ${format(skylights, 0)}`,
    ]);
  },

  "job-checklist": (formData) => {
    const projectType = String(formData.get("projectType") || "replacement");
    const tearoff = numberFrom(formData, "tearoff", 1, 0);
    const decking = numberFrom(formData, "decking", 1, 0);
    const lines = [
      `<span class="result-strong">Project type:</span> ${projectType}`,
      `<span class="result-strong">Pre-start:</span> permits, material staging, safety setup`,
      `<span class="result-strong">Dry-in:</span> underlayment + leak check before shingle run`,
      `<span class="result-strong">Closeout:</span> magnet sweep, photo set, punch walkthrough`,
    ];
    if (tearoff >= 1) lines.push(`<span class="result-strong">Tear-off step:</span> deck inspection + disposal logistics`);
    if (decking >= 1) lines.push(`<span class="result-strong">Decking step:</span> sheet layout, fastening pattern, seam check`);
    return result(lines);
  },

  "crew-kit": (formData) => {
    const crew = numberFrom(formData, "crew", 1, 1);
    const nailers = numberFrom(formData, "nailers", 0, 0);
    const harness = numberFrom(formData, "harness", 0, 0);
    const neededNailers = Math.ceil(crew * 0.75);
    const neededHarness = crew;
    const nailerGap = Math.max(neededNailers - nailers, 0);
    const harnessGap = Math.max(neededHarness - harness, 0);
    return result([
      `<span class="result-strong">Crew size:</span> ${format(crew, 0)}`,
      `<span class="result-strong">Nailer target:</span> ${format(neededNailers, 0)} (${nailerGap ? `${format(nailerGap, 0)} short` : "OK"})`,
      `<span class="result-strong">Harness target:</span> ${format(neededHarness, 0)} (${harnessGap ? `${format(harnessGap, 0)} short` : "OK"})`,
    ]);
  },

  "daily-brief": (formData) => {
    const targetSq = numberFrom(formData, "targetSq", 0, 0);
    const delayRisk = numberFrom(formData, "delayRisk", 0, 0);
    const detailZones = numberFrom(formData, "detailZones", 0, 0);
    const riskFactor = Math.max(0, 1 - (Math.min(delayRisk, 80) / 100));
    const detailPenalty = Math.max(0, 1 - Math.min(detailZones * 0.04, 0.3));
    const adjustedTarget = targetSq * riskFactor * detailPenalty;
    return result([
      `<span class="result-strong">Planned target:</span> ${format(targetSq, 2)} squares`,
      `<span class="result-strong">Adjusted target:</span> ${format(adjustedTarget, 2)} squares`,
      `<span class="result-strong">Suggested brief:</span> Prioritize dry-in early, assign best installers to detail zones.`
    ]);
  },
};

function render(resultEl, payload) {
  const list = `<ul>${payload.lines.map((line) => `<li>${line}</li>`).join("")}</ul>`;
  const note = payload.notes.length ? `<p class="result-note">${payload.notes.join(" ")}</p>` : "";
  resultEl.innerHTML = `${list}${note}`;
}

function getResultText(payload) {
  return payload.lines
    .map((line) => line.replace(/<[^>]+>/g, "").trim())
    .join("\n");
}

function buildFullReportText() {
  const stamp = new Date().toLocaleString();
  const sections = cards.map((card) => {
    const tool = card.dataset.tool || "tool";
    const title = card.querySelector("h2")?.textContent?.trim() || tool;
    const payload = latestResults[tool];
    if (!payload) return `## ${title}\nNo data yet.`;
    const lines = payload.lines.map((line) => `- ${line.replace(/<[^>]+>/g, "").trim()}`).join("\n");
    const notes = payload.notes.length ? `\nNotes: ${payload.notes.join(" ")}` : "";
    return `## ${title}\n${lines}${notes}`;
  });

  return [`Roofing Tools - Full Job Report`, `Generated: ${stamp}`, "", ...sections].join("\n");
}

function debounce(fn, delay) {
  let timeout = 0;
  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => fn(...args), delay);
  };
}

function injectCardActions(card, runNow, getLatestText) {
  const heading = card.querySelector("h2");
  const form = card.querySelector("form");
  if (!heading || !form || card.querySelector(".card-head")) return;

  const head = document.createElement("div");
  head.className = "card-head";
  heading.parentNode.insertBefore(head, heading);
  head.appendChild(heading);

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.textContent = "Copy";

  const resetBtnEl = document.createElement("button");
  resetBtnEl.type = "button";
  resetBtnEl.textContent = "Reset";

  actions.append(copyBtn, resetBtnEl);
  head.appendChild(actions);

  copyBtn.addEventListener("click", async () => {
    const text = getLatestText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const notice = document.createElement("p");
      notice.className = "result-copy-ok";
      notice.textContent = "Copied result to clipboard.";
      const resultEl = card.querySelector(".result");
      if (resultEl) {
        resultEl.appendChild(notice);
        window.setTimeout(() => notice.remove(), 1200);
      }
    } catch {
      
    }
  });

  resetBtnEl.addEventListener("click", () => {
    const tool = card.dataset.tool;
    if (!tool || !defaultSnapshot[tool]) return;
    objectToForm(form, defaultSnapshot[tool]);
    runNow();
  });
}

function setupTools() {
  cards.forEach((card) => {
    const tool = card.dataset.tool;
    const form = card.querySelector("form");
    const resultEl = card.querySelector(".result");
    const compute = calculators[tool];
    if (!tool || !form || !resultEl || typeof compute !== "function") return;

    let latestText = "";
    const run = () => {
      const payload = compute(new FormData(form));
      latestText = getResultText(payload);
      latestResults[tool] = payload;
      render(resultEl, payload);
      saveState();
    };

    const runDebounced = debounce(run, INPUT_DEBOUNCE_MS);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      run();
    });

    form.addEventListener("input", runDebounced);
    injectCardActions(card, run, () => latestText);
    run();
  });
}

function runAll() {
  cards.forEach((card) => {
    const form = card.querySelector("form");
    if (!form) return;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => setTab(tab.dataset.tab || "layout"));
});

applyPresetBtn?.addEventListener("click", () => {
  applyNamedPreset(presetSelect?.value || "residential");
});

resetBtn?.addEventListener("click", resetToDefaults);

copyFullReportBtn?.addEventListener("click", async () => {
  const report = buildFullReportText();
  try {
    await navigator.clipboard.writeText(report);
    copyFullReportBtn.textContent = "Report Copied";
    window.setTimeout(() => {
      copyFullReportBtn.textContent = "Copy Full Job Report";
    }, 1200);
  } catch {
    copyFullReportBtn.textContent = "Copy Failed";
    window.setTimeout(() => {
      copyFullReportBtn.textContent = "Copy Full Job Report";
    }, 1200);
  }
});

captureDefaults();
loadState();
setupTools();
setTab(localStorage.getItem(TAB_KEY) || "layout");
