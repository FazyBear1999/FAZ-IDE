const shapeTypeEl = document.getElementById("shapeType");
const shapeInputsEl = document.getElementById("shapeInputs");
const calcGeometryEl = document.getElementById("calcGeometry");
const areaValueEl = document.getElementById("areaValue");
const perimeterValueEl = document.getElementById("perimeterValue");

const fieldConfig = {
  rectangle: [
    { key: "width", label: "Width" },
    { key: "height", label: "Height" },
  ],
  circle: [
    { key: "radius", label: "Radius" },
  ],
  triangle: [
    { key: "a", label: "Side A" },
    { key: "b", label: "Side B" },
    { key: "c", label: "Side C" },
  ],
};

function formatNumber(value) {
  if (!Number.isFinite(value)) return "-";
  return Number.parseFloat(value.toFixed(4)).toString();
}

function getShapeValues() {
  const values = {};
  shapeInputsEl.querySelectorAll("input[data-key]").forEach((input) => {
    values[input.dataset.key] = Number(input.value || 0);
  });
  return values;
}

function renderShapeInputs() {
  const shape = shapeTypeEl.value;
  const fields = fieldConfig[shape] || [];
  shapeInputsEl.innerHTML = "";

  fields.forEach((field) => {
    const wrap = document.createElement("div");

    const label = document.createElement("label");
    label.textContent = field.label;
    label.setAttribute("for", `shape-${field.key}`);

    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.id = `shape-${field.key}`;
    input.dataset.key = field.key;
    input.value = "1";

    wrap.appendChild(label);
    wrap.appendChild(input);
    shapeInputsEl.appendChild(wrap);
  });
}

function calculate() {
  const shape = shapeTypeEl.value;
  const values = getShapeValues();

  let area = NaN;
  let perimeter = NaN;

  if (shape === "rectangle") {
    const w = values.width;
    const h = values.height;
    area = w * h;
    perimeter = 2 * (w + h);
  }

  if (shape === "circle") {
    const r = values.radius;
    area = Math.PI * r * r;
    perimeter = 2 * Math.PI * r;
  }

  if (shape === "triangle") {
    const a = values.a;
    const b = values.b;
    const c = values.c;
    const s = (a + b + c) / 2;
    const areaSquared = s * (s - a) * (s - b) * (s - c);
    area = areaSquared > 0 ? Math.sqrt(areaSquared) : NaN;
    perimeter = a + b + c;
  }

  areaValueEl.textContent = formatNumber(area);
  perimeterValueEl.textContent = formatNumber(perimeter);
}

shapeTypeEl.addEventListener("change", () => {
  renderShapeInputs();
  calculate();
});

calcGeometryEl.addEventListener("click", calculate);
shapeInputsEl.addEventListener("input", calculate);

renderShapeInputs();
calculate();
