/*
  Number Guess game (single-file JavaScript game).
  Fun arcade theme edition:
  - Colorful neon background + glass panel
  - Bright action buttons
  - High/low feedback with playful colors
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
      radial-gradient(circle at 83% 12%, #4fd5ff 0%, rgba(79, 213, 255, 0.06) 34%),
      radial-gradient(circle at 74% 84%, #ffd45a 0%, rgba(255, 212, 90, 0.06) 30%),
      linear-gradient(160deg, #12062a 0%, #0a1230 55%, #1d0c2f 100%);
  }
  .scene {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
  }
  .card {
    width: min(430px, 94vw);
    border-radius: 20px;
    padding: 24px;
    border: 1px solid rgba(255, 255, 255, 0.28);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.06));
    backdrop-filter: blur(10px);
    box-shadow: 0 18px 38px rgba(6, 4, 16, 0.62);
  }
  .title {
    margin: 0 0 8px;
    font-size: 25px;
    font-weight: 900;
    letter-spacing: 0.3px;
    text-shadow: 0 4px 20px rgba(255, 79, 216, 0.45);
  }
  .subtitle {
    margin: 0 0 14px;
    font-size: 14px;
    color: #f7e6ff;
    opacity: 0.92;
  }
  .controls {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }
  .guess-input {
    flex: 1;
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 10px;
    background: rgba(20, 12, 39, 0.72);
    color: #ffffff;
    padding: 10px;
    font-size: 14px;
    outline: none;
  }
  .guess-input::placeholder { color: #d7c8ef; }
  .guess-input:focus {
    border-color: #8bd3ff;
    box-shadow: 0 0 0 3px rgba(79, 213, 255, 0.18);
  }
  .btn {
    border: 0;
    border-radius: 10px;
    padding: 10px 14px;
    color: #ffffff;
    font-weight: 900;
    cursor: pointer;
    transition: transform 90ms ease, filter 120ms ease;
  }
  .btn:hover { filter: brightness(1.08); }
  .btn:active { transform: translateY(1px) scale(0.985); }
  .btn-guess {
    background: linear-gradient(120deg, #ff5fd6, #7f7dff 55%, #5fd4ff);
    box-shadow: 0 10px 20px rgba(93, 75, 199, 0.45);
  }
  .btn-reset {
    background: linear-gradient(120deg, #ffd45a, #ff8a5f);
    color: #3b2046;
    box-shadow: 0 10px 20px rgba(153, 97, 52, 0.35);
  }
  .status {
    min-height: 22px;
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 800;
    color: #d8bcff;
  }
  .attempts {
    margin: 0;
    font-size: 13px;
    color: #f7e6ff;
    opacity: 0.9;
  }
`;
document.head.appendChild(style);

const scene = document.createElement("div");
scene.className = "scene";

const card = document.createElement("section");
card.className = "card";

const title = document.createElement("h2");
title.className = "title";
title.textContent = "Number Guess";

const subtitle = document.createElement("p");
subtitle.className = "subtitle";
subtitle.textContent = "Guess the secret number from 1 to 100.";

const controls = document.createElement("div");
controls.className = "controls";

const input = document.createElement("input");
input.className = "guess-input";
input.type = "number";
input.min = "1";
input.max = "100";
input.placeholder = "Enter guess";

const guessBtn = document.createElement("button");
guessBtn.className = "btn btn-guess";
guessBtn.textContent = "Guess";

const resetBtn = document.createElement("button");
resetBtn.className = "btn btn-reset";
resetBtn.textContent = "New Game";

const status = document.createElement("p");
status.className = "status";

const attemptsText = document.createElement("p");
attemptsText.className = "attempts";

controls.append(input, guessBtn, resetBtn);
card.append(title, subtitle, controls, status, attemptsText);
scene.appendChild(card);
document.body.appendChild(scene);

let secretNumber = 0;
let attempts = 0;
let gameFinished = false;

function randomInt1to100() {
  return Math.floor(Math.random() * 100) + 1;
}

function setStatus(message, color = "#d8bcff") {
  status.textContent = message;
  status.style.color = color;
}

function renderAttempts() {
  attemptsText.textContent = `Attempts: ${attempts}`;
}

function lockInput(locked) {
  input.disabled = locked;
  guessBtn.disabled = locked;
}

function resetGame() {
  secretNumber = randomInt1to100();
  attempts = 0;
  gameFinished = false;
  input.value = "";
  lockInput(false);
  setStatus("Make your first guess.");
  renderAttempts();
  input.focus();
}

function readGuess() {
  const value = Number(input.value.trim());
  if (!Number.isInteger(value)) return null;
  if (value < 1 || value > 100) return null;
  return value;
}

function submitGuess() {
  if (gameFinished) return;

  const guess = readGuess();
  if (guess === null) {
    setStatus("Enter a whole number from 1 to 100.", "#ffd45a");
    return;
  }

  attempts += 1;
  renderAttempts();

  if (guess < secretNumber) {
    setStatus("Too low. Try higher.", "#9be7ff");
    return;
  }

  if (guess > secretNumber) {
    setStatus("Too high. Try lower.", "#9be7ff");
    return;
  }

  gameFinished = true;
  lockInput(true);
  setStatus(`Correct! The number was ${secretNumber}.`, "#6ff6b3");
}

guessBtn.addEventListener("click", submitGuess);
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") submitGuess();
});
resetBtn.addEventListener("click", resetGame);

resetGame();
