import { test, expect, Page } from "@playwright/test";
import {
  cleanupProjectsForUser,
  getUserIdByEmail,
  seedProject,
} from "./helpers/db";

// Auth lifecycle / edge-state coverage. Each test starts from the
// authenticated storageState (warm Supabase session in localStorage), then
// mutates that state to simulate the failure modes that don't show up in
// happy-path specs:
//   1. Access token expiry mid-session  -> silent refresh
//   2. Refresh token revocation         -> clean /login redirect
//   3. Corrupted auth blob              -> clean /login redirect (no crash)
//   4. Cleared session                  -> AuthGuard redirect on protected route
//   5. Cross-page navigation            -> no spurious "Session expired" copy
//   6. Persisted React Query cache      -> doesn't outlive auth

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

type StoredSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
  user: unknown;
  token_type?: string;
};

function deriveSupabaseStorageKey(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const match = /https:\/\/([^.]+)\.supabase\.co/.exec(url);
  if (!match) throw new Error(`Cannot derive project ref from ${url}`);
  return `sb-${match[1]}-auth-token`;
}

async function readSupabaseSession(page: Page): Promise<StoredSession | null> {
  const key = deriveSupabaseStorageKey();
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  }, key);
}

async function writeSupabaseSession(
  page: Page,
  session: StoredSession,
): Promise<void> {
  const key = deriveSupabaseStorageKey();
  await page.evaluate(
    ({ k, value }) => localStorage.setItem(k, JSON.stringify(value)),
    { k: key, value: session },
  );
}

async function clearSupabaseSession(page: Page): Promise<void> {
  const key = deriveSupabaseStorageKey();
  await page.evaluate((k) => localStorage.removeItem(k), key);
}

async function expectNoAuthErrorCopy(page: Page): Promise<void> {
  await expect(page.getByText(/Session expired/i)).toHaveCount(0);
  await expect(page.getByText(/Sign in again/i)).toHaveCount(0);
}

// ---------------------------------------------------------------------------
// 1. Token expiry mid-session
// ---------------------------------------------------------------------------

test.describe("token expiry → silent refresh", () => {
  test("expired access_token is refreshed transparently on the next request", async ({
    page,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Lifecycle: Token Refresh",
    });

    await page.goto("/dashboard");
    await expect(
      page.getByText("Lifecycle: Token Refresh"),
    ).toBeVisible({ timeout: 10_000 });

    // Mark the access_token expired in localStorage. The refresh_token is
    // still valid, so Supabase should detect expiry and refresh on the next
    // request — without any user-visible "Session expired" surfacing.
    const session = await readSupabaseSession(page);
    if (!session) throw new Error("No supabase session — did auth.setup run?");
    const expiredAt = Math.floor(Date.now() / 1000) - 60;
    await writeSupabaseSession(page, {
      ...session,
      expires_at: expiredAt,
      expires_in: -60,
    });

    await page.goto(`/project/${projectId}`);
    await expect(page).toHaveURL(new RegExp(`/project/${projectId}$`));
    await expectNoAuthErrorCopy(page);

    // Verify the refresh actually fired and persisted a fresh token.
    const after = await readSupabaseSession(page);
    expect(after).not.toBeNull();
    expect(after!.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});

// ---------------------------------------------------------------------------
// 2. Refresh token revocation
// ---------------------------------------------------------------------------

test.describe("refresh failure → clean /login redirect", () => {
  test("invalid refresh_token routes to /login without crashing", async ({
    page,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Lifecycle: Refresh Failure",
    });

    await page.goto("/dashboard");
    await expect(
      page.getByText("Lifecycle: Refresh Failure"),
    ).toBeVisible({ timeout: 10_000 });

    // Stub the token endpoint deterministically: any refresh attempt fails
    // with the shape Supabase returns for a revoked refresh_token.
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

    const session = await readSupabaseSession(page);
    if (!session) throw new Error("No supabase session — did auth.setup run?");
    await writeSupabaseSession(page, {
      ...session,
      access_token: "invalid.access.token",
      refresh_token: "invalid-refresh-token",
      expires_at: Math.floor(Date.now() / 1000) - 60,
      expires_in: -60,
    });

    await page.goto(`/project/${projectId}`);
    await page.waitForURL("/login", { timeout: 15_000 });
    await expect(page).toHaveURL("/login");
  });
});

// ---------------------------------------------------------------------------
// 3. Corrupted auth blob
// ---------------------------------------------------------------------------

test.describe("corrupted localStorage → graceful recovery", () => {
  test("malformed session JSON falls through to /login", async ({ page }) => {
    await page.goto("/dashboard");

    const key = deriveSupabaseStorageKey();
    await page.evaluate(
      (k) => localStorage.setItem(k, "not-valid-json{{"),
      key,
    );

    await page.goto("/dashboard");
    await page.waitForURL("/login", { timeout: 15_000 });
    await expect(page).toHaveURL("/login");
  });
});

// ---------------------------------------------------------------------------
// 4. Cleared session on a protected route
// ---------------------------------------------------------------------------

test.describe("missing session → AuthGuard redirect", () => {
  test("clearing localStorage mid-session redirects on next protected nav", async ({
    page,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Lifecycle: Missing Session",
    });

    await page.goto("/dashboard");
    await expect(
      page.getByText("Lifecycle: Missing Session"),
    ).toBeVisible({ timeout: 10_000 });

    await clearSupabaseSession(page);

    await page.goto(`/project/${projectId}`);
    await page.waitForURL("/login", { timeout: 15_000 });
    await expect(page).toHaveURL("/login");
  });
});

// ---------------------------------------------------------------------------
// 5. Cross-page navigation does not surface auth errors
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
      page.getByText("Lifecycle: Navigation"),
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
// 6. Persisted React Query cache must not mask auth absence
// ---------------------------------------------------------------------------

test.describe("persisted React Query cache + auth", () => {
  test("stale cache does not keep us logged in after session is cleared", async ({
    page,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Lifecycle: Stale Cache",
    });

    await page.goto("/dashboard");
    await expect(
      page.getByText("Lifecycle: Stale Cache"),
    ).toBeVisible({ timeout: 10_000 });

    // React Query has now persisted projects + interviews to IndexedDB.
    // Drop only the auth session — cache stays.
    await clearSupabaseSession(page);

    await page.goto("/dashboard");
    await page.waitForURL("/login", { timeout: 15_000 });
    await expect(page).toHaveURL("/login");
  });
});
