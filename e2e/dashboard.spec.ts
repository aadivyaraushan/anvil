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

  test("submitting the form redirects to archetype setup", async ({ page }) => {
    await page.route("**/api/projects/*/generate-archetypes", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          archetypes: [
            {
              name: "Finance leader",
              description: "Owns budget and tooling decisions.",
              job_titles: ["Head of Finance"],
              pain_points: ["Reporting is manual"],
            },
          ],
        }),
      });
    });

    await page.goto("/dashboard/new");

    await page.locator('input[name="name"]').fill("E2E Playwright Test Project");
    await page.locator('textarea[name="idea_description"]').fill(
      "A Playwright E2E test project for validating the creation flow."
    );
    await page.locator('textarea[name="target_profile"]').fill(
      "QA engineers at mid-stage startups"
    );

    await page.getByRole("button", { name: "Create project" }).click();

    await page.waitForURL(/\/project\/[0-9a-f-]{36}\/archetypes/, {
      timeout: 20_000,
    });
    expect(page.url()).toMatch(/\/project\/[0-9a-f-]{36}\/archetypes/);
    await expect(
      page.getByRole("heading", { name: "Who are your customers?" })
    ).toBeVisible();
    await expect(page.locator('input[value="Finance leader"]')).toBeVisible();
  });
});
