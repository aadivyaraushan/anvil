import { test, expect } from "@playwright/test";
import { getUserIdByEmail, cleanupProjectsForUser } from "./helpers/db";

let testUserId: string;

test.beforeAll(async () => {
  const id = await getUserIdByEmail(process.env.E2E_TEST_EMAIL!);
  if (!id) throw new Error("E2E test user not found");
  testUserId = id;
});

test.afterEach(async () => {
  await cleanupProjectsForUser(testUserId);
});

test.describe("dashboard", () => {
  test("shows dashboard chrome with New project button", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL("/dashboard");
    await expect(
      page.getByRole("link", { name: "New project" }),
    ).toBeVisible();
  });

  test("clicking New project navigates to /dashboard/new", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "New project" }).click();
    await page.waitForURL("/dashboard/new");
    await expect(page).toHaveURL("/dashboard/new");
  });

  test("new-project form renders required fields", async ({ page }) => {
    await page.goto("/dashboard/new");
    await expect(page.locator("#name")).toBeVisible();
    await expect(page.locator("#idea_description")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /create project/i }),
    ).toBeVisible();
  });

  test("submitting the form creates a project and routes to its workspace", async ({
    page,
  }) => {
    await page.goto("/dashboard/new");
    await page.locator("#name").fill("E2E Playwright Test Project");
    await page
      .locator("#idea_description")
      .fill("A Playwright E2E test project for validating the creation flow.");

    await page.getByRole("button", { name: /create project/i }).click();

    // The current flow goes straight to /project/{id} (the archetypes-first
    // gating from the previous design was removed in 5d9743b).
    await page.waitForURL(/\/project\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    expect(page.url()).toMatch(/\/project\/[0-9a-f-]{36}$/);
  });
});
