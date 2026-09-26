import { defineConfig } from "@playwright/test";

// Isolated UI fixtures: never connect to a real API or mutate client data.
export default defineConfig({
  testDir: "./tests/browser", testMatch: "start-and-paste-layout.spec.ts", workers: 1,
  timeout: 60_000, expect: { timeout: 15_000 }, reporter: "list",
  use: { baseURL: "http://127.0.0.1:4300", screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: { command: "node ../../node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 4300", cwd: "apps/web", url: "http://127.0.0.1:4300", timeout: 120_000, reuseExistingServer: false },
});
