let runCount = 0;

function pushReport(type, text) {
  const report = document.getElementById("report");
  if (!report) return;
  const item = document.createElement("li");
  item.className = type;
  item.textContent = text;
  report.appendChild(item);
}

function logStep(marker, step, level, title, details) {
  const line = `${marker}:step-${String(step).padStart(2, "0")}:${title} -> ${details}`;
  if (level === "warn") {
    console.warn(line);
  } else if (level === "error") {
    console.error(line);
  } else if (level === "info") {
    console.info(line);
  } else {
    console.log(line);
  }
  pushReport(level === "warn" ? "warn" : level === "info" ? "info" : "pass", line);
}

function checkStep(marker, step, title, condition, passDetails, failDetails) {
  const ok = Boolean(condition);
  const line = `${marker}:step-${String(step).padStart(2, "0")}:${title} -> ${ok ? passDetails : failDetails}`;
  if (ok) {
    console.log(line);
    pushReport("pass", line);
  } else {
    console.error(line);
    pushReport("fail", line);
  }
  return ok;
}

async function runProbe() {
  runCount += 1;
  const marker = `runtime-js-check:${Date.now().toString(36)}:run-${runCount}`;
  const status = document.getElementById("status");
  const report = document.getElementById("report");
  if (report) report.innerHTML = "";

  if (status) {
    status.textContent = `Running JS test (${marker})...`;
  }

  logStep(marker, 1, "info", "start", "JS test started");
  logStep(marker, 2, "info", "env", `userAgent=${navigator.userAgent.slice(0, 48)}...`);
  logStep(marker, 3, "log", "console-log", "runtime-js-check:console-log");
  console.log("runtime-js-check:console-log");
  console.info("runtime-js-check:console-info");
  console.warn("runtime-js-check:console-warn");

  const perfNow = Number(performance.now().toFixed(3));
  logStep(marker, 4, "log", "performance", `performance.now=${perfNow}`);

  const computed = [1, 2, 3, 4, 5].map((n) => n * 3).reduce((a, b) => a + b, 0);
  checkStep(marker, 5, "compute", computed === 45, `sum(map*3)=${computed}`, `bad sum=${computed}`);

  const rootStyle = getComputedStyle(document.documentElement);
  const tokenBg = String(rootStyle.getPropertyValue("--rt-bg") || "").trim();
  const tokenPanel = String(rootStyle.getPropertyValue("--rt-panel") || "").trim();
  checkStep(
    marker,
    6,
    "tokens",
    Boolean(tokenBg) && Boolean(tokenPanel),
    `--rt-bg=${tokenBg || "n/a"} | --rt-panel=${tokenPanel || "n/a"}`,
    `missing theme token(s): --rt-bg=${tokenBg || "n/a"}, --rt-panel=${tokenPanel || "n/a"}`
  );

  await Promise.resolve();
  logStep(marker, 7, "log", "microtask", "Promise microtask executed");

  await new Promise((resolve) => setTimeout(resolve, 20));
  logStep(marker, 8, "log", "timer", "setTimeout(20ms) executed");

  const btn = document.getElementById("runProbe");
  if (btn) {
    btn.dataset.lastMarker = marker;
    checkStep(
      marker,
      9,
      "dom",
      btn.dataset.lastMarker === marker,
      `button.dataset.lastMarker=${btn.dataset.lastMarker}`,
      `button.dataset.lastMarker mismatch=${btn.dataset.lastMarker || "(empty)"}`
    );
  }

  const reportCount = Number(document.querySelectorAll("#report li").length || 0);
  logStep(marker, 10, "info", "report-count", `items=${reportCount}`);

  if (status) {
    status.textContent = `JS test complete (${marker}).`;
  }
  logStep(marker, 11, "log", "done", "JS path is good to go");
}

document.getElementById("runProbe")?.addEventListener("click", () => {
  void runProbe();
});
void runProbe();
