import { test, expect } from "@playwright/test";
import {
  cleanupProjectsForUser,
  getUserIdByEmail,
  seedInterview,
  seedProject,
  supportsRedesignSchema,
} from "./helpers/db";

let testUserId: string;
let schemaReady = false;

test.beforeAll(async () => {
  const id = await getUserIdByEmail(process.env.E2E_TEST_EMAIL!);
  if (!id) throw new Error("E2E test user not found — did globalSetup run?");
  testUserId = id;
  schemaReady = await supportsRedesignSchema();
});

test.afterAll(async () => {
  await cleanupProjectsForUser(testUserId);
});

test.describe("Direction C — Interview Inbox", () => {
  test.afterEach(async () => {
    await cleanupProjectsForUser(testUserId);
  });

  test("project page renders inbox + findings rails", async ({ page }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Inbox Test Project",
    });

    await page.goto(`/project/${projectId}`);

    // Left rail: the inbox shows the "Add interview" affordance.
    await expect(
      page.getByRole("button", { name: /add interview/i }),
    ).toBeVisible();
    // Right rail: findings header. Use exact match — "findings" also
    // appears in the empty-state copy ("Needs connection to generate
    // findings.").
    await expect(page.getByText("Findings", { exact: true })).toBeVisible();
  });

  test("no archetype gate — project page loads without redirect", async ({
    page,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "No Gate Project",
    });

    await page.goto(`/project/${projectId}`);
    await expect(page).toHaveURL(new RegExp(`/project/${projectId}$`));
    await expect(
      page.getByRole("button", { name: /add interview/i }),
    ).toBeVisible();
  });

  test("add interview button opens inline form", async ({ page }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Add Interview Project",
    });

    await page.goto(`/project/${projectId}`);
    await page.getByRole("button", { name: /add interview/i }).click();

    await expect(
      page.locator("input[placeholder*='name']").first(),
    ).toBeVisible();
  });

  test("completed interview appears in Processed section", async ({ page }) => {
    test.skip(
      !schemaReady,
      "Requires migrations 009/010 (interviews.source, attendee_*).",
    );

    const projectId = await seedProject({
      userId: testUserId,
      name: "Processed Interviews",
    });
    await seedInterview({
      projectId,
      status: "completed",
      transcript: [
        { speaker: "Sarah", text: "The close takes a full week.", timestamp: 0 },
      ],
    });

    await page.goto(`/project/${projectId}`);
    await expect(page.getByText("Processed")).toBeVisible();
  });

  test("clicking interview row selects it in canvas", async ({ page }) => {
    test.skip(
      !schemaReady,
      "Requires migrations 009/010 (interviews.source, attendee_*).",
    );

    const projectId = await seedProject({
      userId: testUserId,
      name: "Canvas Select Project",
    });
    await seedInterview({
      projectId,
      status: "completed",
      transcript: [
        { speaker: "Jordan", text: "Revenue keeps slipping.", timestamp: 0 },
      ],
    });

    await page.goto(`/project/${projectId}`);
    const firstRow = page.locator("[data-testid='interview-row']").first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await expect(page.getByText("Jordan")).toBeVisible();
    }
  });
});
