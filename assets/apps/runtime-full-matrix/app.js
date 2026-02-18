const marker = `runtime-full-matrix:${Date.now().toString(36)}`;

function report(kind, text) {
  const host = document.getElementById("report");
  if (!host) return;
  const item = document.createElement("li");
  item.className = kind;
  item.textContent = text;
  host.appendChild(item);
}

function setMatrixConfirm(state, title, note = "") {
  const host = document.getElementById("matrixConfirm");
  if (!host) return;
  host.setAttribute("data-state", String(state || "pending"));
  const titleNode = host.querySelector(".matrix-confirm-title");
  const noteNode = host.querySelector(".matrix-confirm-note");
  if (titleNode) {
    titleNode.innerHTML = `${title}`;
  }
  if (noteNode) {
    noteNode.textContent = String(note || "");
  }
}

function checkStep(step, title, condition, passDetails, failDetails) {
  const ok = Boolean(condition);
  const line = `${marker}:step-${String(step).padStart(2, "0")}:${title} -> ${ok ? passDetails : failDetails}`;
  if (ok) {
    console.log(line);
    report("pass", line);
  } else {
    console.error(line);
    report("fail", line);
  }
  return ok;
}

async function runMatrix() {
  const status = document.getElementById("status");
  if (status) {
    status.textContent = `Running full matrix test (${marker})...`;
  }
  setMatrixConfirm(
    "pending",
    `<img class="lang-icon" src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/23f3.svg" alt="" aria-hidden="true" /> Matrix status: Running checks...`,
    "Testing HTML/JS channel now. CSS check runs in its own file."
  );

  let allPassed = true;
  report("info", `${marker}:step-01:start full matrix test`);
  console.log(`${marker}:html-js:start`);

  const env = `${navigator.platform} / ${navigator.language}`;
  report("pass", `${marker}:step-02:env ${env}`);
  console.info(`${marker}:env:${env}`);

  const panel = document.querySelector(".panel");
  const panelBg = panel ? String(getComputedStyle(panel).backgroundColor || "") : "";
  const panelBorder = panel ? String(getComputedStyle(panel).borderTopColor || "") : "";
  allPassed = checkStep(3, "panel-background", Boolean(panelBg), `panel background ${panelBg}`, "missing panel background") && allPassed;
  allPassed = checkStep(4, "panel-border", Boolean(panelBorder), `panel border ${panelBorder}`, "missing panel border") && allPassed;
  console.log(`${marker}:panel-bg:${panelBg}`);
  console.log(`${marker}:panel-border:${panelBorder}`);

  const rootStyle = getComputedStyle(document.documentElement);
  const tokenBg = String(rootStyle.getPropertyValue("--rt-bg") || "").trim();
  const tokenAccent = String(rootStyle.getPropertyValue("--rt-accent") || "").trim();
  allPassed = checkStep(
    5,
    "tokens",
    Boolean(tokenBg) && Boolean(tokenAccent),
    `tokens bg=${tokenBg || "n/a"} accent=${tokenAccent || "n/a"}`,
    `missing token(s): bg=${tokenBg || "n/a"} accent=${tokenAccent || "n/a"}`
  ) && allPassed;
  console.info(`${marker}:tokens:bg=${tokenBg || "n/a"}`);
  console.info(`${marker}:tokens:accent=${tokenAccent || "n/a"}`);

  await Promise.resolve();
  allPassed = checkStep(6, "microtask", true, "microtask ok", "microtask failed") && allPassed;
  console.log(`${marker}:microtask:ok`);

  await new Promise((resolve) => setTimeout(resolve, 20));
  allPassed = checkStep(7, "timer", true, "timer ok", "timer failed") && allPassed;
  console.log(`${marker}:timer:ok`);

  const reportCount = Number(document.querySelectorAll("#report li").length || 0);
  report("info", `${marker}:step-08:report items=${reportCount}`);
  console.info(`${marker}:report-items:${reportCount}`);

  if (allPassed) {
    report("pass", `${marker}:step-09:done matrix html/js path is good`);
    report("pass", `${marker}:step-10:all-systems-go core matrix channel passed`);
    setMatrixConfirm(
      "pass",
      `<img class="lang-icon" src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/2705.svg" alt="" aria-hidden="true" /> Matrix status: CORE CHECKS PASSED`,
      "HTML/JS channel is confirmed. Run matrix.css to complete CSS confirmation."
    );
  } else {
    report("fail", `${marker}:step-09:done matrix html/js path has failures`);
    setMatrixConfirm(
      "fail",
      `<img class="lang-icon" src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/274c.svg" alt="" aria-hidden="true" /> Matrix status: CHECK FAILED`,
      "At least one core check failed. Review red X lines above and re-run."
    );
  }
  console.log(`${marker}:html-js:done`);
  if (status) {
    status.textContent = `Matrix HTML/JS complete (${marker}). Next run matrix.css.`;
  }
}

void runMatrix();
