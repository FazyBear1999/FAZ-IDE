const app = document.getElementById("app");
// This lesson updates the preview panel as you complete each guided block.

// This section focuses on timer seed. [LESSON:timer-seed]
app.innerHTML = "<div style=\"display:flex;gap:8px;\"><button id=\"startBtn\" type=\"button\">Start</button><button id=\"stopBtn\" type=\"button\">Stop</button></div><p id=\"timerLabel\">Seconds: 0</p>";

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const timerLabel = document.getElementById("timerLabel");
let seconds = 0;
let timerId = 0;

// This section focuses on timer wire. [LESSON:timer-wire]
startBtn.addEventListener("click", function () {
    if (timerId) return;
    timerId = window.setInterval(function () {
        seconds += 1;
        timerLabel.textContent = "Seconds: " + seconds;
    }, 1000);
});

stopBtn.addEventListener("click", function () {
    if (!timerId) return;
    window.clearInterval(timerId);
    timerId = 0;
});

// Beginner JS 13: Timers
// setInterval basics
