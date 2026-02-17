const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

test("css contract: component and layout layers avoid raw color literals", async () => {
  const targets = [
    "assets/css/components.css",
    "assets/css/layout.css",
  ];

  const rawColorPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\([^\)]*\)/g;
  const violations = [];

  for (const file of targets) {
    const src = read(file);
    const hits = src.match(rawColorPattern) || [];
    if (hits.length) {
      violations.push({ file, sample: hits.slice(0, 6) });
    }
  }

  expect(violations).toEqual([]);
});
