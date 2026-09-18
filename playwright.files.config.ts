import { defineConfig } from "@playwright/test";

// Preview-only tests use local synthetic documents and intercept all API calls.
export default defineConfig({
  testDir: "./tests/browser", testMatch: "file-preview.spec.ts", workers: 1,
  timeout: 90_000, expect: { timeout: 30_000 }, reporter: "list",
  outputDir: "test-results/file-preview",
  use: { baseURL: "http://127.0.0.1:4300", screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: { command: "node ../../node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 4300", cwd: "apps/web", url: "http://127.0.0.1:4300", timeout: 120_000, reuseExistingServer: false },
});
