import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run the real production build with Supabase mocked at the network layer.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    ...devices["Pixel 7"],
    baseURL: "http://localhost:4173",
    serviceWorkers: "allow",
    trace: "retain-on-failure"
  },
  projects: [{ name: "android-chrome", use: { browserName: "chromium" } }],
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  }
});
