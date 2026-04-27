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
//
// Excluded from smoke: dashboard.spec.ts. Its create-project test is
// chromium-stable but flakes on Webkit/Firefox specifically when the
// suite has previously sign-in'd via the form (full-flow does this) —
// the post-mutation router.push gets interleaved with an auth-state
// re-evaluation in a way only those engines surface. Chromium runs the
// full dashboard flow in the `authenticated` project; cross-browser
// smoke focuses on rendering divergence (recording UI + lifecycle).
// Anchored to a leading `/` so `audit-recording.spec.ts` (chromium-only,
// drives a real MediaRecorder via the canvas) does NOT match — the
// audit recording spec stays in the authenticated project, while the
// existing read-only smoke `recording.spec.ts` runs cross-browser.
const CROSS_BROWSER_SMOKE_SPECS =
  /\/recording\.spec\.ts$|\/lifecycle\.spec\.ts$/;

const AUTHENTICATED_SPECS =
  /dashboard\.spec\.ts|inbox\.spec\.ts|findings\.spec\.ts|recording\.spec\.ts|offline\.spec\.ts|billing\.spec\.ts|lifecycle\.spec\.ts|interview-flow\.spec\.ts|multi-user\.spec\.ts|recovery\.spec\.ts|data-edge-cases\.spec\.ts|async-pipelines\.spec\.ts|tauri-shell\.spec\.ts|transcript-pipeline\.spec\.ts|full-flow\.spec\.ts|audit-projects\.spec\.ts|audit-interviews\.spec\.ts|audit-recording\.spec\.ts|audit-billing\.spec\.ts|audit-settings\.spec\.ts|audit-analysis\.spec\.ts/;

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
      testMatch: /auth\.spec\.ts|pricing\.spec\.ts|audit-auth\.spec\.ts/,
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

  // Two webServers: the desktop Next.js app on :3000, and the api Next.js
  // app on :3001. We need both because the desktop UI calls into the api
  // routes (POST /api/projects, the analyst pipeline, copilot stream, etc.).
  // CI spawns fresh processes with ANVIL_LLM_MODE=mock so the audit
  // analysis E1 test doesn't burn OpenAI credits. Local dev reuses an
  // already-running pnpm dev (without the mock env) — to run the mocked
  // tests locally, restart the api server with ANVIL_LLM_MODE=mock first.
  webServer: [
    {
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "pnpm --filter api dev",
      url: "http://localhost:3001/api/health",
      cwd: path.resolve(__dirname, "../.."),
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ANVIL_LLM_MODE: "mock",
      },
    },
  ],
});
