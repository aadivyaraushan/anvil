import { test, expect } from "@playwright/test";
import {
  deleteUser,
  getUserIdByEmail,
  getSubscription,
} from "./helpers/db";

/**
 * Audit-pass coverage for auth flows that the existing `auth.spec.ts`
 * doesn't reach: signup actually creating a real Supabase user + the
 * subscriptions trigger row, and session resilience across reload.
 *
 * Runs in the `auth-tests` Playwright project (no storageState) so we
 * sign up fresh per test and clean the user up after.
 */

const FRESH_PASSWORD = "AuditPass123!";

function freshEmail(): string {
  return `audit-signup-${Date.now()}-${Math.floor(Math.random() * 1000)}@anvil.test`;
}

test.describe("audit: signup persists user + subscriptions row", () => {
  let createdEmail: string | null = null;

  test.afterEach(async () => {
    if (createdEmail) {
      const id = await getUserIdByEmail(createdEmail).catch(() => null);
      if (id) await deleteUser(id).catch(() => {});
      createdEmail = null;
    }
  });

  test("signup with a fresh email creates auth.users + subscriptions row (free plan)", async ({
    page,
  }) => {
    createdEmail = freshEmail();

    await page.goto("/signup");
    await page.locator("#email").fill(createdEmail);
    await page.locator("#password").fill(FRESH_PASSWORD);
    await page.getByRole("button", { name: "Sign up" }).click();

    // Email confirmation is off in this project — signup should drop us
    // straight on /dashboard.
    await page.waitForURL("/dashboard", { timeout: 15_000 });

    // Auth user exists.
    const userId = await getUserIdByEmail(createdEmail);
    expect(userId).not.toBeNull();

    // Subscriptions row exists with plan='free'. The Supabase trigger
    // should fire on auth.users insert; the test asserts the row landed,
    // not the trigger mechanism. If this fails, either the trigger is
    // broken or globalSetup's upsert is masking the bug elsewhere.
    const sub = await getSubscription(userId!);
    expect(sub).not.toBeNull();
    expect(sub?.plan).toBe("free");
    expect(sub?.status).toBe("active");
  });
});

test.describe("audit: session resilience", () => {
  test("hard reload while authed keeps the user on /dashboard (no flash to /login)", async ({
    page,
  }) => {
    // Sign in first.
    await page.goto("/login");
    await page.locator("#email").fill(process.env.E2E_TEST_EMAIL!);
    await page.locator("#password").fill(process.env.E2E_TEST_PASSWORD!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("/dashboard", { timeout: 15_000 });

    // Hard reload should NOT redirect to /login. The AuthGuard should
    // wait for the session to rehydrate from localStorage.
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    // Give the AuthGuard a moment to settle. If it bounces to /login,
    // we'll catch it here.
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("/dashboard");
  });
});
