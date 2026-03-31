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

test.describe("workspace — build phase", () => {
  let projectId: string;

  test.beforeEach(async () => {
    projectId = await seedProject({
      userId: testUserId,
      name: "Build Phase Project",
      prototypeStatus: "generating",
    });
  });

  test.afterEach(async () => {
    await cleanupProjectsForUser(testUserId);
  });

  test("hides three-column grid when prototype is generating", async ({
    page,
  }) => {
    await page.route(`**/api/projects/${projectId}/prototype`, (route) => {
      route.fulfill({
        status: 409,
        body: JSON.stringify({ status: "already_running" }),
      });
    });

    await page.goto(`/project/${projectId}`);

    // Three-column grid must NOT be visible in build phase
    await expect(
      page.getByRole("heading", { name: "Discovery" })
    ).not.toBeVisible();
  });

  test("shows retry button when prototype_status is failed", async ({
    page,
  }) => {
    await cleanupProjectsForUser(testUserId);
    projectId = await seedProject({
      userId: testUserId,
      name: "Failed Build Project",
      prototypeStatus: "failed",
    });

    await page.route(`**/api/projects/${projectId}/prototype`, (route) => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ status: "started" }),
      });
    });

    await page.goto(`/project/${projectId}`);
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  });
});

test.describe("workspace — deployed phase (three-column grid)", () => {
  let projectId: string;

  test.beforeEach(async () => {
    projectId = await seedProject({
      userId: testUserId,
      name: "Deployed Project",
      prototypeStatus: "deployed",
    });
  });

  test.afterEach(async () => {
    await cleanupProjectsForUser(testUserId);
  });

  test("renders all three column headers", async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await expect(
      page.getByRole("heading", { name: "Discovery" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Interviews" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Synthesis" })
    ).toBeVisible();
  });

  test("Run Synthesis button is disabled with no completed interviews", async ({
    page,
  }) => {
    await page.goto(`/project/${projectId}`);
    const runBtn = page.getByRole("button", { name: "Run Synthesis" });
    await expect(runBtn).toBeVisible();
    await expect(runBtn).toBeDisabled();
    await expect(
      page.getByText("Complete an interview first")
    ).toBeVisible();
  });

  test("Run Synthesis button is enabled after completed interview seeded", async ({
    page,
  }) => {
    await page.route(`**/api/projects/${projectId}/synthesize`, (route) => {
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
      page.getByRole("button", { name: "Run Synthesis" })
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
    await page.getByRole("link", { name: "Settings" }).click();
    await page.waitForURL(`/project/${projectId}/settings`);
    await expect(page).toHaveURL(`/project/${projectId}/settings`);
  });
});
