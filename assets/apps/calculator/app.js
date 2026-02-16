const displayEl = document.getElementById("calcDisplay");
const keypadEl = document.querySelector(".keypad");

const state = {
  current: "0",
  previous: "",
  operator: "",
  overwrite: false,
};

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatResult(value) {
  const rounded = Number.parseFloat(Number(value).toFixed(10));
  return Number.isFinite(rounded) ? String(rounded) : "0";
}

function compute(left, operator, right) {
  if (operator === "+") return left + right;
  if (operator === "-") return left - right;
  if (operator === "*") return left * right;
  if (operator === "/") return right === 0 ? 0 : left / right;
  return right;
}

function setDisplay(text) {
  displayEl.value = text;
}

function inputDigit(digit) {
  if (state.overwrite) {
    state.current = digit;
    state.overwrite = false;
  } else {
    state.current = state.current === "0" ? digit : state.current + digit;
  }
  setDisplay(state.current);
}

function inputDecimal() {
  if (state.overwrite) {
    state.current = "0.";
    state.overwrite = false;
  } else if (!state.current.includes(".")) {
    state.current += ".";
  }
  setDisplay(state.current);
}

function clearAll() {
  state.current = "0";
  state.previous = "";
  state.operator = "";
  state.overwrite = false;
  setDisplay(state.current);
}

function toggleSign() {
  const value = formatResult(-toNumber(state.current));
  state.current = value;
  setDisplay(state.current);
}

function percent() {
  const value = formatResult(toNumber(state.current) / 100);
  state.current = value;
  setDisplay(state.current);
}

function chooseOperator(nextOperator) {
  if (state.operator && !state.overwrite) {
    evaluate();
  }
  state.previous = state.current;
  state.operator = nextOperator;
  state.overwrite = true;
}

function evaluate() {
  if (!state.operator || state.previous === "") return;
  const left = toNumber(state.previous);
  const right = toNumber(state.current);
  const result = compute(left, state.operator, right);
  state.current = formatResult(result);
  state.previous = "";
  state.operator = "";
  state.overwrite = true;
  setDisplay(state.current);
}

keypadEl.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  const digit = button.dataset.key;
  if (digit) {
    inputDigit(digit);
    return;
  }

  const action = button.dataset.action;
  if (action === "decimal") inputDecimal();
  if (action === "clear") clearAll();
  if (action === "sign") toggleSign();
  if (action === "percent") percent();
  if (action === "equals") evaluate();
  if (action === "operator") chooseOperator(button.dataset.op || "");
});

setDisplay(state.current);
