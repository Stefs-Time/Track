// End-to-end tests run against the real server (server.js serving dist/),
// so headers, CSP and the service worker are exercised the way users get them.
"use strict";

const { defineConfig, devices } = require("@playwright/test");

const PORT = Number(process.env.TEST_PORT) || 4600;

module.exports = defineConfig({
  testDir: "tests",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // feature suites run without the service worker so every load is the
    // freshly built page; pwa.spec.js turns it back on to test offline use
    serviceWorkers: "block",
    actionTimeout: 15_000,
    trace: "retain-on-failure"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node server.js",
    url: `http://localhost:${PORT}/healthz`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI
  }
});
