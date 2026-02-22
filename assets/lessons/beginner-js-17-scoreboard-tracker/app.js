const app = document.getElementById("app") || document.getElementById("out") || document.body;
// This lesson updates the preview panel as you complete each guided block.

// This section focuses on score seed. [LESSON:score-seed]
app.innerHTML = "<p id=\"board\">Home 0 : 0 Away</p><div style=\"display:flex;gap:8px;flex-wrap:wrap;\"><button id=\"homeBtn\" type=\"button\">Home +1</button><button id=\"awayBtn\" type=\"button\">Away +1</button><button id=\"resetBtn\" type=\"button\">Reset</button></div>";

const board = document.getElementById("board");
const homeBtn = document.getElementById("homeBtn");
const awayBtn = document.getElementById("awayBtn");
const resetBtn = document.getElementById("resetBtn");

// This section focuses on score state. [LESSON:score-state]
const score = { home: 0, away: 0 };
function renderScoreboard() {
    board.textContent = "Home " + score.home + " : " + score.away + " Away";
}
renderScoreboard();

// This section focuses on score wire. [LESSON:score-wire]
homeBtn.addEventListener("click", function () { score.home += 1; renderScoreboard(); });
awayBtn.addEventListener("click", function () { score.away += 1; renderScoreboard(); });
resetBtn.addEventListener("click", function () { score.home = 0; score.away = 0; renderScoreboard(); });

// Beginner JS 17: Scoreboard
// State object + render
