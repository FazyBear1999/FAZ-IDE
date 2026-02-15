/*
  Target Tap (single-file JavaScript game)
  ----------------------------------------
  How it works:
  - Press Start to begin a 15-second round.
  - Tap the moving target to score points.
  - Miss clicks on the arena count as misses.
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
      radial-gradient(circle at 15% 18%, #ff4fd8 0%, rgba(255, 79, 216, 0.06) 38%),
      radial-gradient(circle at 84% 12%, #4fd5ff 0%, rgba(79, 213, 255, 0.06) 34%),
      radial-gradient(circle at 72% 84%, #ffd45a 0%, rgba(255, 212, 90, 0.06) 30%),
      linear-gradient(160deg, #12062a 0%, #0a1230 55%, #1d0c2f 100%);
  }
  .scene { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
  .card {
    width: min(560px, 96vw);
    border-radius: 20px;
    padding: 20px;
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
  .top-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; align-items: center; }
  .pill {
    border-radius: 999px;
    padding: 8px 12px;
    border: 1px solid rgba(255, 255, 255, 0.28);
    background: rgba(12, 8, 26, 0.42);
    font-weight: 900;
    font-size: 13px;
  }
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
  .arena {
    position: relative;
    height: 260px;
    border-radius: 16px;
    border: 1px dashed rgba(255, 255, 255, 0.35);
    background: linear-gradient(180deg, rgba(15, 10, 34, 0.74), rgba(17, 12, 40, 0.52));
    overflow: hidden;
    cursor: crosshair;
  }
  .target {
    position: absolute;
    width: 54px;
    height: 54px;
    border-radius: 50%;
    border: 0;
    cursor: pointer;
    font-size: 24px;
    color: #ffffff;
    background: radial-gradient(circle at 30% 30%, #8be8ff 0%, #4fd5ff 50%, #1f97c5 100%);
    box-shadow: 0 8px 16px rgba(34, 110, 136, 0.45);
  }
  .hint {
    margin: 10px 0 0;
    font-size: 13px;
    color: #f7e6ff;
    opacity: 0.9;
  }
`;
document.head.appendChild(style);

const ROUND_SECONDS = 15;

const scene = document.createElement("div");
scene.className = "scene";
const card = document.createElement("section");
card.className = "card";

const title = document.createElement("h2");
title.className = "title";
title.textContent = "Target Tap";

const subtitle = document.createElement("p");
subtitle.className = "sub";
subtitle.textContent = "Tap the moving target before time runs out.";

const topRow = document.createElement("div");
topRow.className = "top-row";

const scorePill = document.createElement("span");
scorePill.className = "pill";
const missPill = document.createElement("span");
missPill.className = "pill";
const timePill = document.createElement("span");
timePill.className = "pill";

const startBtn = document.createElement("button");
startBtn.className = "btn";
startBtn.type = "button";
startBtn.textContent = "Start Round";

const arena = document.createElement("div");
arena.className = "arena";
const target = document.createElement("button");
target.className = "target";
target.type = "button";
target.textContent = "X";
arena.appendChild(target);

const hint = document.createElement("p");
hint.className = "hint";
hint.textContent = "Click Start to begin.";

topRow.append(scorePill, missPill, timePill, startBtn);
card.append(title, subtitle, topRow, arena, hint);
scene.appendChild(card);
document.body.appendChild(scene);

let score = 0;
let misses = 0;
let timeLeft = ROUND_SECONDS;
let running = false;
let timerId = null;

function render() {
  scorePill.textContent = `Hits: ${score}`;
  missPill.textContent = `Misses: ${misses}`;
  timePill.textContent = `Time: ${timeLeft}s`;
}

function placeTarget() {
  const maxX = Math.max(0, arena.clientWidth - target.offsetWidth - 8);
  const maxY = Math.max(0, arena.clientHeight - target.offsetHeight - 8);
  target.style.left = `${Math.floor(Math.random() * (maxX + 1))}px`;
  target.style.top = `${Math.floor(Math.random() * (maxY + 1))}px`;
}

function endRound() {
  if (timerId) clearInterval(timerId);
  timerId = null;
  running = false;
  startBtn.disabled = false;
  target.style.display = "none";
  hint.textContent = `Round over! Hits: ${score}, Misses: ${misses}.`;
}

function startRound() {
  score = 0;
  misses = 0;
  timeLeft = ROUND_SECONDS;
  running = true;
  startBtn.disabled = true;
  hint.textContent = "Go!";
  target.style.display = "block";
  render();
  placeTarget();

  if (timerId) clearInterval(timerId);
  timerId = setInterval(() => {
    timeLeft -= 1;
    render();
    if (timeLeft <= 0) endRound();
  }, 1000);
}

target.addEventListener("click", (event) => {
  event.stopPropagation();
  if (!running) return;
  score += 1;
  render();
  placeTarget();
});

arena.addEventListener("click", () => {
  if (!running) return;
  misses += 1;
  render();
});

startBtn.addEventListener("click", startRound);

target.style.display = "none";
render();
