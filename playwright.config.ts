import { defineConfig, devices } from "@playwright/test";

// By default the suite builds and serves this checkout in production mode,
// which is what actually ships. Set E2E_BASE_URL to run the very same tests
// against an already-deployed copy instead (e.g. the live Vercel site).
const externalUrl = process.env.E2E_BASE_URL;
const port = 3100; // off the dev server's 3000, so both can run at once
const baseURL = externalUrl ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: externalUrl
    ? undefined
    : {
        command: `npm run build && npm run start -- --port ${port}`,
        url: baseURL,
        timeout: 300_000,
        reuseExistingServer: !process.env.CI,
      },
});
