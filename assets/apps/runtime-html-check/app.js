const marker = `runtime-html-check:${Date.now().toString(36)}`;

function addReport(type, message) {
  const host = document.getElementById("report");
  if (!host) return;
  const item = document.createElement("li");
  item.className = type;
  item.textContent = message;
  host.appendChild(item);
}

function checkStep(step, title, condition, passDetails, failDetails) {
  const ok = Boolean(condition);
  const line = `${marker}:step-${String(step).padStart(2, "0")}:${title} -> ${ok ? passDetails : failDetails}`;
  if (ok) {
    console.log(line);
    addReport("pass", line);
  } else {
    console.error(line);
    addReport("fail", line);
  }
  return ok;
}

function runHtmlDiagnostics() {
  const status = document.getElementById("status");
  if (status) {
    status.textContent = `Running HTML test (${marker})`;
  }

  addReport("info", `${marker}:step-01:start HTML test`);
  console.log(`${marker}:linked-js-console`);

  const panel = document.querySelector(".panel");
  const panelStyle = panel ? getComputedStyle(panel) : null;
  const borderColor = panelStyle ? String(panelStyle.borderTopColor || "") : "";
  const bgColor = panelStyle ? String(panelStyle.backgroundColor || "") : "";
  const rootStyle = getComputedStyle(document.documentElement);
  const tokenBg = String(rootStyle.getPropertyValue("--rt-bg") || "").trim();
  const tokenAccent = String(rootStyle.getPropertyValue("--rt-accent") || "").trim();

  checkStep(2, "css-border", Boolean(borderColor), `borderColor=${borderColor}`, "missing borderColor");
  checkStep(3, "css-background", Boolean(bgColor), `backgroundColor=${bgColor}`, "missing backgroundColor");
  console.info(`${marker}:css:border=${borderColor}`);
  console.info(`${marker}:css:bg=${bgColor}`);
  addReport("info", `${marker}:step-04:tokens bg=${tokenBg || "n/a"} accent=${tokenAccent || "n/a"}`);
  console.info(`${marker}:tokens:bg=${tokenBg || "n/a"}`);
  console.info(`${marker}:tokens:accent=${tokenAccent || "n/a"}`);

  const now = new Date().toISOString();
  checkStep(5, "time-check", Boolean(now), `iso=${now}`, "missing ISO time");
  console.log(`${marker}:clock:${now}`);

  const sandboxReady = Boolean(document.body && document.querySelector(".panel"));
  checkStep(6, "sandbox-ready", sandboxReady, "sandbox ready=true", "sandbox ready=false");
  console.log(`${marker}:sandbox-dom-ready:${sandboxReady}`);

  const reportCount = Number(document.querySelectorAll("#report li").length || 0);
  addReport("info", `${marker}:step-07:report items=${reportCount}`);
  console.info(`${marker}:report-items:${reportCount}`);

  if (status) {
    status.textContent = `HTML test complete (${marker})`;
  }
  addReport("pass", `${marker}:step-08:done HTML path is good to go`);
}

runHtmlDiagnostics();
