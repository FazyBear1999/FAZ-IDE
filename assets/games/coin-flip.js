/*
  Coin Flip Guess (single-file JavaScript game)
  ---------------------------------------------
  How it works:
  - Pick Heads or Tails.
  - The game flips a random coin.
  - Correct guesses increase wins and streak.
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
  .coin {
    margin: 0 auto 12px;
    width: 92px;
    height: 92px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 36px;
    font-weight: 900;
    color: #472f56;
    background: radial-gradient(circle at 30% 30%, #fff7b4 0%, #ffd45a 50%, #f1a30d 100%);
    box-shadow: 0 10px 24px rgba(113, 76, 14, 0.4);
  }
  .row { display: flex; gap: 10px; justify-content: center; margin-bottom: 10px; flex-wrap: wrap; }
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
    grid-template-columns: repeat(3, minmax(0, 1fr));
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
title.textContent = "Coin Flip Guess";

const subtitle = document.createElement("p");
subtitle.className = "sub";
subtitle.textContent = "Heads or tails? Test your luck.";

const coin = document.createElement("div");
coin.className = "coin";
coin.textContent = "?";

const buttonRow = document.createElement("div");
buttonRow.className = "row";

const headsBtn = document.createElement("button");
headsBtn.className = "btn";
headsBtn.type = "button";
headsBtn.textContent = "Heads";

const tailsBtn = document.createElement("button");
tailsBtn.className = "btn";
tailsBtn.type = "button";
tailsBtn.textContent = "Tails";

const resetBtn = document.createElement("button");
resetBtn.className = "btn alt";
resetBtn.type = "button";
resetBtn.textContent = "Reset";

const result = document.createElement("p");
result.className = "result";

const stats = document.createElement("div");
stats.className = "stats";

const winsTile = document.createElement("div");
winsTile.className = "tile";
const lossesTile = document.createElement("div");
lossesTile.className = "tile";
const streakTile = document.createElement("div");
streakTile.className = "tile";

stats.append(winsTile, lossesTile, streakTile);
buttonRow.append(headsBtn, tailsBtn, resetBtn);
card.append(title, subtitle, coin, buttonRow, result, stats);
scene.appendChild(card);
document.body.appendChild(scene);

let wins = 0;
let losses = 0;
let streak = 0;

function renderStats() {
  winsTile.textContent = `Wins: ${wins}`;
  lossesTile.textContent = `Losses: ${losses}`;
  streakTile.textContent = `Streak: ${streak}`;
}

function playRound(playerPick) {
  const coinFlip = Math.random() < 0.5 ? "Heads" : "Tails";
  coin.textContent = coinFlip === "Heads" ? "H" : "T";
  if (playerPick === coinFlip) {
    wins += 1;
    streak += 1;
    result.textContent = `Nice! It landed ${coinFlip}.`;
    result.style.color = "#6ff6b3";
  } else {
    losses += 1;
    streak = 0;
    result.textContent = `Nope. It landed ${coinFlip}.`;
    result.style.color = "#ff9cc9";
  }
  renderStats();
}

headsBtn.addEventListener("click", () => playRound("Heads"));
tailsBtn.addEventListener("click", () => playRound("Tails"));
resetBtn.addEventListener("click", () => {
  wins = 0;
  losses = 0;
  streak = 0;
  coin.textContent = "?";
  result.textContent = "Score reset. Pick a side!";
  result.style.color = "#d8bcff";
  renderStats();
});

result.textContent = "Pick Heads or Tails.";
renderStats();
