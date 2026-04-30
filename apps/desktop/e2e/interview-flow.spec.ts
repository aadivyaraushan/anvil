import { test, expect } from "@playwright/test";
import {
  cleanupProjectsForUser,
  getUserIdByEmail,
  seedProject,
} from "./helpers/db";

let testUserId: string;

test.beforeAll(async () => {
  const id = await getUserIdByEmail(process.env.E2E_TEST_EMAIL!);
  if (!id) throw new Error("E2E test user not found — did globalSetup run?");
  testUserId = id;
});

test.afterEach(async () => {
  await cleanupProjectsForUser(testUserId);
});

// Submit-flow coverage. The earlier inbox spec only checks that the form
// opens — these specs actually exercise mutations + the various input
// shapes the user can put in. Together they would have caught the
// `meeting_platform NOT NULL` bug we hit in the lifecycle suite.

test.describe("Add interview — submit", () => {
  test("submitting with no meet link still creates the interview", async ({
    page,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Submit Empty Link",
    });

    await page.goto(`/project/${projectId}`);
    await page.getByRole("button", { name: /add conversation/i }).click();
    // Switch to the Online conversation mode — the drawer defaults to In person.
    await page.getByRole("tab", { name: /online/i }).click();

    // Leave the URL field empty entirely. Just supply an attendee.
    await page
      .locator("input[placeholder*='Attendee name']")
      .fill("Sam from Acme");

    await page.getByRole("button", { name: /Anvil will join/i }).click();

    // After insert, the inline drawer closes (its onSuccess handler).
    // The interview should appear in "This week" (no scheduled_at) with
    // the attendee name visible in the inbox row.
    await expect(page.getByText("Sam from Acme")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("submit with meet link round-trips the URL into the row", async ({
    page,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Submit With Link",
    });

    await page.goto(`/project/${projectId}`);
    await page.getByRole("button", { name: /add conversation/i }).click();
    // Switch to the Online conversation mode — the drawer defaults to In person.
    await page.getByRole("tab", { name: /online/i }).click();

    await page
      .locator("input[placeholder*='meet.google.com']")
      .fill("https://meet.google.com/abc-defg-hij");
    await page.locator("input[placeholder*='Attendee name']").fill("Pat Lee");

    await page.getByRole("button", { name: /Anvil will join/i }).click();
    await expect(page.getByText("Pat Lee")).toBeVisible({ timeout: 10_000 });
  });

  test("attendee names with quotes / emoji / unicode survive the round-trip", async ({
    page,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Weird Attendee Names",
    });
    // Mix of: smart quotes, emoji, RTL, double-quote, ampersand, tab.
    const tricky = `Renée O'Hara "Bunny" 🦊 &amp; مرحبا\tEnd`;

    await page.goto(`/project/${projectId}`);
    await page.getByRole("button", { name: /add conversation/i }).click();
    // Switch to the Online conversation mode — the drawer defaults to In person.
    await page.getByRole("tab", { name: /online/i }).click();
    await page.locator("input[placeholder*='Attendee name']").fill(tricky);
    await page.getByRole("button", { name: /Anvil will join/i }).click();

    // The DB stores the raw text; the row should render at least the
    // distinctive ASCII portion. (Tabs collapse in HTML rendering, so
    // we assert on a substring.)
    await expect(page.getByText(/Renée O'Hara/)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("user-entered attendee name is rendered as text, not interpreted as HTML", async ({
    page,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "XSS attempt",
    });
    const payload = `<img src=x onerror="window.__pwned=true">XSS Probe`;

    await page.goto(`/project/${projectId}`);
    await page.getByRole("button", { name: /add conversation/i }).click();
    // Switch to the Online conversation mode — the drawer defaults to In person.
    await page.getByRole("tab", { name: /online/i }).click();
    await page.locator("input[placeholder*='Attendee name']").fill(payload);
    await page.getByRole("button", { name: /Anvil will join/i }).click();

    await expect(page.getByText("XSS Probe")).toBeVisible({ timeout: 10_000 });

    // The onerror should not have fired — React escapes children by
    // default and the only way `__pwned` would be true is if some
    // component used dangerouslySetInnerHTML on the attendee field.
    const pwned = await page.evaluate(
      () => (window as unknown as { __pwned?: boolean }).__pwned ?? false,
    );
    expect(pwned).toBe(false);

    // And there should be no <img> element in the DOM with src=x.
    const xssImg = await page.locator('img[src="x"]').count();
    expect(xssImg).toBe(0);
  });

  test("double-clicking submit does not create duplicate interviews", async ({
    page,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Double-click guard",
    });

    await page.goto(`/project/${projectId}`);
    await page.getByRole("button", { name: /add conversation/i }).click();
    // Switch to the Online conversation mode — the drawer defaults to In person.
    await page.getByRole("tab", { name: /online/i }).click();
    await page
      .locator("input[placeholder*='Attendee name']")
      .fill("Dedupe Test");

    const submit = page.getByRole("button", { name: /Anvil will join/i });
    // Fire two clicks back-to-back. The button is disabled while the
    // mutation is pending (createInterview.isPending), so the second
    // click should be a no-op.
    await Promise.all([submit.click(), submit.click().catch(() => {})]);

    await expect(page.getByText("Dedupe Test")).toBeVisible({
      timeout: 20_000,
    });
    // Exactly one row.
    expect(await page.getByText("Dedupe Test").count()).toBe(1);
  });

  test("submit while offline surfaces the failure (no silent drop)", async ({
    page,
    context,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Offline submit",
    });

    await page.goto(`/project/${projectId}`);
    await page.getByRole("button", { name: /add conversation/i }).click();
    // Switch to the Online conversation mode — the drawer defaults to In person.
    await page.getByRole("tab", { name: /online/i }).click();
    await page
      .locator("input[placeholder*='Attendee name']")
      .fill("Will Fail");

    await context.setOffline(true);
    await page.getByRole("button", { name: /Anvil will join/i }).click();

    // The Supabase insert will fail with a TypeError (network unreachable).
    // The drawer currently doesn't render the mutation error inline, but
    // the drawer must NOT close (which would silently swallow the failure
    // and pretend success). The attendee input should remain editable.
    await expect(page.locator("input[placeholder*='Attendee name']")).toBeVisible({
      timeout: 5_000,
    });
    await expect(
      page.locator("input[placeholder*='Attendee name']"),
    ).toHaveValue("Will Fail");

    // Restore for cleanup
    await context.setOffline(false);
  });
});
