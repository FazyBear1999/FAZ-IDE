/*
  Click Counter game logic (single-file JS template).
  Fun arcade theme edition:
  - Colorful animated background blobs
  - Bright glass card + candy button
  - Score pop animation every click
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
      radial-gradient(circle at 18% 18%, #ff4fd8 0%, rgba(255, 79, 216, 0.05) 38%),
      radial-gradient(circle at 82% 12%, #4fd5ff 0%, rgba(79, 213, 255, 0.06) 34%),
      radial-gradient(circle at 75% 85%, #ffd45a 0%, rgba(255, 212, 90, 0.05) 30%),
      linear-gradient(160deg, #12062a 0%, #0a1230 55%, #1d0c2f 100%);
  }
  .scene {
    position: relative;
    min-height: 100vh;
    display: grid;
    place-items: center;
    overflow: hidden;
    padding: 24px;
  }
  .blob {
    position: absolute;
    border-radius: 999px;
    filter: blur(4px);
    opacity: 0.55;
    animation: drift 12s ease-in-out infinite;
    pointer-events: none;
  }
  .blob-1 { width: 210px; height: 210px; left: -40px; top: 18%; background: #ff4fd8; }
  .blob-2 { width: 170px; height: 170px; right: 8%; top: -30px; background: #4fd5ff; animation-delay: -3s; }
  .blob-3 { width: 190px; height: 190px; right: -42px; bottom: -35px; background: #ffd45a; animation-delay: -6s; }
  .card {
    position: relative;
    width: min(360px, 92vw);
    text-align: center;
    border-radius: 20px;
    padding: 24px;
    border: 1px solid rgba(255, 255, 255, 0.28);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.06));
    backdrop-filter: blur(10px);
    box-shadow: 0 18px 38px rgba(6, 4, 16, 0.62);
    transform: translateY(0);
  }
  .card.beat { animation: beat 180ms ease-out; }
  .title {
    margin: 0 0 8px;
    font-size: 24px;
    font-weight: 900;
    letter-spacing: 0.3px;
    text-shadow: 0 4px 20px rgba(255, 79, 216, 0.45);
  }
  .hint {
    margin: 0 0 14px;
    font-size: 13px;
    color: #f7e6ff;
    opacity: 0.9;
  }
  .score-wrap {
    position: relative;
    margin: 0 auto 14px;
    width: fit-content;
  }
  .score-pill {
    min-width: 150px;
    padding: 10px 14px;
    border-radius: 999px;
    background: linear-gradient(90deg, rgba(255, 79, 216, 0.28), rgba(79, 213, 255, 0.28));
    border: 1px solid rgba(255, 255, 255, 0.28);
    font-weight: 800;
    font-size: 16px;
  }
  .pop {
    position: absolute;
    top: -10px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 14px;
    font-weight: 900;
    color: #ffd45a;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
    animation: popUp 480ms ease-out forwards;
    pointer-events: none;
  }
  .btn {
    border: 0;
    border-radius: 12px;
    padding: 10px 16px;
    color: #ffffff;
    font-weight: 900;
    letter-spacing: 0.2px;
    cursor: pointer;
    background: linear-gradient(120deg, #ff5fd6, #7f7dff 55%, #5fd4ff);
    box-shadow: 0 10px 20px rgba(93, 75, 199, 0.45);
    transition: transform 90ms ease, filter 120ms ease;
  }
  .btn:hover { filter: brightness(1.08); }
  .btn:active { transform: translateY(1px) scale(0.985); }

  @keyframes drift {
    0%, 100% { transform: translateY(0px) translateX(0px); }
    50% { transform: translateY(-14px) translateX(9px); }
  }
  @keyframes beat {
    0% { transform: scale(1); }
    50% { transform: scale(1.015); }
    100% { transform: scale(1); }
  }
  @keyframes popUp {
    0% { opacity: 0; transform: translateX(-50%) translateY(6px) scale(0.8); }
    22% { opacity: 1; }
    100% { opacity: 0; transform: translateX(-50%) translateY(-24px) scale(1); }
  }
`;
document.head.appendChild(style);

const scene = document.createElement("div");
scene.className = "scene";

for (const name of ["blob-1", "blob-2", "blob-3"]) {
  const blob = document.createElement("div");
  blob.className = `blob ${name}`;
  scene.appendChild(blob);
}

const card = document.createElement("section");
card.className = "card";

const title = document.createElement("h2");
title.className = "title";
title.textContent = "Click Counter";

const hint = document.createElement("p");
hint.className = "hint";
hint.textContent = "Click to score. Press R to reset.";

const scoreWrap = document.createElement("div");
scoreWrap.className = "score-wrap";

const scoreText = document.createElement("div");
scoreText.className = "score-pill";

const button = document.createElement("button");
button.className = "btn";
button.textContent = "Click me";

let score = 0;
function renderScore() {
  scoreText.textContent = `Score: ${score}`;
}

function pulseCard() {
  card.classList.remove("beat");
  void card.offsetWidth;
  card.classList.add("beat");
}

function popScore() {
  const pop = document.createElement("span");
  pop.className = "pop";
  pop.textContent = "+1";
  scoreWrap.appendChild(pop);
  setTimeout(() => pop.remove(), 520);
}

button.addEventListener("click", () => {
  score += 1;
  renderScore();
  popScore();
  pulseCard();
});

window.addEventListener("keydown", (event) => {
  if (String(event.key || "").toLowerCase() !== "r") return;
  score = 0;
  renderScore();
});

renderScore();
scoreWrap.appendChild(scoreText);
card.append(title, hint, scoreWrap, button);
scene.appendChild(card);
document.body.appendChild(scene);
