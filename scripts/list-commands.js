const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const packageJsonPath = path.join(root, "package.json");

function loadScripts() {
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error("Missing package.json.");
  }

  const raw = fs.readFileSync(packageJsonPath, "utf8");
  const pkg = JSON.parse(raw);
  const scripts = pkg?.scripts;
  if (!scripts || typeof scripts !== "object") {
    throw new Error("No scripts found in package.json.");
  }
  return scripts;
}

function titleCase(value) {
  return String(value || "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function groupScripts(scripts) {
  const groups = new Map();
  const names = Object.keys(scripts).sort((a, b) => a.localeCompare(b));

  for (const name of names) {
    const key = name.includes(":") ? name.split(":")[0] : "core";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(name);
  }

  const orderedGroupKeys = [...groups.keys()].sort((a, b) => {
    if (a === "core") return -1;
    if (b === "core") return 1;
    return a.localeCompare(b);
  });

  return orderedGroupKeys.map((key) => ({ key, names: groups.get(key) || [] }));
}

function main() {
  const scripts = loadScripts();
  const names = Object.keys(scripts);

  if (!names.length) {
    console.log("No npm scripts found.");
    return;
  }

  const grouped = groupScripts(scripts);
  console.log(`FAZ IDE npm scripts (${names.length} total)`);
  console.log("Run any command with: npm run <script>");
  console.log("");

  for (const group of grouped) {
    const heading = group.key === "core" ? "Core" : titleCase(group.key);
    console.log(`[${heading}]`);
    for (const name of group.names) {
      const command = String(scripts[name] || "");
      console.log(`- ${name} -> ${command}`);
    }
    console.log("");
  }
}

try {
  main();
} catch (error) {
  console.error(error?.message || String(error));
  process.exit(1);
}
