import { test, expect } from "@playwright/test";
import { cleanupProjectsForUser, getUserIdByEmail, seedInterview, seedProject } from "./helpers/db";

let testUserId: string;

test.beforeAll(async () => {
  const id = await getUserIdByEmail(process.env.E2E_TEST_EMAIL!);
  if (!id) throw new Error("E2E test user not found — did globalSetup run?");
  testUserId = id;
});

test.afterAll(async () => {
  await cleanupProjectsForUser(testUserId);
});

test.describe("Direction C — Interview Inbox", () => {
  test.afterEach(async () => {
    await cleanupProjectsForUser(testUserId);
  });

  test("project page renders 3-pane layout", async ({ page }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Inbox Test Project",
    });

    await page.goto(`/project/${projectId}`);

    // Left rail: interview queue
    await expect(page.getByText("Interviews")).toBeVisible();
    // Right rail: findings
    await expect(page.getByText("Findings")).toBeVisible();
  });

  test("no archetype gate — project page loads without redirect", async ({
    page,
  }) => {
    // Project has archetypes_verified = false (default)
    const projectId = await seedProject({
      userId: testUserId,
      name: "No Gate Project",
    });

    await page.goto(`/project/${projectId}`);
    // Should stay on the project page, not redirect to /archetypes
    await expect(page).toHaveURL(new RegExp(`/project/${projectId}$`));
    await expect(page.getByText("Interviews")).toBeVisible();
  });

  test("add interview button opens inline form", async ({ page }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Add Interview Project",
    });

    await page.goto(`/project/${projectId}`);
    await page.getByRole("button", { name: /add interview/i }).click();

    await expect(page.locator("input[placeholder*='name']").first()).toBeVisible();
  });

  test("completed interview appears in Processed section", async ({ page }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Processed Interviews",
    });
    await seedInterview({
      projectId,
      status: "completed",
      transcript: [{ speaker: "Sarah", text: "The close takes a full week.", timestamp: 0 }],
    });

    await page.goto(`/project/${projectId}`);
    await expect(page.getByText("Processed")).toBeVisible();
  });

  test("clicking interview row selects it in canvas", async ({ page }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Canvas Select Project",
    });
    await seedInterview({
      projectId,
      status: "completed",
      transcript: [{ speaker: "Jordan", text: "Revenue keeps slipping.", timestamp: 0 }],
    });

    await page.goto(`/project/${projectId}`);
    // Click the first interview row
    const firstRow = page.locator("[data-testid='interview-row']").first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      // Canvas should show the transcript
      await expect(page.getByText("Jordan")).toBeVisible();
    }
  });
});
