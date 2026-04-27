import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  cleanupProjectsForUser,
  getCalendarConnection,
  getUserIdByEmail,
  readAuthTokenFromStorageState,
} from "./helpers/db";

/**
 * Audit-pass coverage for settings + Calendar OAuth.
 *
 *   G1   /settings page renders the user's email and the Connect
 *        Calendar action.
 *   G2a  GET /api/calendar/google/connect — returns 200 with a Google
 *        OAuth authorize URL (we can't complete the consent flow from a
 *        non-interactive test, so this verifies up to the URL handoff).
 *   G2b  GET /api/calendar/google/events with no connection — 404.
 *
 * Out of scope (require manual user consent in a real Google account):
 *   - Completing the OAuth callback round-trip and asserting the
 *     calendar_connections row lands. Documented in the audit report.
 */

let testUserId: string;
let userToken: string;

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

test.beforeAll(async () => {
  const id = await getUserIdByEmail(process.env.E2E_TEST_EMAIL!);
  if (!id) throw new Error("E2E test user not found");
  testUserId = id;

  // See audit-analysis.spec.ts beforeAll for why we don't sign in fresh.
  userToken = readAuthTokenFromStorageState();
});

test.afterEach(async () => {
  await cleanupProjectsForUser(testUserId);
});

test.describe("audit: settings & calendar OAuth", () => {
  test("G1 /settings shows the user's email and the Connect Calendar action", async ({
    page,
  }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: /^settings$/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(process.env.E2E_TEST_EMAIL!)).toBeVisible();

    // Connect Calendar action visible. Either "Connect Calendar" if the
    // user has no connection, or a "Disconnect" / "Connected as ..." if
    // they do. Existing test user has no connection.
    const connection = await getCalendarConnection(testUserId);
    if (!connection) {
      await expect(
        page.getByRole("button", { name: /connect calendar/i }),
      ).toBeVisible();
    }
  });

  test("G2a GET /calendar/google/connect returns a Google authorize URL", async ({
    request,
  }) => {
    const res = await request.get(
      `${apiBase}/api/calendar/google/connect`,
      { headers: { Authorization: `Bearer ${userToken}` } },
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { url?: string };
    expect(body.url).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/);
    // scope must include calendar.readonly so the user actually consents
    // to what /events expects.
    expect(decodeURIComponent(body.url!)).toContain(
      "https://www.googleapis.com/auth/calendar.readonly",
    );
  });

  test("G2b GET /calendar/google/events without a connection returns 404", async ({
    request,
  }) => {
    // Test user has no calendar_connections row.
    const res = await request.get(
      `${apiBase}/api/calendar/google/events`,
      { headers: { Authorization: `Bearer ${userToken}` } },
    );
    expect(res.status()).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/not connected/i);
  });

  test("G2c GET /calendar/google/connect without auth returns 401", async ({
    request,
  }) => {
    const res = await request.get(`${apiBase}/api/calendar/google/connect`);
    expect(res.status()).toBe(401);
  });

  test("G2d /calendar/google/callback with a forged state nonce is rejected", async ({
    request,
  }) => {
    // Pre-PR-2 the callback trusted whatever was base64-encoded in
    // `state`. PR 2 wired oauth_states (CSRF nonce table) so an
    // attacker can no longer hand-craft a callback URL and have the
    // tokens upserted under their target's account. This locks that in.
    const res = await request.get(
      `${apiBase}/api/calendar/google/callback?code=fake-code&state=bogus-nonce-not-issued`,
      { maxRedirects: 0 },
    );
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/invalid state/i);

    // Confirm no calendar_connections row was written for the test user.
    const conn = await getCalendarConnection(testUserId);
    expect(conn).toBeNull();
  });

  test("G2d /calendar/google/connect mints a UUID nonce as state", async ({
    request,
  }) => {
    const res = await request.get(
      `${apiBase}/api/calendar/google/connect`,
      { headers: { Authorization: `Bearer ${userToken}` } },
    );
    const { url } = (await res.json()) as { url: string };
    const stateParam = new URL(url).searchParams.get("state");
    // UUID v4 shape — pre-PR-2 this was a base64-encoded JSON blob
    // containing the user's bearer token (which is exactly the leak
    // we're fixing). Locking in that the new state is just a UUID.
    expect(stateParam).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    // Defense in depth: assert the state does NOT contain a base64-
    // encoded JWT prefix ("eyJ" → '{"' base64-encoded), the shape of
    // the old leaky blob.
    expect(stateParam).not.toContain("eyJ");
  });
});
