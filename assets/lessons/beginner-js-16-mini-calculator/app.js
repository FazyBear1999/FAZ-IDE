const app = document.getElementById("app");
// This lesson updates the preview panel as you complete each guided block.

// This section focuses on calc seed. [LESSON:calc-seed]
app.innerHTML = "<div style=\"display:grid;gap:8px;max-width:280px;\"><input id=\"numA\" type=\"number\" value=\"2\" /><input id=\"numB\" type=\"number\" value=\"3\" /><button id=\"calcBtn\" type=\"button\">Calculate</button></div><p id=\"calcOut\">Result: --</p>";

const numA = document.getElementById("numA");
const numB = document.getElementById("numB");
const calcBtn = document.getElementById("calcBtn");
const calcOut = document.getElementById("calcOut");

// This section focuses on calc wire. [LESSON:calc-wire]
calcBtn.addEventListener("click", function () {
    const a = Number(numA.value || 0);
    const b = Number(numB.value || 0);
    calcOut.textContent = "Sum: " + (a + b) + " • Product: " + (a * b);
});

// Beginner JS 16: Mini Calculator
// Number parsing
