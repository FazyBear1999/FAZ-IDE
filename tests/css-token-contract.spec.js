const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

test("css contract: component and layout layers avoid raw color literals", () => {
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

test("css contract: base token layer defines required micro primitives", () => {
  const src = read("assets/css/base.css");
  const requiredVars = [
    "--stroke-1-5",
    "--ring-size-sm",
    "--ring-size-md",
    "--letter-spacing-subtle",
    "--letter-spacing-soft",
    "--letter-spacing-soft-plus",
    "--letter-spacing-meta",
    "--letter-spacing-badge",
    "--letter-spacing-caption",
    "--letter-spacing-section",
  ];

  for (const variableName of requiredVars) {
    expect(src).toContain(`${variableName}:`);
  }
});

test("css contract: components avoid nuanced legacy letter-spacing literals", () => {
  const src = read("assets/css/components.css");
  const legacyNuancedPattern = /letter-spacing:\s*0\.(08|14|16|22|24|28|38)px\s*;/g;
  const matches = src.match(legacyNuancedPattern) || [];
  expect(matches).toEqual([]);
});
