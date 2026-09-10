import { defineConfig } from "@playwright/test";

// Hermetic browser cookie-policy tests; no app DB, MAX account or external site.
export default defineConfig({
  testDir: "./tests/cookies",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  workers: 1,
  reporter: "list",
  // Self-signed, per-run certificate on loopback only; no trust-store changes.
  use: { ignoreHTTPSErrors: true, serviceWorkers: "block", trace: "off", screenshot: "off" },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});
