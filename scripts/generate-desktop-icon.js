"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const BUILD_DIR = path.join(ROOT, "build");
const OUTPUT_PNG = path.join(BUILD_DIR, "icon.png");
const OUTPUT_ICO = path.join(BUILD_DIR, "icon.ico");
const CANDIDATE_SOURCES = [
  path.join(ROOT, "assets", "icons", "faz-512.svg"),
  path.join(ROOT, "assets", "icons", "faz-192.svg"),
  path.join(ROOT, "dist_site", "assets", "icons", "faz-512.svg"),
  path.join(ROOT, "dist_site", "assets", "icons", "faz-192.svg"),
];

function pickSourceSvg() {
  for (const candidate of CANDIDATE_SOURCES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `No source SVG icon found. Checked:\n${CANDIDATE_SOURCES.map((entry) => `- ${entry}`).join("\n")}`
  );
}

async function renderSvgToPng(svgPath, pngPath, size = 256) {
  const svg = fs.readFileSync(svgPath, "utf8");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<!doctype html>
      <html>
        <body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:transparent;overflow:hidden">
          <div id="icon" style="width:${size}px;height:${size}px">${svg}</div>
        </body>
      </html>`
    );
    await page.locator("#icon").screenshot({
      path: pngPath,
      omitBackground: true,
    });
  } finally {
    await browser.close();
  }
}

function writeIcoFromPng(pngBuffer, outPath) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // image type: icon
  header.writeUInt16LE(1, 4); // image count

  const entry = Buffer.alloc(16);
  entry.writeUInt8(0, 0); // width (0 == 256)
  entry.writeUInt8(0, 1); // height (0 == 256)
  entry.writeUInt8(0, 2); // palette colors
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngBuffer.length, 8); // image data bytes
  entry.writeUInt32LE(22, 12); // data offset (6 + 16)

  fs.writeFileSync(outPath, Buffer.concat([header, entry, pngBuffer]));
}

async function main() {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  const sourceSvg = pickSourceSvg();
  await renderSvgToPng(sourceSvg, OUTPUT_PNG, 256);
  const pngBuffer = fs.readFileSync(OUTPUT_PNG);
  writeIcoFromPng(pngBuffer, OUTPUT_ICO);
  console.log(`Generated desktop icons from ${path.relative(ROOT, sourceSvg)}`);
  console.log(`- ${path.relative(ROOT, OUTPUT_PNG)}`);
  console.log(`- ${path.relative(ROOT, OUTPUT_ICO)}`);
}

main().catch((error) => {
  console.error("Failed to generate desktop icon:", error?.message || error);
  process.exit(1);
});

