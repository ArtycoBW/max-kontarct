import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 420_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://127.0.0.1:4300", viewport: { width: 390, height: 844 }, actionTimeout: 15_000, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: [
    { command: "node apps/api/test/browser/server.cjs", url: "http://127.0.0.1:4301/api/v1/health/ready", timeout: 120_000, reuseExistingServer: false, env: { NODE_ENV: "test" } },
    { command: "node ../../node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 4300", cwd: "apps/web", url: "http://127.0.0.1:4300", timeout: 120_000, reuseExistingServer: false, env: { API_INTERNAL_BASE_URL: "http://127.0.0.1:4301/api/v1", API_PROXY_TARGET: "http://127.0.0.1:4301" } },
  ],
});
