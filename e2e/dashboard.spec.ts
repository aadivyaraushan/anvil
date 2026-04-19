import { test, expect } from "@playwright/test";
import { getUserIdByEmail, cleanupProjectsForUser } from "./helpers/db";

test.describe("dashboard", () => {
  test("shows dashboard heading and New project button", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Projects" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "New project" })
    ).toBeVisible();
  });

  test("clicking New project navigates to /dashboard/new", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "New project" }).click();
    await page.waitForURL("/dashboard/new");
    await expect(page).toHaveURL("/dashboard/new");
  });

  test("new-project form renders all required fields", async ({ page }) => {
    await page.goto("/dashboard/new");
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(
      page.locator('textarea[name="idea_description"]')
    ).toBeVisible();
    await expect(
      page.locator('textarea[name="target_profile"]')
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create project" })
    ).toBeVisible();
  });

  test("submitting the form redirects to /project/:id", async ({ page }) => {
    await page.goto("/dashboard/new");

    await page.locator('input[name="name"]').fill("E2E Playwright Test Project");
    await page.locator('textarea[name="idea_description"]').fill(
      "A Playwright E2E test project for validating the creation flow."
    );
    await page.locator('textarea[name="target_profile"]').fill(
      "QA engineers at mid-stage startups"
    );

    await page.getByRole("button", { name: "Create project" }).click();

    // Server Action calls redirect() → browser lands on /project/<uuid>
    await page.waitForURL(/\/project\/[0-9a-f-]{36}/, { timeout: 20_000 });
    expect(page.url()).toMatch(/\/project\/[0-9a-f-]{36}/);

    // Cleanup: remove the test project
    const userId = await getUserIdByEmail(process.env.E2E_TEST_EMAIL!);
    if (userId) await cleanupProjectsForUser(userId);
  });
});
