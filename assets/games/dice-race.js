/*
  Dice Race (single-file JavaScript game)
  ---------------------------------------
  How it works:
  - You and the CPU roll one die per turn.
  - First side to reach 25 total points wins.
*/

document.body.innerHTML = "";
document.body.style.margin = "0";

const oldTheme = document.querySelector("style[data-game-theme='fun-vibe']");
if (oldTheme) oldTheme.remove();

const style = document.createElement("style");
style.dataset.gameTheme = "fun-vibe";
style.textContent = `
  * { box-sizing: border-box; }
  body {
    font-family: "Trebuchet MS", "Segoe UI", sans-serif;
    color: #ffffff;
    background:
      radial-gradient(circle at 14% 18%, #ff4fd8 0%, rgba(255, 79, 216, 0.06) 38%),
      radial-gradient(circle at 86% 14%, #4fd5ff 0%, rgba(79, 213, 255, 0.06) 34%),
      radial-gradient(circle at 74% 84%, #ffd45a 0%, rgba(255, 212, 90, 0.06) 30%),
      linear-gradient(160deg, #12062a 0%, #0a1230 55%, #1d0c2f 100%);
  }
  .scene { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
  .card {
    width: min(520px, 96vw);
    border-radius: 20px;
    padding: 22px;
    border: 1px solid rgba(255, 255, 255, 0.28);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.06));
    backdrop-filter: blur(10px);
    box-shadow: 0 18px 38px rgba(6, 4, 16, 0.62);
  }
  .title {
    margin: 0 0 6px;
    font-size: 24px;
    font-weight: 900;
    text-shadow: 0 4px 20px rgba(255, 79, 216, 0.45);
  }
  .sub {
    margin: 0 0 12px;
    color: #f7e6ff;
    opacity: 0.92;
    font-size: 14px;
  }
  .dice-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 10px;
  }
  .die-box {
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.28);
    background: rgba(12, 8, 26, 0.42);
    padding: 12px;
    text-align: center;
  }
  .die-label {
    margin: 0 0 6px;
    font-size: 13px;
    color: #f7e6ff;
  }
  .die-value {
    margin: 0;
    font-size: 34px;
    font-weight: 900;
  }
  .bars { margin-bottom: 10px; }
  .bar-row { margin-bottom: 8px; }
  .bar-label {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    margin-bottom: 4px;
  }
  .track {
    height: 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.18);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    width: 0%;
    border-radius: 999px;
    transition: width 180ms ease;
  }
  .fill.player { background: linear-gradient(90deg, #5fd4ff, #7f7dff); }
  .fill.cpu { background: linear-gradient(90deg, #ff8a5f, #ff5fd6); }
  .result {
    min-height: 24px;
    margin: 0 0 10px;
    font-size: 14px;
    font-weight: 800;
    color: #d8bcff;
  }
  .row { display: flex; gap: 10px; flex-wrap: wrap; }
  .btn {
    border: 0;
    border-radius: 10px;
    padding: 10px 14px;
    color: #ffffff;
    font-weight: 900;
    cursor: pointer;
    background: linear-gradient(120deg, #ff5fd6, #7f7dff 55%, #5fd4ff);
    box-shadow: 0 10px 20px rgba(93, 75, 199, 0.45);
  }
  .btn.alt {
    color: #3b2046;
    background: linear-gradient(120deg, #ffd45a, #ff8a5f);
    box-shadow: 0 10px 20px rgba(153, 97, 52, 0.35);
  }
`;
document.head.appendChild(style);

const TARGET = 25;

const scene = document.createElement("div");
scene.className = "scene";

const card = document.createElement("section");
card.className = "card";

const title = document.createElement("h2");
title.className = "title";
title.textContent = "Dice Race";

const subtitle = document.createElement("p");
subtitle.className = "sub";
subtitle.textContent = `First to ${TARGET} points wins.`;

const diceRow = document.createElement("div");
diceRow.className = "dice-row";

const playerDieBox = document.createElement("div");
playerDieBox.className = "die-box";
const cpuDieBox = document.createElement("div");
cpuDieBox.className = "die-box";

