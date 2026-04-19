import { test, expect } from "@playwright/test";
import {
  getUserIdByEmail,
  cleanupProjectsForUser,
  seedProject,
  seedContact,
  seedInterview,
} from "./helpers/db";

let testUserId: string;

test.beforeAll(async () => {
  const id = await getUserIdByEmail(process.env.E2E_TEST_EMAIL!);
  if (!id) throw new Error("E2E test user not found — did globalSetup run?");
  testUserId = id;
});

test.afterAll(async () => {
  await cleanupProjectsForUser(testUserId);
});

test.describe("workspace — three-column grid", () => {
  let projectId: string;

  test.beforeEach(async () => {
    projectId = await seedProject({
      userId: testUserId,
      name: "Workspace Project",
    });
  });

  test.afterEach(async () => {
    await cleanupProjectsForUser(testUserId);
  });

  test("renders all three column headers", async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await expect(
      page.getByRole("heading", { name: "Outreach" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Interviews" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Analyst" })
    ).toBeVisible();
  });

  test("Run Analyst button is disabled with no completed interviews", async ({
    page,
  }) => {
    await page.goto(`/project/${projectId}`);
    const runBtn = page.getByRole("button", { name: /Analyst/ });
    await expect(runBtn).toBeVisible();
    await expect(runBtn).toBeDisabled();
    await expect(
      page.getByText("Complete an interview first")
    ).toBeVisible();
  });

  test("Run Analyst button is enabled after completed interview seeded", async ({
    page,
  }) => {
    await page.route(`**/api/projects/${projectId}/analyst`, (route) => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ status: "started" }),
      });
    });

    const contactId = await seedContact({
      projectId,
      firstName: "Alice",
      lastName: "Tester",
      email: "alice-e2e@example.com",
    });
    await seedInterview({ projectId, contactId, status: "completed" });

    await page.goto(`/project/${projectId}`);
    await expect(
      page.getByRole("button", { name: /Analyst/ })
    ).toBeEnabled({ timeout: 10_000 });
    await expect(
      page.getByText("Complete an interview first")
    ).not.toBeVisible();
  });

  test("back arrow navigates to /dashboard", async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole("link").filter({ hasText: /←/ }).click();
    await page.waitForURL("/dashboard");
    await expect(page).toHaveURL("/dashboard");
  });

  test("Settings link navigates to settings page", async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole("main").getByRole("link", { name: "Settings" }).click();
    await page.waitForURL(`/project/${projectId}/settings`);
    await expect(page).toHaveURL(`/project/${projectId}/settings`);
  });
});
