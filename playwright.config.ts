import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3300);

/**
 * End-to-end tests against a production build. They use live Binance public
 * market data (no key), so they need network access; prices are never asserted
 * exactly — only structure, behavior and timing.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      testIgnore: /mobile/,
    },
    { name: "mobile", use: { ...devices["iPhone 14"], browserName: "chromium" }, testMatch: /mobile/ },
  ],
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
