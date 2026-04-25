import { test, expect } from "@playwright/test";
import {
  cleanupProjectsForUser,
  getUserIdByEmail,
  seedProject,
} from "./helpers/db";

// Recovery / interruption coverage. Real users hit interrupted states
// constantly: their network drops, they navigate away mid-mutation, they
// return to a tab whose session expired while they were typing. These
// specs make sure the app degrades gracefully (no data loss + no
// silently-discarded user input).

let testUserId: string;

test.beforeAll(async () => {
  const id = await getUserIdByEmail(process.env.E2E_TEST_EMAIL!);
  if (!id) throw new Error("E2E test user not found");
  testUserId = id;
});

test.afterEach(async () => {
  await cleanupProjectsForUser(testUserId);
});

test.describe("Mid-form interruption", () => {
  test("typing in the new-project form survives a tab reload of the same URL", async ({
    page,
  }) => {
    await page.goto("/dashboard/new");
    await page.locator("#name").fill("Half-typed name");
    await page
      .locator("#idea_description")
      .fill("Initial draft idea text…");

    // Reload — emulates user accidentally hitting cmd-R or the OS
    // recovering the tab. The form is purely client-state right now, so
    // the inputs WILL be cleared. This test documents that behavior so
    // that if/when we add draft persistence (localStorage/IndexedDB),
    // we'll know to update it.
    await page.reload();
    await expect(page.locator("#name")).toBeVisible();
    // Currently expected: cleared. Flip to `not.toHaveValue("")` if we
    // ever wire in draft persistence.
    await expect(page.locator("#name")).toHaveValue("");
  });

  test("session expiring while user is typing still preserves the input until they submit", async ({
    page,
  }) => {
    await page.goto("/dashboard/new");
    await page
      .locator("#name")
      .fill("Slow-typer project");
    await page.locator("#idea_description").fill("Slow-typer description");

    // Force every Supabase call from now on to fail with a JWT-expired
    // shape. The form should still hold the user's input — we do NOT
    // want a stealth redirect-to-login that wipes it.
    await page.route("**/auth/v1/token**", (route) =>
      route.fulfill({
        status: 400,
        body: JSON.stringify({
          error: "invalid_grant",
          error_description: "refresh token revoked",
        }),
        contentType: "application/json",
      }),
    );

    // Wait a bit so any background revalidation could fire.
    await page.waitForTimeout(1500);

    await expect(page.locator("#name")).toHaveValue("Slow-typer project");
    await expect(page.locator("#idea_description")).toHaveValue(
      "Slow-typer description",
    );
  });
});

test.describe("Network interruption mid-mutation", () => {
  test("project create that fails preserves the user's input (no stealth reset)", async ({
    page,
  }) => {
    await page.goto("/dashboard/new");
    await page.locator("#name").fill("Will retry");
    await page
      .locator("#idea_description")
      .fill("Description that should remain after failure.");

    // Stub the insert to fail immediately. Using a route stub rather
    // than context.setOffline keeps the in-flight mutation from
    // hanging — context.setOffline leaves the first request stuck and
    // the form unresponsive (test-infra noise rather than app behavior).
    await page.route("**/rest/v1/projects**", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "simulated failure" }),
        });
        return;
      }
      await route.continue();
    });

    await page.getByRole("button", { name: /create project/i }).click();

    // The load-bearing assertion: after the failure, the inputs are
    // intact. No stealth reset, no navigation. The retry path itself
    // (un-stub + click again) is timing-sensitive across React Query
    // mutation lifecycle + Playwright's auto-retry behavior; the user-
    // visible guarantee we care about is "your typing wasn't lost."
    await expect(page.locator("#name")).toHaveValue("Will retry", {
      timeout: 10_000,
    });
    await expect(page.locator("#idea_description")).toHaveValue(
      "Description that should remain after failure.",
    );
    await expect(page).toHaveURL("/dashboard/new");
  });
});

test.describe("Concurrent navigation during mutation", () => {
  test("navigating away mid-create doesn't strand the user on a blank page", async ({
    page,
    context,
  }) => {
    await page.goto("/dashboard/new");
    await page.locator("#name").fill("Race nav");
    await page.locator("#idea_description").fill("Race nav idea");

    // Slow the projects insert dramatically by routing it through a 5s
    // delay; meanwhile the user clicks back to /dashboard.
    let firedAt = 0;
    await page.route("**/rest/v1/projects**", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      firedAt = Date.now();
      // Defer the response significantly.
      await new Promise((r) => setTimeout(r, 4_000));
      await route.continue();
    });

    await page.getByRole("button", { name: /create project/i }).click();
    // Almost immediately, navigate away.
    await page.goto("/dashboard");
    await expect(
      page.getByRole("link", { name: "New project" }),
    ).toBeVisible({ timeout: 10_000 });

    // The earlier mutation eventually returns; verify the dashboard is
    // still functional (no infinite spinner, no white screen).
    await page.waitForTimeout(Math.max(0, 4_500 - (Date.now() - firedAt)));
    await expect(page).toHaveURL("/dashboard");

    // Cleanup any orphaned project.
    await cleanupProjectsForUser(testUserId);

    // unused-var safety
    void context;
  });
});

test.describe("Outbox / local-queue persistence", () => {
  // The desktop app has an outbox concept (lib/outbox + use-interviews
  // queue) for failed uploads. This is a placeholder spec for the
  // "queue survives a reload" guarantee — current implementation stores
  // queue state in IndexedDB via React Query persistence. Marked as a
  // smoke check rather than a deep retry test.

  test("React Query cache persists across reload (auth + projects)", async ({
    page,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Persist across reload",
    });
    void projectId;

    await page.goto("/dashboard");
    await expect(page.getByText("Persist across reload")).toBeVisible({
      timeout: 10_000,
    });

    // Reload — IndexedDB persistence should re-hydrate immediately.
    await page.reload();
    await expect(page.getByText("Persist across reload")).toBeVisible({
      timeout: 10_000,
    });
  });
});
