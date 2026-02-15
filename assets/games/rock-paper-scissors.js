/*
  Rock Paper Scissors (single-file JavaScript game)
  -------------------------------------------------
  How it works:
  - Pick rock, paper, or scissors.
  - Computer picks randomly each round.
  - Scoreboard tracks wins, losses, and draws.
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
      radial-gradient(circle at 12% 18%, #ff4fd8 0%, rgba(255, 79, 216, 0.06) 36%),
      radial-gradient(circle at 84% 15%, #4fd5ff 0%, rgba(79, 213, 255, 0.06) 34%),
      radial-gradient(circle at 74% 82%, #ffd45a 0%, rgba(255, 212, 90, 0.06) 28%),
      linear-gradient(160deg, #12062a 0%, #0a1230 55%, #1d0c2f 100%);
  }
  .scene {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
  }
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
  .choices {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 12px;
  }
  .btn {
    border: 0;
    border-radius: 12px;
    padding: 11px 10px;
    color: #ffffff;
    font-weight: 900;
    cursor: pointer;
    transition: transform 90ms ease, filter 120ms ease;
    background: linear-gradient(120deg, #ff5fd6, #7f7dff 55%, #5fd4ff);
    box-shadow: 0 10px 20px rgba(93, 75, 199, 0.45);
  }
  .btn:hover { filter: brightness(1.08); }
  .btn:active { transform: translateY(1px) scale(0.985); }
  .result {
    min-height: 24px;
    margin: 0 0 10px;
    font-size: 14px;
    font-weight: 800;
    color: #d8bcff;
  }
  .board {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 10px;
  }
  .tile {
    border-radius: 12px;
    padding: 10px;
    text-align: center;
    border: 1px solid rgba(255, 255, 255, 0.28);
    background: rgba(12, 8, 26, 0.42);
    font-weight: 900;
  }
  .reset {
    border: 0;
    border-radius: 10px;
    padding: 9px 12px;
    font-weight: 800;
    cursor: pointer;
    color: #3b2046;
    background: linear-gradient(120deg, #ffd45a, #ff8a5f);
    box-shadow: 0 10px 20px rgba(153, 97, 52, 0.35);
  }
`;
document.head.appendChild(style);

const scene = document.createElement("div");
scene.className = "scene";

const card = document.createElement("section");
card.className = "card";

const title = document.createElement("h2");
title.className = "title";
title.textContent = "Rock Paper Scissors";

const subtitle = document.createElement("p");
subtitle.className = "sub";
subtitle.textContent = "Pick your move and beat the computer.";

const choices = document.createElement("div");
choices.className = "choices";

const result = document.createElement("p");
result.className = "result";

const board = document.createElement("div");
board.className = "board";

const winTile = document.createElement("div");
winTile.className = "tile";

const lossTile = document.createElement("div");
lossTile.className = "tile";

const drawTile = document.createElement("div");
drawTile.className = "tile";

const resetBtn = document.createElement("button");
resetBtn.className = "reset";
resetBtn.type = "button";
resetBtn.textContent = "Reset Score";

board.append(winTile, lossTile, drawTile);
card.append(title, subtitle, choices, result, board, resetBtn);
scene.appendChild(card);
document.body.appendChild(scene);

const options = [
  { key: "rock", label: "Rock ✊" },
  { key: "paper", label: "Paper ✋" },
  { key: "scissors", label: "Scissors ✌️" },
];

const beats = {
  rock: "scissors",
  paper: "rock",
  scissors: "paper",
};

let wins = 0;
let losses = 0;
let draws = 0;

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function randomChoice() {
  return options[Math.floor(Math.random() * options.length)].key;
}

function renderBoard() {
  winTile.textContent = `Wins: ${wins}`;
  lossTile.textContent = `Losses: ${losses}`;
  drawTile.textContent = `Draws: ${draws}`;
}

function playRound(player) {
  const computer = randomChoice();
  if (player === computer) {
    draws += 1;
    result.textContent = `Draw. You both picked ${titleCase(player)}.`;
    result.style.color = "#ffd45a";
    renderBoard();
    return;
  }

  if (beats[player] === computer) {
    wins += 1;
    result.textContent = `You win! ${titleCase(player)} beats ${titleCase(computer)}.`;
    result.style.color = "#6ff6b3";
    renderBoard();
    return;
  }

  losses += 1;
  result.textContent = `You lose! ${titleCase(computer)} beats ${titleCase(player)}.`;
  result.style.color = "#ff9cc9";
  renderBoard();
}

for (const option of options) {
  const button = document.createElement("button");
  button.className = "btn";
  button.type = "button";
  button.textContent = option.label;
  button.addEventListener("click", () => playRound(option.key));
  choices.appendChild(button);
}

resetBtn.addEventListener("click", () => {
  wins = 0;
  losses = 0;
  draws = 0;
  result.textContent = "Score reset. Pick a move!";
  result.style.color = "#d8bcff";
  renderBoard();
});

result.textContent = "Pick a move to start.";
renderBoard();
