import {
  createTauriTest,
  type TauriPage as RealTauriPage,
  type BrowserPageAdapter,
} from "@srsholmes/tauri-playwright";
import { loadAuthSnapshot } from "./helpers/auth";
import { TAURI_SOCKET } from "./helpers/launcher";

// `tauriPage` is the WKWebView control surface — same shape as Playwright's
// Page but routed through the Tauri plugin's socket bridge instead of CDP.
// In browser mode the plugin returns a `BrowserPageAdapter` with the same
// surface; the union is what the fixture actually exposes.
export type TauriPage = RealTauriPage | BrowserPageAdapter;

const DEV_URL = process.env.ANVIL_E2E_DEV_URL ?? "http://localhost:3000";

const base = createTauriTest({
  // Empty string skips the fixture's initial navigation + __PW_ACTIVE__
  // wait. Every spec navigates on its own (auth.setup → /login,
  // restoreAuth → DEV_URL), so the fixture navigation was redundant and
  // its fixed 30s timeout caused flakes when the dev server was cold.
  devUrl: "",
  ipcMocks: {},
  mcpSocket: TAURI_SOCKET,
});

export const expect = base.expect;

// Restore the persisted Supabase session into the WKWebView's localStorage.
// Call this from `test.beforeEach` in any spec that needs an authenticated
// state — the auth snapshot is produced by `tauri-auth.setup.ts` which runs
// once per suite via the `tauri-setup` Playwright project.
export async function restoreAuth(tauriPage: TauriPage): Promise<void> {
  const snapshot = loadAuthSnapshot();
  if (!snapshot) return;
  // localStorage is per-origin — land on the dev origin before writing keys.
  // Since we skip the fixture's devUrl navigation, the WKWebView starts at a
  // blank page. We must wait for the page to fully load before writing to
  // localStorage, otherwise the origin isn't established yet.
  await tauriPage.goto(DEV_URL);
  for (let i = 0; i < 30; i++) {
    const ready = await tauriPage.evaluate<string>(`document.readyState`);
    if (ready === "complete") break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  await tauriPage.evaluate(
    `(() => {
       sessionStorage.clear();
       const entries = ${JSON.stringify(snapshot.localStorage)};
       for (const [k, v] of Object.entries(entries)) {
         try { localStorage.setItem(k, v); } catch {}
       }
     })()`
  );
}

// Re-export `test` so specs `import { test, expect } from "../fixtures"`.
// The auth-restore is opt-in (call `restoreAuth(tauriPage)` in beforeEach)
// rather than a fixture override, which kept Playwright's fixture-typing
// happy across the @playwright/test 1.5x line.
export const test = base.test;
