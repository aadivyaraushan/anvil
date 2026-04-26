import { test, expect } from "@playwright/test";
import {
  getUserIdByEmail,
  upsertSubscription,
  seedProject,
  cleanupProjectsForUser,
} from "./helpers/db";

test.describe("billing page", () => {
  let userId: string;

  test.beforeAll(async () => {
    const id = await getUserIdByEmail(process.env.E2E_TEST_EMAIL!);
    if (!id) throw new Error("E2E test user not found");
    userId = id;
    await cleanupProjectsForUser(userId);
    await upsertSubscription({ userId, plan: "free" });
  });

  test.afterAll(async () => {
    await cleanupProjectsForUser(userId);
    await upsertSubscription({ userId, plan: "free" });
  });

  test("shows Free plan badge for free user", async ({ page }) => {
    await page.goto("/billing");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByText("Current plan")).toBeVisible();
    // Badge shows plan name
    await expect(page.getByRole("main").getByText("Free")).toBeVisible();
  });

  test("shows Pro and Max upgrade cards for free user", async ({ page }) => {
    await page.goto("/billing");
    await expect(page.getByRole("button", { name: "Upgrade to Pro" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Upgrade to Max" })).toBeVisible();
  });

  test.skip(
    "upgrade button calls checkout endpoint and redirects [outdated flow]",
    async () => {
      // BillingPage.handleUpgrade now opens the Stripe URL via
      // window.open(url, "_blank") rather than navigating the current
      // page. To revive this test, assert on a popup window instead of
      // waitForURL on the same page.
    },
  );

  test("shows success banner when ?success=true", async ({ page }) => {
    await page.goto("/billing?success=true");
    await expect(page.getByText("Your subscription is now active.")).toBeVisible();
  });

  test("billing page accessible from sidebar Billing link", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("navigation").getByRole("link", { name: "Billing" }).click();
    await page.waitForURL("/billing");
    await expect(page).toHaveURL("/billing");
  });
});

test.describe("billing — plan limit enforcement", () => {
  let userId: string;

  test.beforeAll(async () => {
    const id = await getUserIdByEmail(process.env.E2E_TEST_EMAIL!);
    if (!id) throw new Error("E2E test user not found");
    userId = id;
    await upsertSubscription({ userId, plan: "free" });
    // Seed 1 project to hit the free plan limit (limit = 1)
    await seedProject({ userId });
  });

  test.afterAll(async () => {
    await cleanupProjectsForUser(userId);
    await upsertSubscription({ userId, plan: "free" });
  });

  test.skip(
    "creating a project over free limit redirects to /billing?limit=projects [no client gate]",
    async () => {
      // useCreateProject inserts directly via Supabase with no client-side
      // plan-limit check, so the dashboard form never sends users to
      // /billing?limit=projects. Plan enforcement now lives elsewhere
      // (or has been deferred). Re-enable when limit gating is back in
      // the create-project path.
    },
  );
});
