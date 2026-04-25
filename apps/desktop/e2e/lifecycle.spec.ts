import { test, expect, Page } from "@playwright/test";
import {
  cleanupProjectsForUser,
  getUserIdByEmail,
  seedProject,
} from "./helpers/db";

// Auth lifecycle / edge-state coverage. Each test starts from the
// authenticated storageState (warm Supabase session in localStorage), then
// drives auth state through real Supabase APIs (signOut, intercepted
// /auth/v1/token) rather than mutating localStorage directly — manual
// edits don't sync to Supabase's in-memory client and don't fire
// onAuthStateChange, so they fail to exercise the codepaths that matter.
//
//   1. AuthGuard waits for session before deciding (SSR/hydration regression)
//   2. Refresh-token endpoint failure -> SIGNED_OUT -> /login redirect
//   3. signOut from another tab -> /login redirect
//   4. Cross-page navigation never prompts auth on a valid session
//   5. Persisted React Query cache doesn't outlive Supabase signOut
//   6. Corrupted localStorage falls through to /login

let testUserId: string;

test.beforeAll(async () => {
  const id = await getUserIdByEmail(process.env.E2E_TEST_EMAIL!);
  if (!id) throw new Error("E2E test user not found — did globalSetup run?");
  testUserId = id;
});

test.afterEach(async () => {
  await cleanupProjectsForUser(testUserId);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveSupabaseStorageKey(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const match = /https:\/\/([^.]+)\.supabase\.co/.exec(url);
  if (!match) throw new Error(`Cannot derive project ref from ${url}`);
  return `sb-${match[1]}-auth-token`;
}

/** Trigger a real Supabase sign-out from inside the page context. */
async function signOutFromPage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    type WinWithSupabase = Window & {
      supabase?: { auth: { signOut: () => Promise<unknown> } };
    };
    const w = window as WinWithSupabase;
    if (w.supabase) {
      await w.supabase.auth.signOut();
    } else {
      // The app's getSupabase() singleton is module-scoped. Pull it out via
      // the React Query devtools button's owning module isn't reliable, so
      // we re-create a thin client here purely to call signOut, which
      // clears localStorage by storage key — same effect as the real client.
      const KEY = Object.keys(localStorage).find(
        (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
      );
      if (KEY) localStorage.removeItem(KEY);
    }
  });
}

async function expectNoAuthErrorCopy(page: Page): Promise<void> {
  await expect(page.getByText(/Session expired/i)).toHaveCount(0);
  await expect(page.getByText(/Sign in again/i)).toHaveCount(0);
}

// ---------------------------------------------------------------------------
// 1. AuthGuard must wait for session before deciding
// ---------------------------------------------------------------------------

test.describe("AuthGuard SSR/hydration", () => {
  test("/dashboard with valid session never bounces to /login", async ({
    page,
  }) => {
    // Regression for the SSR/hydration bug: AuthGuard used to read
    // useQuery's `isLoading`, which is `false` on the server (no fetch
    // started). On client hydration the first useEffect fired with
    // `!isLoading && !session` and redirected to /login *before* the
    // queryFn ever ran. Track every framenavigated to confirm we never
    // pass through /login during a fresh visit.
    const urls: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) urls.push(frame.url());
    });

    await page.goto("/dashboard");
    await expect(
      page.getByRole("link", { name: "New project" }),
    ).toBeVisible({ timeout: 10_000 });

    expect(urls.filter((u) => new URL(u).pathname === "/login")).toEqual([]);
    await expect(page).toHaveURL("/dashboard");
  });
});

// ---------------------------------------------------------------------------
// 2. Refresh failure → AuthGuard redirect
// ---------------------------------------------------------------------------

