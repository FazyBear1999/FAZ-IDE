const units = {
  millimeter: { label: "Millimeter (mm)", toMeters: 0.001 },
  centimeter: { label: "Centimeter (cm)", toMeters: 0.01 },
  meter: { label: "Meter (m)", toMeters: 1 },
  kilometer: { label: "Kilometer (km)", toMeters: 1000 },
  foot: { label: "Foot (ft)", toMeters: 0.3048 },
  mile: { label: "Mile (mi)", toMeters: 1609.344 },
};

const inputValueEl = document.getElementById("inputValue");
const fromUnitEl = document.getElementById("fromUnit");
const toUnitEl = document.getElementById("toUnit");
const swapUnitsEl = document.getElementById("swapUnits");
const resultTextEl = document.getElementById("resultText");

function formatNumber(value) {
  if (!Number.isFinite(value)) return "0";
  return Number.parseFloat(value.toFixed(6)).toString();
}

function populateUnitSelect(selectEl, selectedId) {
  Object.entries(units).forEach(([id, unit]) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = unit.label;
    if (id === selectedId) option.selected = true;
    selectEl.appendChild(option);
  });
}

function convert() {
  const amount = Number(inputValueEl.value || 0);
  const from = units[fromUnitEl.value];
  const to = units[toUnitEl.value];
  if (!from || !to) {
    resultTextEl.textContent = "Pick valid units.";
    return;
  }

  const meters = amount * from.toMeters;
  const converted = meters / to.toMeters;
  resultTextEl.textContent = `${formatNumber(amount)} ${from.label} = ${formatNumber(converted)} ${to.label}`;
}

swapUnitsEl.addEventListener("click", () => {
  const currentFrom = fromUnitEl.value;
  fromUnitEl.value = toUnitEl.value;
  toUnitEl.value = currentFrom;
  convert();
});

inputValueEl.addEventListener("input", convert);
fromUnitEl.addEventListener("change", convert);
toUnitEl.addEventListener("change", convert);

populateUnitSelect(fromUnitEl, "meter");
populateUnitSelect(toUnitEl, "foot");
convert();
