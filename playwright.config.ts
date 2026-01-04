import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // Sequential to avoid WebSocket conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for M8 hardware
  reporter: "list",
  use: {
    baseURL: "http://localhost:8080",
    trace: "on-first-retry",
    headless: true,
  },
  webServer: {
    command: "npx tsx src/index.ts",
    url: "http://localhost:8080/api/health",
    reuseExistingServer: true,
    timeout: 10000,
  },
});
