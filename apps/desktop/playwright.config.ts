import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env.local so NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// E2E_TEST_EMAIL, E2E_TEST_PASSWORD are available in globalSetup/Teardown.
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

export default defineConfig({
  testDir: "./e2e",
  // Sequential — single worker prevents DB mutation races between tests
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },

  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },

  projects: [
    // Phase 1: sign in and save storage state to e2e/.auth/user.json
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },

    // Phase 2: unauthenticated redirect tests (no storageState)
    {
      name: "auth-tests",
      testMatch: /auth\.spec\.ts|pricing\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },

    // Phase 3: authenticated tests (storageState from phase 1)
    {
      name: "authenticated",
      testMatch: /dashboard\.spec\.ts|inbox\.spec\.ts|findings\.spec\.ts|recording\.spec\.ts|offline\.spec\.ts|billing\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
