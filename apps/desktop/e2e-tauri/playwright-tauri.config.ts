import { defineConfig } from "@playwright/test";
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load the same .env.local the browser suite uses so Supabase/E2E_TEST_*
// env vars are available to global-setup and the auth setup spec.
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });

const DEV_URL = process.env.ANVIL_E2E_DEV_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./specs",
  // Single worker — we share one Tauri WKWebView instance across the suite
  // and rely on per-spec setup to keep state explicit. Mirrors the browser
  // suite's stance on DB-mutation races.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },

  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",

  // No `webServer` here — the dev server (`pnpm --filter desktop dev`) and
  // api server (`pnpm --filter api dev`) are started by CI / the developer
  // before this config runs. The Tauri app boots inside global-setup.
  use: {
    // baseURL is informational only; tauri-plugin-playwright owns navigation
    // through the WKWebView socket bridge.
    baseURL: DEV_URL,
    trace: "retain-on-failure",
  },

  webServer: [
    {
      command: "pnpm --filter desktop dev",
      url: DEV_URL,
      cwd: path.resolve(__dirname, "../../.."),
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        NEXT_PUBLIC_API_URL:
          process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
      },
    },
    {
      command: "pnpm --filter api dev",
      url: "http://localhost:3001/api/health",
      cwd: path.resolve(__dirname, "../../.."),
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ANVIL_LLM_MODE: "mock",
      },
    },
  ],

  projects: [
    {
      name: "tauri-setup",
      testMatch: /tauri-auth\.setup\.ts/,
      // `mode: "tauri"` is the @srsholmes/tauri-playwright option that
      // switches the fixture from browser-with-IPC-mocks to a socket bridge
      // into the real WKWebView. Without it, the plugin's mock invoke
      // intercepts every command and silently returns null.
      use: { mode: "tauri" } as Record<string, unknown>,
    },
    {
      name: "tauri-authenticated",
      testMatch: /\/specs\/.*\.spec\.ts/,
      dependencies: ["tauri-setup"],
      use: { mode: "tauri" } as Record<string, unknown>,
    },
  ],
});