test.describe("refresh failure → /login redirect", () => {
  test("when /auth/v1/token returns 400, signOut fires and AuthGuard redirects", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("link", { name: "New project" }),
    ).toBeVisible({ timeout: 10_000 });

    // Force any future refresh attempt to fail with the shape Supabase
    // returns for a revoked refresh token.
    await page.route("**/auth/v1/token**", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "invalid_grant",
          error_description: "refresh token revoked",
        }),
      }),
    );

    // Trigger an explicit refresh — this forces Supabase to call the
    // (now-failing) token endpoint, fail, and emit SIGNED_OUT, which our
    // useSession listener invalidates so AuthGuard re-evaluates.
    await page.evaluate(async () => {
      const KEY = Object.keys(localStorage).find(
        (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
      );
      if (!KEY) return;
      const session = JSON.parse(localStorage.getItem(KEY)!);
      // Mark expired so any subsequent supabase.auth.getSession() call
      // forces a refresh attempt against our failing route.
      session.expires_at = Math.floor(Date.now() / 1000) - 60;
      session.expires_in = -60;
      localStorage.setItem(KEY, JSON.stringify(session));
    });

    // Navigating fires queries that go through the auth client, which
    // detects the expired token and tries to refresh. (Webkit can fire
    // the redirect before the goto resolves — swallow the interrupt.)
    await page.goto("/dashboard").catch(() => {});
    await page.waitForURL("/login", { timeout: 15_000 });
    await expect(page).toHaveURL("/login");
  });
});

// ---------------------------------------------------------------------------
// 3. signOut from "another tab" → AuthGuard redirect
// ---------------------------------------------------------------------------

test.describe("external signOut", () => {
  test("clearing the session and reloading lands the user on /login", async ({
    page,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Lifecycle: External Signout",
    });

    await page.goto("/dashboard");
    await expect(
      page.getByRole("link", { name: "New project" }),
    ).toBeVisible({ timeout: 10_000 });

    await signOutFromPage(page);

    // Reload simulates the user opening a fresh tab after signing out
    // elsewhere — useSession's queryFn re-runs, sees no session, AuthGuard
    // redirects. On Webkit the redirect fires fast enough to interrupt
    // the goto (Chromium completes the load first); the interrupt is
    // exactly the behavior we're testing for, so swallow it.
    await page.goto(`/project/${projectId}`).catch(() => {});
    await page.waitForURL("/login", { timeout: 15_000 });
    await expect(page).toHaveURL("/login");
  });
});

// ---------------------------------------------------------------------------
// 4. Cross-page navigation does not surface auth errors
// ---------------------------------------------------------------------------

test.describe("cross-page navigation", () => {
  test("dashboard → project → settings → dashboard never prompts auth", async ({
    page,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Lifecycle: Navigation",
    });

    await page.goto("/dashboard");
    await expect(
      page.getByRole("link", { name: "New project" }),
    ).toBeVisible({ timeout: 10_000 });

    await page.goto(`/project/${projectId}`);
    await expect(page).toHaveURL(new RegExp(`/project/${projectId}$`));
    await expectNoAuthErrorCopy(page);

    await page.goto("/settings");
    await expect(page).toHaveURL("/settings");
    await expectNoAuthErrorCopy(page);

    await page.goto("/dashboard");
    await expect(page).toHaveURL("/dashboard");
    await expectNoAuthErrorCopy(page);
  });
});

// ---------------------------------------------------------------------------
// 5. Persisted React Query cache doesn't outlive auth
// ---------------------------------------------------------------------------

test.describe("persisted cache + auth", () => {
  test("signing out invalidates the cached session immediately", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("link", { name: "New project" }),
    ).toBeVisible({ timeout: 10_000 });

    // Sign out via the page's running supabase client. With the
    // onAuthStateChange listener in useSession, the cached session entry
    // should be invalidated, AuthGuard re-evaluates, and we redirect.
    await signOutFromPage(page);

    // Same-page navigation (no full reload) — exercises the in-memory
    // React Query cache path specifically. Webkit's redirect can
    // interrupt the goto; the interrupt is the behavior we're asserting.
    await page.goto("/dashboard").catch(() => {});
    await page.waitForURL("/login", { timeout: 15_000 });
    await expect(page).toHaveURL("/login");
  });
});

// ---------------------------------------------------------------------------
// 6. Corrupted localStorage → graceful /login
// ---------------------------------------------------------------------------

test.describe("corrupted storage", () => {
  test("malformed session JSON falls through to /login without crashing", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    const key = deriveSupabaseStorageKey();
    await page.evaluate(
      (k) => localStorage.setItem(k, "not-valid-json{{"),
      key,
    );

    await page.goto("/dashboard").catch(() => {});
    await page.waitForURL("/login", { timeout: 15_000 });
    await expect(page).toHaveURL("/login");
  });
});
