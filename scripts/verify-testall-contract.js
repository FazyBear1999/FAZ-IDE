const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const packageJsonPath = path.join(root, "package.json");

const failures = [];

function fail(message) {
  failures.push(message);
}

function loadPackageJson() {
  if (!fs.existsSync(packageJsonPath)) {
    fail("Missing package.json.");
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  } catch (error) {
    fail(`Invalid package.json JSON: ${error?.message || String(error)}`);
    return null;
  }
}

function assertHasScript(scripts, name) {
  if (!scripts || typeof scripts[name] !== "string" || !scripts[name].trim()) {
    fail(`Missing required script: ${name}`);
    return "";
  }
  return scripts[name];
}

function assertOrder(scriptValue, requiredSteps) {
  let cursor = 0;
  for (const step of requiredSteps) {
    const index = scriptValue.indexOf(step, cursor);
    if (index === -1) {
      fail(`test:all missing required step: ${step}`);
      continue;
    }
    cursor = index + step.length;
  }
}

function main() {
  const pkg = loadPackageJson();
  if (!pkg) return;

  const scripts = pkg.scripts || {};
  const testAll = assertHasScript(scripts, "test:all");

  const requiredScripts = [
    "test:all:contract",
    "sync:dist-site",
    "test:sync:dist-site",
    "test:memory",
    "test:frank:safety",
    "test:integrity",
    "test:css",
    "test",
    "test:privacy",
    "deploy:siteground",
    "verify:siteground",
  ];

  for (const scriptName of requiredScripts) {
    assertHasScript(scripts, scriptName);
  }

  const requiredSteps = [
    "npm run test:all:contract",
    "npm run sync:dist-site",
    "npm run test:sync:dist-site",
    "npm run test:memory",
    "npm run test:frank:safety",
    "npm run test:integrity",
    "npm run test:css",
    "npm run test",
    "npm run deploy:siteground",
    "npm run verify:siteground",
    "npm run test:privacy",
    "ALL GOOD FAZYBEAR",
  ];

  if (testAll) {
    assertOrder(testAll, requiredSteps);
  }

  if (failures.length) {
    console.error(`test:all contract verification failed (${failures.length} issue${failures.length === 1 ? "" : "s"}).`);
    for (const message of failures) {
      console.error(`- ${message}`);
    }
    process.exit(1);
  }

  console.log("test:all contract verification passed.");
  console.log(`- Verified script: test:all`);
  console.log(`- Required ordered steps: ${requiredSteps.length}`);
}

try {
  main();
} catch (error) {
  console.error(error?.message || String(error));
  process.exit(1);
}
