const app = document.getElementById("app") || document.getElementById("out") || document.body;
// This lesson updates the preview panel as you complete each guided block.

// This section focuses on toggle seed. [LESSON:toggle-seed]
app.innerHTML = "<button id=\"modeBtn\" type=\"button\">Enable Focus Mode</button><p id=\"modeText\" data-focus=\"false\">Focus mode: OFF</p>";

const modeBtn = document.getElementById("modeBtn");
const modeText = document.getElementById("modeText");
let focusMode = false;

// This section focuses on toggle wire. [LESSON:toggle-wire]
modeBtn.addEventListener("click", function () {
    focusMode = !focusMode;
    modeText.dataset.focus = String(focusMode);
    modeText.textContent = "Focus mode: " + (focusMode ? "ON" : "OFF");
    modeBtn.textContent = focusMode ? "Disable Focus Mode" : "Enable Focus Mode";
});

// Beginner JS 15: Theme-safe Toggle
// State + data attributes
