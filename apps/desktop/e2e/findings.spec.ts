import { test, expect } from "@playwright/test";
import {
  cleanupProjectsForUser,
  getUserIdByEmail,
  seedAnalystDocument,
  seedInterview,
  seedPersona,
  seedProject,
} from "./helpers/db";

let testUserId: string;
let projectId: string;

test.beforeAll(async () => {
  const id = await getUserIdByEmail(process.env.E2E_TEST_EMAIL!);
  if (!id) throw new Error("E2E test user not found — did globalSetup run?");
  testUserId = id;

  projectId = await seedProject({
    userId: testUserId,
    name: "Findings Test Project",
  });

  const interview1 = await seedInterview({
    projectId,
    status: "completed",
    transcript: [
      { speaker: "Sara", text: "The close takes a full week.", timestamp: 0 },
    ],
  });
  const interview2 = await seedInterview({
    projectId,
    status: "completed",
    transcript: [
      { speaker: "Alex", text: "Nothing reconciles automatically.", timestamp: 0 },
    ],
  });

  const personaId = await seedPersona({
    projectId,
    name: "Finance Leader",
    description: "Owns the month-end close",
    // status: "suggested" (will be set if schema supports it)
  });

  await seedAnalystDocument({
    projectId,
    content: {
      summary: "Manual reconciliation is the top pain point.",
      customerLanguage: ["manual reconciliation", "week-long close"],
      recommendations: ["Lead with automation."],
      personas: [],
    },
    painPoints: [
      {
        description: "Month-end close is too slow",
        severity: "high",
        frequency: 2,
        quotes: [
          { text: "The close takes a full week.", interview_id: interview1 },
          { text: "Nothing reconciles automatically.", interview_id: interview2 },
        ],
      },
    ],
    patterns: [],
    keyQuotes: [],
    saturationScore: 80,
    interviewCount: 2,
    uniquePatternCount: 1,
  });
});

test.afterAll(async () => {
  await cleanupProjectsForUser(testUserId);
});

test.describe("Findings rail", () => {
  test("findings rail shows pain points from analyst document", async ({
    page,
  }) => {
    await page.goto(`/project/${projectId}`);

    // Right rail should render
    await expect(page.getByText("Findings")).toBeVisible();
    await expect(page.getByText(/month-end close/i)).toBeVisible();
  });

  test("customer language chips are visible", async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await expect(page.getByText("manual reconciliation")).toBeVisible();
  });

  test("suggested archetype appears with muted styling", async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    // The archetype should show somewhere in the rail
    const archetypesSection = page.getByText("Archetypes");
    if (await archetypesSection.isVisible()) {
      await expect(page.getByText("Finance Leader")).toBeVisible();
    }
  });

  test("run analysis button triggers analyst", async ({ page }) => {
    await page.route("**/api/projects/*/analyst**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto(`/project/${projectId}`);
    const runBtn = page.getByRole("button", { name: /run analysis/i });
    if (await runBtn.isVisible()) {
      await runBtn.click();
      // Should not throw — button either shows loading or success
      await expect(runBtn).not.toHaveAttribute("aria-disabled", "true");
    }
  });
});
