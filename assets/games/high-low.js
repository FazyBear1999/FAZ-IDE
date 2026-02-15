/*
  High Low (single-file JavaScript game)
  --------------------------------------
  How it works:
  - You see a current card value (1 to 13).
  - Guess if the next card is higher or lower.
  - You have 3 lives. Wrong guess costs one life.
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
    width: min(430px, 95vw);
    border-radius: 20px;
    padding: 22px;
    border: 1px solid rgba(255, 255, 255, 0.28);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.06));
    backdrop-filter: blur(10px);
    box-shadow: 0 18px 38px rgba(6, 4, 16, 0.62);
    text-align: center;
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
  .value-card {
    margin: 0 auto 12px;
    width: 110px;
    height: 130px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.35);
    background: rgba(14, 8, 30, 0.56);
    display: grid;
    place-items: center;
    font-size: 44px;
    font-weight: 900;
    box-shadow: 0 10px 20px rgba(8, 6, 20, 0.42);
  }
  .row { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
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
    margin: 0 0 10px;
    font-size: 14px;
    font-weight: 800;
    color: #d8bcff;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .tile {
    border-radius: 12px;
    padding: 9px;
    border: 1px solid rgba(255, 255, 255, 0.28);
    background: rgba(12, 8, 26, 0.42);
    font-weight: 900;
    font-size: 13px;
  }
`;
document.head.appendChild(style);

const scene = document.createElement("div");
scene.className = "scene";
const card = document.createElement("section");
card.className = "card";

const title = document.createElement("h2");
title.className = "title";
title.textContent = "High Low";

const subtitle = document.createElement("p");
subtitle.className = "sub";
subtitle.textContent = "Will the next card be higher or lower?";

const valueCard = document.createElement("div");
valueCard.className = "value-card";

const row = document.createElement("div");
row.className = "row";

const higherBtn = document.createElement("button");
higherBtn.className = "btn";
higherBtn.textContent = "Higher";
higherBtn.type = "button";

const lowerBtn = document.createElement("button");
lowerBtn.className = "btn";
lowerBtn.textContent = "Lower";
lowerBtn.type = "button";

const resetBtn = document.createElement("button");
resetBtn.className = "btn alt";
resetBtn.textContent = "Reset";
resetBtn.type = "button";

const result = document.createElement("p");
result.className = "result";

const stats = document.createElement("div");
stats.className = "stats";
const scoreTile = document.createElement("div");
scoreTile.className = "tile";
const livesTile = document.createElement("div");
livesTile.className = "tile";

stats.append(scoreTile, livesTile);
row.append(higherBtn, lowerBtn, resetBtn);
card.append(title, subtitle, valueCard, row, result, stats);
scene.appendChild(card);
document.body.appendChild(scene);

let currentValue = 1;
let score = 0;
let lives = 3;
let gameOver = false;

function randomCard() {
  return Math.floor(Math.random() * 13) + 1;
}

function render() {
  valueCard.textContent = String(currentValue);
  scoreTile.textContent = `Score: ${score}`;
  livesTile.textContent = `Lives: ${lives}`;
}

function finishGame() {
  gameOver = true;
  result.textContent = `Game over. Final score: ${score}.`;
  result.style.color = "#ff9cc9";
}

function guess(direction) {
  if (gameOver) return;

  const nextValue = randomCard();
  const isHigher = nextValue > currentValue;
  const isLower = nextValue < currentValue;

  let correct = false;
  if (direction === "higher" && isHigher) correct = true;
  if (direction === "lower" && isLower) correct = true;

  if (nextValue === currentValue) {
    result.textContent = `Same value (${nextValue}). No points, no damage.`;
    result.style.color = "#ffd45a";
  } else if (correct) {
    score += 1;
    result.textContent = `Nice! ${nextValue} was ${direction}.`;
    result.style.color = "#6ff6b3";
  } else {
    lives -= 1;
    result.textContent = `Wrong. It was ${nextValue}.`;
    result.style.color = "#ff9cc9";
  }

  currentValue = nextValue;
  render();

  if (lives <= 0) finishGame();
}

higherBtn.addEventListener("click", () => guess("higher"));
lowerBtn.addEventListener("click", () => guess("lower"));
resetBtn.addEventListener("click", () => {
  currentValue = randomCard();
  score = 0;
  lives = 3;
  gameOver = false;
  result.textContent = "New round. Guess higher or lower.";
  result.style.color = "#d8bcff";
  render();
});

currentValue = randomCard();
result.textContent = "Guess higher or lower.";
render();
