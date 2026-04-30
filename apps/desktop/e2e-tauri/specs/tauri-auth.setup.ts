import { test, expect } from "../fixtures";
import { saveAuthSnapshot } from "../helpers/auth";

// In tauri mode the plugin's goto is `window.location.href = url` — there's
// no equivalent of Playwright's waitForLoadState. Use absolute URLs and an
// explicit waitForFunction so we don't race React's hydration.

const DEV_URL = process.env.ANVIL_E2E_DEV_URL ?? "http://localhost:3000";

// Sign in once via the real /login form inside the WKWebView, then capture
// localStorage. Subsequent specs restore the snapshot via the fixture and
// skip the form.
test("authenticate as E2E test user", async ({ tauriPage }) => {
  test.setTimeout(60_000);

  await tauriPage.goto(`${DEV_URL}/login`);
  // Tauri's goto returns immediately; React hydration takes a few seconds in
  // dev mode. Probe explicitly so a failure surfaces what's on the page.
  let landed = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const probe = await tauriPage.evaluate<string>(
      `JSON.stringify({ url: location.href, ready: document.readyState, hasEmail: !!document.querySelector('#email'), bodyLen: (document.body?.innerText||'').length })`
    );
    console.log(`[auth-setup] t=${i + 1}s ${probe}`);
    const parsed = JSON.parse(probe) as { hasEmail: boolean; ready: string };
    if (parsed.hasEmail && parsed.ready === "complete") {
      landed = true;
      break;
    }
  }
  if (!landed) throw new Error("login form never rendered");

  // readyState=complete means all scripts loaded, but React may still be
  // hydrating (attaching event handlers). Give it a moment so the form's
  // onSubmit is wired up before we click.
  await new Promise((r) => setTimeout(r, 500));

  await tauriPage.fill("#email", process.env.E2E_TEST_EMAIL!);
  await tauriPage.fill("#password", process.env.E2E_TEST_PASSWORD!);
  // The /login page has both a heading and a button with text "Sign in".
  // Click the form's submit button specifically.
  await tauriPage.click('button[type="submit"]');

  // Poll the URL ourselves — the plugin's waitForURL appears to require a
  // string exact match and doesn't follow redirects reliably in Tauri mode.
  // If we're still on /login after 10s, retry the submit in case the first
  // click landed before React finished hydrating.
  let onDashboard = false;
  let retried = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const probe = await tauriPage.evaluate<string>(
      `JSON.stringify({ url: location.href, errorText: document.querySelector('.text-destructive')?.textContent ?? null })`
    );
    const { url, errorText } = JSON.parse(probe) as { url: string; errorText: string | null };
    console.log(`[auth-setup] post-click t=${i + 1}s url=${url}${errorText ? ` error="${errorText}"` : ""}`);
    if (url.includes("/dashboard")) {
      onDashboard = true;
      break;
    }
    if (!retried && i >= 5) {
      console.log("[auth-setup] retrying submit — first click may have preceded hydration");
      await tauriPage.fill("#email", process.env.E2E_TEST_EMAIL!);
      await tauriPage.fill("#password", process.env.E2E_TEST_PASSWORD!);
      await tauriPage.click('button[type="submit"]');
      retried = true;
    }
  }
  if (!onDashboard) throw new Error("never landed on /dashboard after sign-in");

  const localStorageJson = await tauriPage.evaluate<string>(
    `JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])))`
  );
  const localStorage = JSON.parse(localStorageJson) as Record<string, string>;
  saveAuthSnapshot({ localStorage });
  // Mute the unused `expect` import — it's typed by the fixture barrel
  // and may be useful as future assertions are added.
  void expect;
});
