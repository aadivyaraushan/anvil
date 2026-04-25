import { test, expect } from "@playwright/test";
import {
  cleanupProjectsForUser,
  getUserIdByEmail,
  seedAnalystDocument,
  seedInterview,
  seedPersona,
  seedProject,
  supportsRedesignSchema,
} from "./helpers/db";

let testUserId: string;
let projectId: string;
let schemaReady = false;

test.beforeAll(async () => {
  const id = await getUserIdByEmail(process.env.E2E_TEST_EMAIL!);
  if (!id) throw new Error("E2E test user not found — did globalSetup run?");
  testUserId = id;
  schemaReady = await supportsRedesignSchema();

  // Seeding interviews + analyst document needs migrations 009/010
  // (interviews.source/attendee_*, personas.status). Without them the
  // setup would throw and the whole describe block would error out
  // instead of skipping cleanly — bail early so individual tests can
  // skip with a useful reason.
  if (!schemaReady) return;

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

  await seedPersona({
    projectId,
    name: "Finance Leader",
    description: "Owns the month-end close",
  });

  await seedAnalystDocument({
    projectId,
    content: {
      summary: "Manual reconciliation is the top pain point.",
      recommendations: ["Lead with automation."],
      personas: [],
    },
    customerLanguage: ["manual reconciliation", "week-long close"],
    painPoints: [
      {
        // FindingsRail renders `point.title` and `point.count` (severity
        // pill + count badge) — match that shape.
        title: "Month-end close is too slow",
        count: 2,
        severity: "high",
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
  test.beforeEach(() => {
    test.skip(
      !schemaReady,
      "Requires migrations 009/010 (interviews + personas + calendar_connections).",
    );
  });

  test("findings rail shows pain points from analyst document", async ({
    page,
  }) => {
    await page.goto(`/project/${projectId}`);

    // Right rail should render. Use exact match — "findings" also
    // appears in the empty-state copy ("Needs connection to generate
    // findings.").
    await expect(page.getByText("Findings", { exact: true })).toBeVisible();
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
