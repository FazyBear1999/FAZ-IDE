/*
  Quick Math (single-file JavaScript game)
  ----------------------------------------
  How it works:
  - Start a 30-second round.
  - Solve as many math prompts as possible.
  - Correct answers increase score.
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
    width: min(500px, 96vw);
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
  .stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 10px;
  }
  .tile {
    border-radius: 12px;
    padding: 9px;
    border: 1px solid rgba(255, 255, 255, 0.28);
    background: rgba(12, 8, 26, 0.42);
    font-weight: 900;
    font-size: 13px;
    text-align: center;
  }
  .question {
    border-radius: 14px;
    padding: 14px;
    margin-bottom: 10px;
    border: 1px solid rgba(255, 255, 255, 0.28);
    background: rgba(12, 8, 26, 0.42);
    font-size: 30px;
    font-weight: 900;
    text-align: center;
  }
  .row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }
  .answer {
    flex: 1;
    min-width: 140px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.35);
    background: rgba(20, 12, 39, 0.72);
    color: #ffffff;
    padding: 10px;
    font-size: 15px;
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
  .btn.alt {
    color: #3b2046;
    background: linear-gradient(120deg, #ffd45a, #ff8a5f);
    box-shadow: 0 10px 20px rgba(153, 97, 52, 0.35);
  }
  .result {
    min-height: 24px;
    margin: 0;
    font-size: 14px;
    font-weight: 800;
    color: #d8bcff;
  }
`;
document.head.appendChild(style);

const ROUND_SECONDS = 30;

const scene = document.createElement("div");
scene.className = "scene";
const card = document.createElement("section");
card.className = "card";

const title = document.createElement("h2");
title.className = "title";
title.textContent = "Quick Math";

const subtitle = document.createElement("p");
subtitle.className = "sub";
subtitle.textContent = "Solve as many problems as you can in 30 seconds.";

const stats = document.createElement("div");
stats.className = "stats";
const scoreTile = document.createElement("div");
scoreTile.className = "tile";
const timeTile = document.createElement("div");
timeTile.className = "tile";
stats.append(scoreTile, timeTile);

const question = document.createElement("div");
question.className = "question";
question.textContent = "-";

const row = document.createElement("div");
row.className = "row";
const input = document.createElement("input");
input.className = "answer";
input.type = "number";
input.placeholder = "Answer";
const submitBtn = document.createElement("button");
submitBtn.className = "btn";
submitBtn.type = "button";
submitBtn.textContent = "Submit";
const startBtn = document.createElement("button");
startBtn.className = "btn alt";
startBtn.type = "button";
startBtn.textContent = "Start";
row.append(input, submitBtn, startBtn);

const result = document.createElement("p");
result.className = "result";

card.append(title, subtitle, stats, question, row, result);
scene.appendChild(card);
document.body.appendChild(scene);

let score = 0;
let timeLeft = ROUND_SECONDS;
let running = false;
let timerId = null;
let currentAnswer = 0;

function renderStats() {
  scoreTile.textContent = `Score: ${score}`;
  timeTile.textContent = `Time: ${timeLeft}s`;
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function nextQuestion() {
  const usePlus = Math.random() < 0.65;
  const a = randomInt(20) + 1;
  const b = randomInt(20) + 1;
  if (usePlus) {
    currentAnswer = a + b;
    question.textContent = `${a} + ${b} = ?`;
  } else {
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    currentAnswer = hi - lo;
    question.textContent = `${hi} - ${lo} = ?`;
  }
}

function endRound() {
  if (timerId) clearInterval(timerId);
  timerId = null;
  running = false;
  startBtn.disabled = false;
  submitBtn.disabled = true;
  input.disabled = true;
  result.textContent = `Time up! Final score: ${score}.`;
  result.style.color = "#ffd45a";
}

function startRound() {
  score = 0;
  timeLeft = ROUND_SECONDS;
  running = true;
  startBtn.disabled = true;
  submitBtn.disabled = false;
  input.disabled = false;
  input.value = "";
  result.textContent = "Go!";
  result.style.color = "#d8bcff";
  renderStats();
  nextQuestion();
  input.focus();

  if (timerId) clearInterval(timerId);
  timerId = setInterval(() => {
    timeLeft -= 1;
    renderStats();
    if (timeLeft <= 0) endRound();
  }, 1000);
}

function submitAnswer() {
  if (!running) return;
  const answer = Number(input.value.trim());
  if (!Number.isFinite(answer)) {
    result.textContent = "Enter a number first.";
    result.style.color = "#ff9cc9";
    return;
  }
  if (answer === currentAnswer) {
    score += 1;
    result.textContent = "Correct!";
    result.style.color = "#6ff6b3";
  } else {
    result.textContent = `Nope, answer was ${currentAnswer}.`;
    result.style.color = "#ff9cc9";
  }
  input.value = "";
  renderStats();
  nextQuestion();
  input.focus();
}

submitBtn.addEventListener("click", submitAnswer);
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") submitAnswer();
});
startBtn.addEventListener("click", startRound);

submitBtn.disabled = true;
input.disabled = true;
renderStats();
