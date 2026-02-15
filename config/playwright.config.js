const { defineConfig } = require("@playwright/test");
const path = require("node:path");

module.exports = defineConfig({
  testDir: path.resolve(__dirname, "..", "tests"),
  outputDir: path.resolve(__dirname, "..", "artifacts", "test-results"),
  reporter: "line",
  workers: 3,
  timeout: 30000,
  expect: { timeout: 5000 },
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true
  },
  webServer: {
    command: "node scripts/serve.js",
    cwd: path.resolve(__dirname, ".."),
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
});
