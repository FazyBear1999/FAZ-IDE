const fs = require("node:fs");
const path = require("node:path");
const acorn = require("acorn");

const root = process.cwd();
const testsDir = path.join(root, "tests");

const failures = [];

const bannedCallChains = new Map([
  ["test.only", "focused test (.only)"],
  ["it.only", "focused test (.only)"],
  ["describe.only", "focused suite (.only)"],
  ["test.skip", "skipped test (.skip)"],
  ["it.skip", "skipped test (.skip)"],
  ["describe.skip", "skipped suite (.skip)"],
  ["test.fixme", "fixme test (.fixme)"],
  ["it.fixme", "fixme test (.fixme)"],
]);

const testCaseCallChains = new Set([
  "test",
  "it",
  "test.only",
  "it.only",
  "test.skip",
  "it.skip",
  "test.fixme",
  "it.fixme",
  "test.fail",
  "it.fail",
  "test.slow",
  "it.slow",
]);

const placeholderTitlePattern = /\b(?:todo|wip|placeholder|temp)\b/i;

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

function toLocation(node) {
  const line = Number(node?.loc?.start?.line || 0);
  return line > 0 ? `line ${line}` : "unknown line";
}

function parseSpecAst(relPath, content) {
  try {
    return acorn.parse(content, {
      ecmaVersion: "latest",
      sourceType: "script",
      locations: true,
      allowHashBang: true,
    });
  } catch (error) {
    fail(`${relPath}: invalid JavaScript (${error.message || String(error)})`);
    return null;
  }
}

function walkNode(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const value of Object.values(node)) {
    if (!value) continue;
    if (Array.isArray(value)) {
      value.forEach((entry) => walkNode(entry, visit));
      continue;
    }
    if (value && typeof value === "object" && typeof value.type === "string") {
      walkNode(value, visit);
    }
  }
}

function getMemberName(node) {
  if (!node || node.type !== "MemberExpression") return "";
  if (!node.computed && node.property?.type === "Identifier") {
    return node.property.name;
  }
  if (node.computed && node.property?.type === "Literal") {
    return String(node.property.value || "");
  }
  return "";
}

function getCallChain(node) {
  if (!node) return "";
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression") {
    const objectChain = getCallChain(node.object);
    const propName = getMemberName(node);
    if (!objectChain || !propName) return "";
    return `${objectChain}.${propName}`;
  }
  return "";
}

function isExpectationCall(node) {
  if (!node || node.type !== "CallExpression") return false;
  const callee = node.callee;
  if (!callee) return false;
  if (callee.type === "Identifier" && callee.name === "expect") return true;
  if (callee.type === "MemberExpression") {
    const chain = getCallChain(callee);
    if (chain === "expect" || chain.startsWith("expect.")) return true;
  }
  return false;
}

function isPrimitiveLiteralNode(node) {
  if (!node) return false;
  if (node.type === "Identifier") {
    return node.name === "undefined";
  }
  if (node.type !== "Literal") return false;
  return node.value === null || typeof node.value === "boolean" || typeof node.value === "string" || typeof node.value === "number";
}

function getPrimitiveValue(node) {
  if (!node) return undefined;
  if (node.type === "Identifier" && node.name === "undefined") return undefined;
  if (node.type === "Literal") return node.value;
  return Symbol("not-primitive");
}

function isTrivialSelfEquality(node) {
  if (!node || node.type !== "CallExpression") return false;
  if (!node.callee || node.callee.type !== "MemberExpression") return false;
  const matcher = getMemberName(node.callee);
  if (matcher !== "toBe" && matcher !== "toEqual") return false;
  if (!node.arguments || node.arguments.length !== 1) return false;
  const subjectCall = node.callee.object;
  if (!subjectCall || subjectCall.type !== "CallExpression") return false;
  if (!subjectCall.callee || subjectCall.callee.type !== "Identifier" || subjectCall.callee.name !== "expect") return false;
  if (!subjectCall.arguments || subjectCall.arguments.length !== 1) return false;
  const left = subjectCall.arguments[0];
  const right = node.arguments[0];
  if (!isPrimitiveLiteralNode(left) || !isPrimitiveLiteralNode(right)) return false;
  return Object.is(getPrimitiveValue(left), getPrimitiveValue(right));
}

function getTestTitle(args = []) {
  const first = args[0];
  if (first?.type === "Literal") return String(first.value || "");
  if (first?.type === "TemplateLiteral" && first.expressions.length === 0) {
    return String(first.quasis?.[0]?.value?.cooked || "");
  }
  return "";
}

function isTestCaseCall(node) {
  if (!node || node.type !== "CallExpression") return false;
  const chain = getCallChain(node.callee);
  return testCaseCallChains.has(chain);
}

function getTestCallback(node) {
  if (!node?.arguments?.length) return null;
  const candidates = [node.arguments[1], node.arguments[0], node.arguments[2]];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate.type === "FunctionExpression" || candidate.type === "ArrowFunctionExpression") {
      return candidate;
    }
  }
  return null;
}

function verifySpecAst(relPath, ast) {
  if (!ast) return;

  walkNode(ast, (node) => {
    if (node.type !== "CallExpression") return;

    const chain = getCallChain(node.callee);
    if (chain && bannedCallChains.has(chain)) {
      fail(`${relPath}: contains ${bannedCallChains.get(chain)} (${toLocation(node)})`);
    }

    if (chain.endsWith("waitForTimeout") || chain === "waitForTimeout") {
      fail(`${relPath}: contains timing wait (waitForTimeout) (${toLocation(node)})`);
    }

    if (isTrivialSelfEquality(node)) {
      fail(`${relPath}: contains trivial self-equality assertion (${toLocation(node)})`);
    }

    if (!isTestCaseCall(node)) return;

    const callback = getTestCallback(node);
    if (!callback) {
      return;
    }

    const title = getTestTitle(node.arguments) || "(dynamic title)";
    if (placeholderTitlePattern.test(title)) {
      fail(`${relPath}: test title looks incomplete ("${title}") (${toLocation(node)})`);
    }

    let assertionCount = 0;
    let awaitCount = 0;
    walkNode(callback.body, (child) => {
      if (isExpectationCall(child)) assertionCount += 1;
      if (child?.type === "AwaitExpression") awaitCount += 1;
    });

    if (assertionCount === 0) {
      fail(`${relPath}: test "${title}" has no assertion (${toLocation(node)})`);
    }

    if (callback.async && awaitCount === 0) {
      fail(`${relPath}: async test "${title}" has no await (${toLocation(node)})`);
    }
  });
}

function verifySpecFile(file) {
  const relPath = toRel(file);
  const content = fs.readFileSync(file, "utf8");
  const ast = parseSpecAst(relPath, content);
  verifySpecAst(relPath, ast);
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
    verifySpecFile(file);
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
  console.log("- Hard-fail checks: focused/skip/fixme calls, waitForTimeout calls, trivial assertions, missing assertions, placeholder test titles, async tests without await");
}

try {
  main();
} catch (error) {
  console.error(error?.message || String(error));
  process.exit(1);
}
