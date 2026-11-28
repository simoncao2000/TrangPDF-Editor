import { defineConfig, devices } from "playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "e2e/results/artifacts",
  workers: 1,
  timeout: 120_000,
  use: { baseURL: "http://localhost:5199", trace: "retain-on-failure", actionTimeout: 8000 },
  webServer: {
    command: "bun run dev --port 5199 --strictPort --force",
    url: "http://localhost:5199",
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
  },
  projects: [
    {
      name: "desktop",
      grepInvert: /phone gestures/,
      use: { browserName: "chromium", viewport: { width: 1440, height: 900 }, hasTouch: true },
    },
    { name: "pixel-7", grep: /1000 pages|phone gestures/, use: { ...devices["Pixel 7"], browserName: "chromium" } },
    {
      name: "webkit-iphone",
      grep: /1000 pages|phone gestures/,
      use: { ...devices["iPhone 14"], browserName: "webkit" },
    },
  ],
});
