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

  test("upgrade button calls checkout endpoint and redirects", async ({ page }) => {
    // Mock the checkout API to return a test URL
    await page.route("**/api/stripe/checkout", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "https://checkout.stripe.com/test" }),
      });
    });

    await page.goto("/billing");

    // Capture the POST body to verify plan is sent correctly
    let requestBody: Record<string, unknown> = {};
    await page.route("**/api/stripe/checkout", async (route) => {
      const body = route.request().postDataJSON();
      requestBody = body;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "/billing?success=true" }),
      });
    });

    await page.getByRole("button", { name: "Upgrade to Pro" }).click();
    await page.waitForURL("**/billing?success=true", { timeout: 10_000 });
    expect(requestBody.plan).toBe("pro");
  });

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

  test("creating a project over free limit redirects to /billing?limit=projects", async ({ page }) => {
    await page.goto("/dashboard/new");
    await page.locator('input[name="name"]').fill("Overflow Project");
    await page.locator('textarea[name="idea_description"]').fill("Testing plan limits.");
    await page.locator('textarea[name="target_profile"]').fill("QA engineers");
    await page.getByRole("button", { name: "Create project" }).click();

    await page.waitForURL(/\/billing\?limit=projects/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/billing\?limit=projects/);
    await expect(page.getByText(/reached your project limit/)).toBeVisible();
  });
});
