import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env.local so NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// E2E_TEST_EMAIL, E2E_TEST_PASSWORD are available in globalSetup/Teardown.
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

// Specs that depend on real DB writes / cross-user state must stay in the
// chromium-only `authenticated` project so we don't multiply DB load (and
// flake) by re-running them on Webkit/Firefox. Cross-browser coverage runs
// the read-only smoke specs in `cross-browser-smoke`.
const CROSS_BROWSER_SMOKE_SPECS =
  /dashboard\.spec\.ts|recording\.spec\.ts|lifecycle\.spec\.ts/;

const AUTHENTICATED_SPECS =
  /dashboard\.spec\.ts|inbox\.spec\.ts|findings\.spec\.ts|recording\.spec\.ts|offline\.spec\.ts|billing\.spec\.ts|lifecycle\.spec\.ts|interview-flow\.spec\.ts|multi-user\.spec\.ts|recovery\.spec\.ts|data-edge-cases\.spec\.ts|async-pipelines\.spec\.ts|tauri-shell\.spec\.ts/;

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

    // Phase 3: authenticated tests (chromium, full surface)
    {
      name: "authenticated",
      testMatch: AUTHENTICATED_SPECS,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },

    // Phase 4: cross-browser smoke — re-run a small subset on Webkit
    // (Safari engine — closer to the Tauri WebView on macOS than Chrome
    // is) and Firefox to catch render/layout/storage divergence.
    {
      name: "webkit-smoke",
      testMatch: CROSS_BROWSER_SMOKE_SPECS,
      use: {
        ...devices["Desktop Safari"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "firefox-smoke",
      testMatch: CROSS_BROWSER_SMOKE_SPECS,
      use: {
        ...devices["Desktop Firefox"],
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
