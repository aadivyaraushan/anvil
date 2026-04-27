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

  test("B3 delete project — danger zone destroys row + cascades children", async ({
    page,
  }) => {
    await page.goto("/dashboard/new");
    await page.locator("#name").fill("Audit B3 to delete");
    await page.locator("#idea_description").fill("Delete me");
    await page.getByRole("button", { name: /create project/i }).click();
    await page.waitForURL(/\/project\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    const projectId = page.url().match(/\/project\/([0-9a-f-]{36})$/)![1];

    await page.goto(`/project/${projectId}/settings`);
    await expect(page.getByTestId("delete-project-open")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId("delete-project-open").click();

    // Type-to-confirm — must match the project name exactly.
    await page.getByTestId("delete-project-input").fill("Audit B3 to delete");
    await expect(page.getByTestId("delete-project-submit")).toBeEnabled();
    await page.getByTestId("delete-project-submit").click();

    await page.waitForURL("/dashboard", { timeout: 15_000 });

    const rows = await getProjectsForUser(testUserId);
    expect(rows.find((r) => r.id === projectId)).toBeUndefined();
  });

  test("B4 free-tier limit is enforced — 2nd create returns 422 + inline plan-limit banner", async ({
    page,
    request,
  }) => {
    // Free plan = 1 project (apps/desktop/src/lib/billing/plans.ts).
    // PR 1 wired apps/api/src/lib/billing/enforce.ts into POST /api/projects
    // so the 2nd attempt gets a 422 with `code: 'PLAN_LIMIT'` and the
    // dashboard/new form surfaces it inline via the upgrade banner.

    const sub = await getSubscription(testUserId);
    expect(sub?.plan).toBe("free");

    // First project — should succeed.
    await page.goto("/dashboard/new");
    await page.locator("#name").fill("Audit B4 first");
    await page.locator("#idea_description").fill("First project on free tier");
    await page.getByRole("button", { name: /create project/i }).click();
    await page.waitForURL(/\/project\/[0-9a-f-]{36}$/, { timeout: 15_000 });

    // Second project — should be blocked by the inline plan-limit banner.
    await page.goto("/dashboard/new");
    await page.locator("#name").fill("Audit B4 second");
    await page
      .locator("#idea_description")
      .fill("Second project — must be blocked on free tier");
    await page.getByRole("button", { name: /create project/i }).click();

    // Stay on /dashboard/new (no navigation) and show the structured
    // PLAN_LIMIT banner. This is the inline-error path, not a global toast.
    await expect(page).toHaveURL(/\/dashboard\/new/);
    await expect(page.getByTestId("plan-limit-banner")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("plan-limit-banner")).toContainText(/upgrade/i);

    // DB should still only have one project — the 422 must not have inserted.
    const rows = await getProjectsForUser(testUserId);
    expect(rows).toHaveLength(1);

    // Direct API probe: second POST returns 422 with the structured body.
    // (Done via request fixture so we can read the body without UI parsing.)
    const sb2 = await import("@supabase/supabase-js");
    const sbClient = sb2.createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { data: signin } = await sbClient.auth.signInWithPassword({
      email: process.env.E2E_TEST_EMAIL!,
      password: process.env.E2E_TEST_PASSWORD!,
    });
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
    const apiRes = await request.post(`${apiBase}/api/projects`, {
      headers: { Authorization: `Bearer ${signin?.session?.access_token}` },
      data: { name: "Audit B4 third", idea_description: "x", target_profile: "" },
    });
    expect(apiRes.status()).toBe(422);
    const body = (await apiRes.json()) as {
      code?: string;
      stage?: string;
      plan?: string;
    };
    expect(body.code).toBe("PLAN_LIMIT");
    expect(body.stage).toBe("project_create");
    expect(body.plan).toBe("free");
  });
});
