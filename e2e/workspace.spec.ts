import { test, expect } from "@playwright/test";
import {
  cleanupProjectsForUser,
  getUserIdByEmail,
  seedAnalystDocument,
  seedContact,
  seedInterview,
  seedPersona,
  seedProject,
  supportsRedesignSchema,
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

test.describe("workspace — redesigned customer intelligence flow", () => {
  test.afterEach(async () => {
    await cleanupProjectsForUser(testUserId);
  });

  test("redirects unverified projects to archetype setup", async ({ page }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Unverified Project",
    });

    await page.route("**/api/projects/*/generate-archetypes", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          archetypes: [
            {
              name: "Operations lead",
              description: "Runs the team and needs clearer reporting.",
              job_titles: ["COO"],
              pain_points: ["Too many manual handoffs"],
            },
          ],
        }),
      });
    });

    await page.goto(`/project/${projectId}`);
    await page.waitForURL(`/project/${projectId}/archetypes`);
    await expect(
      page.getByRole("heading", { name: "Who are your customers?" })
    ).toBeVisible();
    await expect(page.locator('input[value="Operations lead"]')).toBeVisible();
  });

  test("renders the verified workspace with persona chips and column headers", async ({
    page,
  }) => {
    test.skip(
      !(await supportsRedesignSchema()),
      "Connected Supabase project is missing the redesign migrations."
    );

    const projectId = await seedProject({
      userId: testUserId,
      name: "Verified Workspace",
      archetypesVerified: true,
    });
    await seedPersona({
      projectId,
      name: "Finance leader",
      description: "Owns purchasing decisions for finance tooling.",
    });
    await seedPersona({
      projectId,
      name: "RevOps manager",
      description: "Keeps GTM systems aligned.",
    });

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
    await expect(page.getByRole("button", { name: "Archetypes" })).toBeVisible();
    await expect(page.getByText("Finance leader")).toBeVisible();
    await expect(page.getByText("RevOps manager")).toBeVisible();
  });

  test("imports a CSV export and shows the imported profile in outreach", async ({
    page,
  }) => {
    test.skip(
      !(await supportsRedesignSchema()),
      "Connected Supabase project is missing the redesign migrations."
    );

    const projectId = await seedProject({
      userId: testUserId,
      name: "Import Workspace",
      archetypesVerified: true,
    });
    await seedPersona({
      projectId,
      name: "Finance leader",
    });

    await page.goto(`/project/${projectId}`);

    await page.locator('input[type="file"]').setInputFiles({
      name: "linkedin-export.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        [
          "Name,Email,Title,Company,LinkedIn URL,Industry,Location",
          "Taylor Rivera,taylor@example.com,VP Finance,Northstar,https://linkedin.com/in/taylor,Software,Chicago",
        ].join("\n")
      ),
    });

    await expect(page.getByText("Imported 1 profile.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Taylor Rivera")).toBeVisible();
    await expect(page.getByText("VP Finance")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Score Imported Profiles" })
    ).toBeVisible();
  });

  test("schedules a persona-linked interview from the interviews page", async ({
    page,
  }) => {
    test.skip(
      !(await supportsRedesignSchema()),
      "Connected Supabase project is missing the redesign migrations."
    );

    const projectId = await seedProject({
      userId: testUserId,
      name: "Interview Workspace",
      archetypesVerified: true,
    });
    const personaId = await seedPersona({
      projectId,
      name: "Ops leader",
    });
    const contactId = await seedContact({
      projectId,
      personaId,
      firstName: "Jamie",
      lastName: "Lopez",
      email: "jamie@example.com",
      title: "VP Operations",
      company: "Northstar",
    });

    await page.goto(`/project/${projectId}/interviews`);
    await page.getByRole("button", { name: "Schedule Interview" }).click();

    await page.locator("select").nth(0).selectOption(contactId);
    await expect(page.locator("select").nth(1)).toHaveValue(personaId);
    await page.locator('input[placeholder="Meeting link"]').fill(
      "https://meet.google.com/test-room"
    );
    await page.locator('input[type="datetime-local"]').fill("2026-04-20T10:30");
    await page.getByRole("button", { name: "Save" }).click();

    const interviewsMain = page.getByRole("main");
    await expect(interviewsMain.getByText("Ops leader")).toBeVisible();
    await expect(
      interviewsMain.getByRole("button", { name: "Open", exact: true })
    ).toBeVisible();
    await expect(interviewsMain.getByText("0 transcript chunks")).toBeVisible();
  });

  test("shows persona-specific analyst evidence in the workspace", async ({
    page,
  }) => {
    test.skip(
      !(await supportsRedesignSchema()),
      "Connected Supabase project is missing the redesign migrations."
    );

    const projectId = await seedProject({
      userId: testUserId,
      name: "Analyst Workspace",
      archetypesVerified: true,
    });
    const personaId = await seedPersona({
      projectId,
      name: "Finance leader",
      description: "Runs strategic finance and reporting.",
    });
    const contactId = await seedContact({
      projectId,
      personaId,
      firstName: "Morgan",
      lastName: "Lee",
      email: "morgan@example.com",
      title: "Head of Finance",
      company: "Northstar",
      fitScore: 91,
      fitStatus: "passed",
      outreachStatus: "drafted",
      researchBrief: {
        fit_rationale: "Strong reporting pain and budget ownership.",
      },
      emailDraft: "Morgan, your team should not have to reconcile reports by hand.",
    });
    const interviewId = await seedInterview({
      projectId,
      contactId,
      personaId,
      status: "completed",
      transcript: [
        {
          speaker: "Morgan",
          text: "We spend days reconciling data before every board meeting.",
          timestamp: 0,
        },
      ],
      suggestedQuestions: ["What breaks before board meetings?"],
    });

    await seedAnalystDocument({
      projectId,
      content: {
        summary: "Finance leaders consistently describe slow, manual reporting.",
        customerLanguage: ["board prep", "manual reconciliation"],
        recommendations: ["Lead with faster month-end reporting."],
        personas: [
          {
            personaId,
            personaName: "Finance leader",
            summary: "Finance leaders need cleaner reporting before every exec review.",
            painPoints: [
              {
                description: "Board prep takes too long",
                severity: "high",
                frequency: 1,
                quotes: [
                  {
                    text: "We spend days reconciling data before every board meeting.",
                    contact_id: contactId,
                    interview_id: interviewId,
                  },
                ],
              },
            ],
            customerLanguage: ["board prep", "manual reconciliation"],
            keyQuotes: [
              {
                quote: "We spend days reconciling data before every board meeting.",
                contact_id: contactId,
                interview_id: interviewId,
              },
            ],
            saturationScore: 72,
            interviewCount: 1,
            prospectCount: 1,
            recommendations: ["Lead with faster month-end reporting."],
          },
        ],
      },
      painPoints: [
        {
          description: "Board prep takes too long",
          severity: "high",
          frequency: 1,
          quotes: [
            {
              text: "We spend days reconciling data before every board meeting.",
              contact_id: contactId,
              interview_id: interviewId,
            },
          ],
        },
      ],
      patterns: [
        {
          name: "Manual reporting",
          description: "Teams still patch together spreadsheets before reviews.",
          interviewIds: [interviewId],
        },
      ],
      keyQuotes: [
        {
          quote: "We spend days reconciling data before every board meeting.",
          contact_id: contactId,
          interview_id: interviewId,
        },
      ],
      saturationScore: 72,
      interviewCount: 1,
      uniquePatternCount: 1,
    });

    await page.goto(`/project/${projectId}`);
    await expect(
      page.getByRole("button", { name: "Finance leader" })
    ).toBeVisible();
    await page.getByRole("button", { name: "Finance leader" }).click();

    await expect(page.getByText("Matched prospects")).toBeVisible();
    await expect(page.getByText("Archetype Summary")).toBeVisible();
    await expect(
      page.getByText("Finance leaders need cleaner reporting before every exec review.")
    ).toBeVisible();
    await expect(page.getByText("Board prep takes too long")).toBeVisible();
    await expect(page.getByText("manual reconciliation")).toBeVisible();
    await expect(
      page.getByText("Lead with faster month-end reporting.")
    ).toBeVisible();
  });
});
