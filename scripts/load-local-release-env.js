const fs = require("node:fs");
const path = require("node:path");

const candidateFiles = [
  ".env.release.local",
  ".env.local",
  ".env",
];

function parseEnvContent(content = "") {
  const parsed = new Map();
  const lines = String(content || "").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();
    if (!line || line.startsWith("#")) continue;

    const normalized = line.startsWith("export ")
      ? line.slice("export ".length).trim()
      : line;
    const equalsIndex = normalized.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = normalized.slice(0, equalsIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = normalized.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    parsed.set(key, value);
  }

  return parsed;
}

function loadLocalReleaseEnv({ rootDir = process.cwd(), silent = true } = {}) {
  const normalizedRoot = path.resolve(rootDir);
  for (const fileName of candidateFiles) {
    const filePath = path.join(normalizedRoot, fileName);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;

    const content = fs.readFileSync(filePath, "utf8");
    const parsed = parseEnvContent(content);

    let loadedCount = 0;
    for (const [key, value] of parsed.entries()) {
      if (String(process.env[key] || "").trim()) continue;
      process.env[key] = String(value || "");
      loadedCount += 1;
    }

    if (!silent) {
      const relativePath = path.relative(normalizedRoot, filePath).replace(/\\/g, "/") || fileName;
      console.log(`Loaded ${loadedCount} env value(s) from ${relativePath}.`);
    }

    return {
      loaded: true,
      filePath,
      loadedCount,
    };
  }

  return {
    loaded: false,
    filePath: "",
    loadedCount: 0,
  };
}

module.exports = {
  loadLocalReleaseEnv,
};