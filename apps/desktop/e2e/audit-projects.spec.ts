import { test, expect } from "@playwright/test";
import {
  cleanupProjectsForUser,
  getProjectsForUser,
  getSubscription,
  getUserIdByEmail,
  upsertSubscription,
} from "./helpers/db";

/**
 * Audit-pass coverage for project flows.
 *
 *   B1  Create project from /dashboard/new — assert `projects` row lands.
 *   B2  Edit project at /project/[id]/settings — assert updated fields persist.
 *   B3  Delete project — no UI surface, so we just verify the cleanup helper
 *       works (negative coverage that documents the missing UI).
 *   B4  Free-tier project limit — currently NOT enforced. The plan config
 *       at apps/desktop/src/lib/billing/plans.ts says `projects: 1` for
 *       free, but `withinLimit()` is never called outside unit tests.
 *       This spec asserts the *current* behavior (creation succeeds past
 *       the cap) so the test fails the day enforcement is added — that's
 *       the signal to flip the assertion.
 */

let testUserId: string;

test.beforeAll(async () => {
  const id = await getUserIdByEmail(process.env.E2E_TEST_EMAIL!);
  if (!id) throw new Error("E2E test user not found");
  testUserId = id;
  await upsertSubscription({ userId: id, plan: "free" });
});

test.afterEach(async () => {
  await cleanupProjectsForUser(testUserId);
});

test.describe("audit: projects (free plan)", () => {
  test("B1 create project — `projects` row lands with the expected fields", async ({
    page,
  }) => {
    await page.goto("/dashboard/new");
    await page.locator("#name").fill("Audit B1 project");
    await page
      .locator("#idea_description")
      .fill("Verify the projects row lands when the form is submitted.");

    await page.getByRole("button", { name: /create project/i }).click();
    await page.waitForURL(/\/project\/[0-9a-f-]{36}$/, { timeout: 15_000 });

    const rows = await getProjectsForUser(testUserId);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Audit B1 project");
    expect(rows[0].idea_description).toBe(
      "Verify the projects row lands when the form is submitted.",
    );
  });

  test("B2 edit project — settings form save persists to `projects` row", async ({
    page,
  }) => {
    // Seed via UI so the rest of the row is consistent with prod shape.
    await page.goto("/dashboard/new");
    await page.locator("#name").fill("Audit B2 original");
    await page.locator("#idea_description").fill("Original idea");
    await page.getByRole("button", { name: /create project/i }).click();
    await page.waitForURL(/\/project\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    const projectId = page.url().match(/\/project\/([0-9a-f-]{36})$/)![1];

    await page.goto(`/project/${projectId}/settings`);
    await expect(page.locator("#name")).toHaveValue("Audit B2 original", {
      timeout: 10_000,
    });
    await page.locator("#name").fill("Audit B2 edited");
    await page.locator("#idea_description").fill("Edited idea");
    await page.getByRole("button", { name: /save changes/i }).click();
    await expect(page.getByText("Saved.")).toBeVisible({ timeout: 10_000 });

    const rows = await getProjectsForUser(testUserId);
    const row = rows.find((r) => r.id === projectId)!;
    expect(row.name).toBe("Audit B2 edited");
    expect(row.idea_description).toBe("Edited idea");
  });

  test("B4 free-tier limit is NOT enforced (regression: locks in current behavior)", async ({
    page,
  }) => {
    // The user is on plan='free' (set in beforeAll). The plan config says
    // free = 1 project. The expected behavior is for the second creation
    // to be blocked with a structured 422; the actual behavior is that it
    // succeeds because no limit check exists in the codepath.
    //
    // When you add enforcement, this assertion will fail — flip it to
    // expect the second create to error and assert the structured detail.

    const sub = await getSubscription(testUserId);
    expect(sub?.plan).toBe("free");

    // First project — succeeds.
    await page.goto("/dashboard/new");
    await page.locator("#name").fill("Audit B4 first");
    await page.locator("#idea_description").fill("First project on free tier");
    await page.getByRole("button", { name: /create project/i }).click();
    await page.waitForURL(/\/project\/[0-9a-f-]{36}$/, { timeout: 15_000 });

    // Second project — currently also succeeds (BUG: should be blocked).
    await page.goto("/dashboard/new");
    await page.locator("#name").fill("Audit B4 second");
    await page
      .locator("#idea_description")
      .fill("Second project — should fail on free tier but currently succeeds");
    await page.getByRole("button", { name: /create project/i }).click();
    // If enforcement existed, we'd expect to stay on /dashboard/new with an
    // error. Today we expect navigation past the gate.
    await page.waitForURL(/\/project\/[0-9a-f-]{36}$/, { timeout: 15_000 });

    const rows = await getProjectsForUser(testUserId);
    expect(rows).toHaveLength(2);
    // FIXME: when free-tier enforcement lands, change to:
    //   expect(rows).toHaveLength(1);
    //   expect(page).toHaveURL(/\/dashboard\/new/);
    //   await expect(page.getByText(/upgrade.*to create/i)).toBeVisible();
  });
});