const playerDieLabel = document.createElement("p");
playerDieLabel.className = "die-label";
playerDieLabel.textContent = "You";
const cpuDieLabel = document.createElement("p");
cpuDieLabel.className = "die-label";
cpuDieLabel.textContent = "CPU";

const playerDie = document.createElement("p");
playerDie.className = "die-value";
playerDie.textContent = "-";
const cpuDie = document.createElement("p");
cpuDie.className = "die-value";
cpuDie.textContent = "-";

playerDieBox.append(playerDieLabel, playerDie);
cpuDieBox.append(cpuDieLabel, cpuDie);
diceRow.append(playerDieBox, cpuDieBox);

const bars = document.createElement("div");
bars.className = "bars";

const playerBarRow = document.createElement("div");
playerBarRow.className = "bar-row";
const cpuBarRow = document.createElement("div");
cpuBarRow.className = "bar-row";

const playerBarLabel = document.createElement("div");
playerBarLabel.className = "bar-label";
const cpuBarLabel = document.createElement("div");
cpuBarLabel.className = "bar-label";

const playerTrack = document.createElement("div");
playerTrack.className = "track";
const cpuTrack = document.createElement("div");
cpuTrack.className = "track";

const playerFill = document.createElement("div");
playerFill.className = "fill player";
const cpuFill = document.createElement("div");
cpuFill.className = "fill cpu";

playerTrack.appendChild(playerFill);
cpuTrack.appendChild(cpuFill);
playerBarRow.append(playerBarLabel, playerTrack);
cpuBarRow.append(cpuBarLabel, cpuTrack);
bars.append(playerBarRow, cpuBarRow);

const result = document.createElement("p");
result.className = "result";

const row = document.createElement("div");
row.className = "row";
const rollBtn = document.createElement("button");
rollBtn.className = "btn";
rollBtn.type = "button";
rollBtn.textContent = "Roll Dice";
const resetBtn = document.createElement("button");
resetBtn.className = "btn alt";
resetBtn.type = "button";
resetBtn.textContent = "Reset";
row.append(rollBtn, resetBtn);

card.append(title, subtitle, diceRow, bars, result, row);
scene.appendChild(card);
document.body.appendChild(scene);

let playerScore = 0;
let cpuScore = 0;
let finished = false;

function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
}

function render() {
  playerBarLabel.textContent = `You: ${playerScore}/${TARGET}`;
  cpuBarLabel.textContent = `CPU: ${cpuScore}/${TARGET}`;
  playerFill.style.width = `${Math.min(100, (playerScore / TARGET) * 100)}%`;
  cpuFill.style.width = `${Math.min(100, (cpuScore / TARGET) * 100)}%`;
}

function checkWinner() {
  if (playerScore >= TARGET && cpuScore >= TARGET) {
    finished = true;
    result.textContent = "Draw race! Both crossed the finish line.";
    result.style.color = "#ffd45a";
    return true;
  }
  if (playerScore >= TARGET) {
    finished = true;
    result.textContent = "You win the race!";
    result.style.color = "#6ff6b3";
    return true;
  }
  if (cpuScore >= TARGET) {
    finished = true;
    result.textContent = "CPU wins this race.";
    result.style.color = "#ff9cc9";
    return true;
  }
  return false;
}

rollBtn.addEventListener("click", () => {
  if (finished) return;
  const playerRoll = rollDie();
  const cpuRoll = rollDie();
  playerScore += playerRoll;
  cpuScore += cpuRoll;
  playerDie.textContent = String(playerRoll);
  cpuDie.textContent = String(cpuRoll);
  render();
  if (!checkWinner()) {
    result.textContent = `You rolled ${playerRoll}. CPU rolled ${cpuRoll}.`;
    result.style.color = "#d8bcff";
  }
});

resetBtn.addEventListener("click", () => {
  playerScore = 0;
  cpuScore = 0;
  finished = false;
  playerDie.textContent = "-";
  cpuDie.textContent = "-";
  result.textContent = "New race. Roll to start.";
  result.style.color = "#d8bcff";
  render();
});

result.textContent = "New race. Roll to start.";
render();
