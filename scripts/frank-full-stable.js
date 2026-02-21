const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = process.cwd();

function main() {
  const childEnv = {
    ...process.env,
    PLAYWRIGHT_RETRIES: String(process.env.PLAYWRIGHT_RETRIES || "1"),
  };

  const scriptPath = path.join(root, "scripts", "franklin.js");
  const result = spawnSync(process.execPath, [scriptPath, "full"], {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env: childEnv,
  });

  if (result.error) {
    console.error(result.error.message || String(result.error));
    process.exit(1);
  }

  process.exit(typeof result.status === "number" ? result.status : 1);
}

main();
