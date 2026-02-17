const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const cssDir = path.join(root, "assets", "css");

function listCssFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.toLowerCase() === "min") {
        continue;
      }
      files.push(...listCssFiles(abs));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".css")) {
      files.push(abs);
    }
  }
  return files.sort();
}

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

if (!fs.existsSync(cssDir)) {
  console.error("CSS directory not found: assets/css");
  process.exit(1);
}

const files = listCssFiles(cssDir);
const importReport = [];
const fontFaceReport = [];
const googleFontImports = [];

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");

  const importMatches = Array.from(text.matchAll(/@import\s+[^;]+;/g));
  if (importMatches.length) {
    importReport.push({
      file: rel(file),
      imports: importMatches.map((m) => m[0].trim()),
    });
  }

  const fontFaceMatches = Array.from(text.matchAll(/@font-face\s*\{/g));
  if (fontFaceMatches.length) {
    fontFaceReport.push({ file: rel(file), count: fontFaceMatches.length });
  }

  for (const match of importMatches) {
    const statement = match[0].trim();
    if (/fonts\.googleapis\.com/i.test(statement)) {
      googleFontImports.push({ file: rel(file), statement });
    }
  }
}

console.log("CSS import/font audit");
console.log(`- Files scanned: ${files.length}`);
console.log(`- Files with @import: ${importReport.length}`);
console.log(`- Files with @font-face: ${fontFaceReport.length}`);
console.log(`- Google Fonts imports: ${googleFontImports.length}`);

if (importReport.length) {
  console.log("\n@import usage:");
  for (const entry of importReport) {
    console.log(`- ${entry.file}`);
    for (const statement of entry.imports) {
      console.log(`  - ${statement}`);
    }
  }
}

if (fontFaceReport.length) {
  console.log("\n@font-face usage:");
  for (const entry of fontFaceReport) {
    console.log(`- ${entry.file}: ${entry.count}`);
  }
}

if (googleFontImports.length) {
  console.log("\nGoogle Fonts @import statements:");
  for (const entry of googleFontImports) {
    console.log(`- ${entry.file}`);
    console.log(`  - ${entry.statement}`);
  }
}
