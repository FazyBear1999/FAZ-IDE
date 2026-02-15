const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const testsDir = path.join(root, "tests");

const failures = [];

const hardBanPatterns = [
  { regex: /\b(?:test|it|describe)\.only\s*\(/, label: "focused test (.only)" },
  { regex: /\b(?:test|it|describe)\.skip\s*\(/, label: "skipped test (.skip)" },
  { regex: /\b(?:test|it)\.fixme\s*\(/, label: "fixme test (.fixme)" },
  { regex: /\bwaitForTimeout\s*\(/, label: "timing wait (waitForTimeout)" },
];

function fail(message) {
  failures.push(message);
}

function walk(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const abs = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(abs));
    } else if (entry.isFile() && entry.name.endsWith(".spec.js")) {
      files.push(abs);
    }
  }
  return files;
}

function toRel(absPath) {
  return path.relative(root, absPath).split(path.sep).join("/");
}

function verifyNoBannedPatterns(relPath, content) {
  for (const { regex, label } of hardBanPatterns) {
    if (regex.test(content)) {
      fail(`${relPath}: contains ${label}`);
    }
  }
}

function verifyNoTrivialAssertions(relPath, content) {
  const trivial = /expect\(\s*(true|false|null|undefined)\s*\)\s*\.\s*to(Be|Equal)\s*\(\s*\1\s*\)/g;
  let match = trivial.exec(content);
  while (match) {
    fail(`${relPath}: contains trivial self-equality assertion at index ${match.index}`);
    match = trivial.exec(content);
  }
}

function verifyEachTestHasAssertion(relPath, content) {
  const lines = content.split(/\r?\n/);
  const testStarts = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*test\s*\(/.test(lines[i])) {
      testStarts.push(i);
    }
  }

  for (let i = 0; i < testStarts.length; i += 1) {
    const start = testStarts[i];
    const end = i + 1 < testStarts.length ? testStarts[i + 1] : lines.length;
    const block = lines.slice(start, end).join("\n");

    const titleMatch = lines[start].match(/^\s*test\s*\(\s*(["'`])(.+?)\1/);
    const title = titleMatch?.[2] || `line ${start + 1}`;

    if (!/\bexpect\s*\(/.test(block) && !/\bexpect\s*\./.test(block)) {
      fail(`${relPath}: test "${title}" has no assertion`);
    }
  }
}

function main() {
  if (!fs.existsSync(testsDir) || !fs.statSync(testsDir).isDirectory()) {
    fail("Missing tests directory.");
  }

  const specFiles = fs.existsSync(testsDir) ? walk(testsDir) : [];
  if (!specFiles.length) {
    fail("No .spec.js files found in tests/.");
  }

  for (const file of specFiles) {
    const relPath = toRel(file);
    const content = fs.readFileSync(file, "utf8");
    verifyNoBannedPatterns(relPath, content);
    verifyNoTrivialAssertions(relPath, content);
    verifyEachTestHasAssertion(relPath, content);
  }

  if (failures.length) {
    console.error(`Test integrity verification failed (${failures.length} issue${failures.length === 1 ? "" : "s"}).`);
    for (const message of failures) {
      console.error(`- ${message}`);
    }
    process.exit(1);
  }

  console.log("Test integrity verification passed.");
  console.log(`- Spec files scanned: ${specFiles.length}`);
  console.log(`- Hard-fail checks: focused/skip/fixme, waitForTimeout, trivial assertions, missing assertions`);
}

try {
  main();
} catch (error) {
  console.error(error?.message || String(error));
  process.exit(1);
}
