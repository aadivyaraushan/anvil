import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Single launcher per `cargo tauri dev` instance. Playwright runs with one
// worker (fullyParallel: false) so the suite shares a single Tauri process —
// matching the existing browser suite's DB-safety constraint.

// Matches `tauri-plugin-playwright`'s default `PluginConfig::socket_path`.
// The plugin doesn't read an env var, so we follow its default rather than
// invent our own — keeps the lib.rs side at `tauri_plugin_playwright::init()`.
export const TAURI_SOCKET = "/tmp/tauri-playwright.sock";

export interface LaunchedTauri {
  process: ChildProcess;
  socket: string;
  kill: () => Promise<void>;
}

const DESKTOP_ROOT = path.resolve(__dirname, "..", "..");

async function waitForSocket(socketPath: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(socketPath)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(
    `Tauri control socket never appeared at ${socketPath} within ${timeoutMs}ms. ` +
      "Did the e2e-feature build fail to load tauri-plugin-playwright?"
  );
}

export async function launchTauri(opts?: {
  devUrl?: string;
  envOverrides?: Record<string, string>;
}): Promise<LaunchedTauri> {
  // Stale sockets from previous crashed runs would otherwise make the plugin
  // bind() fail silently.
  if (fs.existsSync(TAURI_SOCKET)) fs.unlinkSync(TAURI_SOCKET);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ANVIL_E2E_DEV_URL: opts?.devUrl ?? "http://localhost:3000",
    ...opts?.envOverrides,
  };

  // Use `cargo tauri dev` so the webview loads from `devUrl` as a *local*
  // trusted context. The default tauri.conf.json points each window at an
  // absolute prod URL (`https://app.anvil-dev.com/...`), which Tauri treats
  // as remote — and remote contexts silently deny app commands without
  // per-command permissions. Override the window URLs to relative paths so
  // Tauri prepends devUrl, producing a trusted-local webview.
  //
  // Also override `beforeDevCommand` (Tauri would otherwise spawn its own
  // `pnpm dev` and clash with the harness's already-running :3000 server).
  const devUrl = opts?.devUrl ?? "http://localhost:3000";
  const configOverride = JSON.stringify({
    build: {
      beforeDevCommand: "",
      devUrl,
    },
    app: {
      windows: [
        { label: "main", url: "/dashboard" },
      ],
    },
  });
  const child = spawn(
    "pnpm",
    [
      "exec",
      "tauri",
      "dev",
      "--features",
      "e2e",
      "--no-watch",
      "--config",
      configOverride,
    ],
    {
      cwd: DESKTOP_ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  child.stdout?.on("data", (chunk) => {
    if (process.env.TAURI_E2E_VERBOSE) process.stdout.write(`[tauri] ${chunk}`);
  });
  child.stderr?.on("data", (chunk) => {
    if (process.env.TAURI_E2E_VERBOSE) process.stderr.write(`[tauri] ${chunk}`);
  });

  await waitForSocket(TAURI_SOCKET, 180_000);

  return {
    process: child,
    socket: TAURI_SOCKET,
    kill: () =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
        // Hard-kill if it doesn't shut down within 5s.
        setTimeout(() => child.kill("SIGKILL"), 5_000);
      }),
  };
}
