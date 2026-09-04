import { defineConfig } from "@playwright/test";

// These specs never hit a real backend - every /api/v1/* call is intercepted
// with page.route() in the test itself - so the dev server can boot without
// Postgres/uvicorn. NEXT_PUBLIC_API_URL only needs to be *some* origin the
// tests recognize when mocking.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { NEXT_PUBLIC_API_URL: "http://localhost:8080" },
  },
});
