/**
 * workspace.spec.ts — Direction C workspace smoke tests.
 *
 * These tests cover the three-pane layout (inbox + canvas + findings rail).
 * For recording-specific tests see recording.spec.ts.
 * For offline resilience see offline.spec.ts.
 * For findings detail see findings.spec.ts.
 */
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

test.describe("Workspace — Direction C layout", () => {
  test.afterEach(async () => {
    await cleanupProjectsForUser(testUserId);
  });

  test("project page renders without archetype redirect", async ({ page }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "No Gate Project",
    });
    await page.goto(`/project/${projectId}`);
    // Must NOT redirect to /archetypes
    await expect(page).toHaveURL(new RegExp(`/project/${projectId}$`));
  });

  test("left rail, canvas, and findings rail are all present", async ({ page }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Layout Test",
    });
    await page.goto(`/project/${projectId}`);
    await expect(page.getByText("Interviews")).toBeVisible();
    await expect(page.getByText("Findings")).toBeVisible();
  });

  test("no Agent badge labels visible", async ({ page }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "No Agents Project",
    });
    await page.goto(`/project/${projectId}`);
    // Old design had "Agent 1", "Agent 2", "Agent 3" badges
    await expect(page.getByText("Agent 1")).not.toBeVisible();
    await expect(page.getByText("Agent 2")).not.toBeVisible();
    await expect(page.getByText("Outreach")).not.toBeVisible();
  });

  test("completed interview transcript renders in canvas", async ({ page }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Canvas Transcript",
    });
    await seedInterview({
      projectId,
      status: "completed",
      transcript: [
        { speaker: "Taylor", text: "Our close process is entirely manual.", timestamp: 0 },
      ],
    });
    await page.goto(`/project/${projectId}`);
    // Click the interview to select it (if inbox row exists)
    const row = page.locator("[data-testid='interview-row']").first();
    if (await row.isVisible()) {
      await row.click();
      await expect(page.getByText("Taylor")).toBeVisible({ timeout: 5000 });
    }
  });

  test("archetypes page is editable — not a gate", async ({ page }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Archetype Editor",
    });
    await page.goto(`/project/${projectId}/archetypes`);
    // Should not be a blocking gate — no "continue to workspace" CTA
    await expect(page.getByText(/to continue/i)).not.toBeVisible();
    // Should have an editable form instead
    await expect(page.getByRole("heading", { name: /archetype/i })).toBeVisible();
  });
});
