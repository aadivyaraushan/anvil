import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The auth setup spec writes localStorage entries here after a successful UI
// sign-in. Subsequent specs restore them via `tauriPage.evaluate(...)` before
// the first navigation so the Supabase JS client picks up the existing session
// instead of redirecting to /login.

const AUTH_FILE = path.resolve(__dirname, "..", ".auth", "tauri-user.json");

export interface PersistedAuth {
  // Snapshot of localStorage as a flat string→string map.
  localStorage: Record<string, string>;
}

export function saveAuthSnapshot(snapshot: PersistedAuth): void {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(snapshot, null, 2));
}

export function loadAuthSnapshot(): PersistedAuth | null {
  if (!fs.existsSync(AUTH_FILE)) return null;
  return JSON.parse(fs.readFileSync(AUTH_FILE, "utf8")) as PersistedAuth;
}

export function authFilePath(): string {
  return AUTH_FILE;
}
