/*
  Reaction Timer game logic (single-file JS template).
  How it works:
  - Press "Start Round" to begin.
  - Wait for the box to turn purple, then click it as fast as possible.
  - If you click too early, the round resets.
*/

document.body.innerHTML = "";
document.body.style.margin = "0";
document.body.style.fontFamily = "system-ui, sans-serif";
document.body.style.background = "radial-gradient(circle at 22% 12%, #3b1f67 0%, #120a22 45%, #07040d 100%)";
document.body.style.color = "#f4ecff";

const wrap = document.createElement("div");
wrap.style.minHeight = "100vh";
wrap.style.display = "grid";
wrap.style.placeItems = "center";

const card = document.createElement("div");
card.style.padding = "22px";
card.style.borderRadius = "14px";
card.style.background = "linear-gradient(180deg, #201338 0%, #170f2a 100%)";
card.style.border = "1px solid #3c2a64";
card.style.boxShadow = "0 14px 30px rgba(5, 2, 12, 0.65)";
card.style.textAlign = "center";
card.style.minWidth = "280px";

const title = document.createElement("h2");
title.textContent = "Reaction Timer";
title.style.margin = "0 0 8px";
title.style.fontSize = "20px";
title.style.letterSpacing = "0.2px";

const info = document.createElement("p");
info.textContent = "Press start, wait for purple, then click the box.";
info.style.margin = "0 0 12px";
info.style.color = "#c8b9e8";
info.style.fontSize = "13px";

const status = document.createElement("p");
status.style.margin = "0 0 12px";
status.style.fontSize = "14px";
status.style.color = "#d8bcff";
status.style.fontWeight = "600";

const startBtn = document.createElement("button");
startBtn.textContent = "Start Round";
startBtn.style.padding = "9px 12px";
startBtn.style.border = "0";
startBtn.style.borderRadius = "8px";
startBtn.style.cursor = "pointer";
startBtn.style.fontWeight = "700";
startBtn.style.background = "#8b5cf6";
startBtn.style.color = "#ffffff";
startBtn.style.boxShadow = "0 8px 16px rgba(91, 46, 180, 0.45)";

const box = document.createElement("button");
box.textContent = "Wait...";
box.style.marginTop = "12px";
box.style.width = "100%";
box.style.height = "100px";
box.style.border = "0";
box.style.borderRadius = "10px";
box.style.cursor = "pointer";
box.style.fontWeight = "700";
box.style.background = "#362358";
box.style.color = "#f4ecff";
box.style.boxShadow = "inset 0 0 0 1px #4a2d7a";

let waitTimer = null;
let roundArmed = false;
let readyAt = 0;

function setIdleState() {
  roundArmed = false;
  readyAt = 0;
  box.textContent = "Wait...";
  box.style.background = "#362358";
  box.style.color = "#f4ecff";
  status.textContent = "Press Start Round.";
  status.style.color = "#d8bcff";
}

function armRound() {
  setIdleState();
  status.textContent = "Get ready...";
  status.style.color = "#c8b9e8";
  if (waitTimer) clearTimeout(waitTimer);

  // Random delay keeps each round unpredictable.
  const delayMs = 1200 + Math.floor(Math.random() * 2200);
  waitTimer = setTimeout(() => {
    roundArmed = true;
    readyAt = performance.now();
    box.textContent = "CLICK!";
    box.style.background = "#a855f7";
    box.style.color = "#ffffff";
    status.textContent = "Now!";
    status.style.color = "#c084fc";
  }, delayMs);
}

startBtn.addEventListener("click", armRound);

box.addEventListener("click", () => {
  if (!roundArmed) {
    if (waitTimer) clearTimeout(waitTimer);
    setIdleState();
    status.textContent = "Too early. Try again.";
    status.style.color = "#fb7185";
    return;
  }

  const reactionMs = Math.max(0, Math.round(performance.now() - readyAt));
  setIdleState();
  status.textContent = `Reaction: ${reactionMs} ms`;
  status.style.color = "#34d399";
});

setIdleState();
card.append(title, info, status, startBtn, box);
wrap.appendChild(card);
document.body.appendChild(wrap);
