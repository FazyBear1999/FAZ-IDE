const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const memoryDir = path.join(root, "docs", "ai-memory");

const requiredFiles = [
  "README.md",
  "project-context.md",
  "feature-map.md",
  "decisions.md",
  "known-issues.md",
  "common-mistakes.md",
  "error-catalog.md",
  "franklin-fix-request.md",
  "recovery-playbook.md",
  "test-gaps.md",
  "release-notes.md",
  "handoff-checklist.md",
];

const requiredHeadings = {
  "README.md": ["# AI Memory for FAZ IDE", "## Update flow (quick)", "## Rules", "## Required files"],
  "project-context.md": ["# Project Context", "## Product Goal", "## Current Priorities"],
  "feature-map.md": ["# Feature Map", "## Core Flows", "## Advanced Flows", "## UI Polish Candidates"],
  "decisions.md": ["# Decisions Log", "## Template"],
  "known-issues.md": ["# Known Issues", "## Open", "## Template"],
  "common-mistakes.md": ["# Common Mistakes", "## Command Mistakes", "## Testing Mistakes", "## Release Mistakes"],
  "error-catalog.md": ["# Error Catalog", "## Runtime and Build Errors", "## Test and Release Errors"],
  "franklin-fix-request.md": ["# Franklin Fix Request", "## Summary", "## Recovery Checklist"],
  "recovery-playbook.md": ["# Recovery Playbook", "## Rapid Triage", "## Failed Release Gate", "## Recovery Log Template"],
  "test-gaps.md": ["# Test Gaps", "## High Priority", "## Template"],
  "release-notes.md": ["# Release Notes Memory", "## Template"],
  "handoff-checklist.md": ["# Handoff Checklist", "## Before You Start", "## Before You End"],
};

const secretPatterns = [
  { regex: /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i, label: "API key assignment" },
  { regex: /secret\s*[:=]\s*['"][^'"]+['"]/i, label: "secret assignment" },
  { regex: /token\s*[:=]\s*['"][^'"]+['"]/i, label: "token assignment" },
  { regex: /-----BEGIN (?:RSA |EC |)PRIVATE KEY-----/i, label: "private key block" },
];

const failures = [];

function fail(message) {
  failures.push(message);
}

if (!fs.existsSync(memoryDir) || !fs.statSync(memoryDir).isDirectory()) {
  fail("Missing docs/ai-memory directory.");
}

for (const relFile of requiredFiles) {
  const absFile = path.join(memoryDir, relFile);
  if (!fs.existsSync(absFile)) {
    fail(`Missing required memory file: docs/ai-memory/${relFile}`);
    continue;
  }
  const content = fs.readFileSync(absFile, "utf8");
  if (!content.trim()) {
    fail(`Memory file is empty: docs/ai-memory/${relFile}`);
    continue;
  }
  if (content.trim().length < 80) {
    fail(`Memory file is too short to be useful: docs/ai-memory/${relFile}`);
  }

  const headings = requiredHeadings[relFile] || [];
  for (const heading of headings) {
    if (!content.includes(heading)) {
      fail(`Missing heading \"${heading}\" in docs/ai-memory/${relFile}`);
    }
  }

  for (const pattern of secretPatterns) {
    if (pattern.regex.test(content)) {
      fail(`Potential secret pattern (${pattern.label}) found in docs/ai-memory/${relFile}`);
    }
  }
}

if (failures.length) {
  console.error(`AI memory verification failed (${failures.length} issue${failures.length === 1 ? "" : "s"}).`);
  for (const message of failures) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log("AI memory verification passed.");
console.log(`- Verified folder: ${memoryDir}`);
console.log(`- Required files: ${requiredFiles.length}`);
