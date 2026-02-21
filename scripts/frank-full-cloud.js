const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { loadLocalReleaseEnv } = require("./load-local-release-env");

const root = process.cwd();
loadLocalReleaseEnv({ rootDir: root, silent: true });
const requiredVars = ["SUPABASE_URL", "SUPABASE_ANON_KEY"];

function readEnv(name) {
  return String(process.env[name] || "").trim();
}

function main() {
  const missing = requiredVars.filter((name) => !readEnv(name));
  if (missing.length) {
    console.error(
      `Cloud full gate requires ${missing.join(", ")} in environment. Set values first, then rerun.`
    );
    process.exit(1);
  }

  const childEnv = {
    ...process.env,
    REQUIRE_CLOUD_AUTH: "1",
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
