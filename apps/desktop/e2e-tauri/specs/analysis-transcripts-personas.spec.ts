import { test, expect, restoreAuth } from "../fixtures";
import {
  cleanupProjectsForUser,
  getAnalystDocument,
  getInterviewsForProject,
  getPersonasForProject,
  getProjectAnalysisState,
  getUserIdByEmail,
  seedAnalystDocument,
  seedInterview,
  seedPersona,
  seedProject,
  upsertSubscription,
} from "../helpers/db";
import {
  clickByText,
  clickSelector,
  currentPath,
  visibleText,
  waitForSelector,
} from "../helpers/dom";

const devUrl = process.env.ANVIL_E2E_DEV_URL ?? "http://localhost:3000";

const transcriptOne = [
  {
    speaker: "Participant",
    text: "We spend three days every month closing the books.",
    timestamp: 1_000,
  },
  {
    speaker: "Interviewer",
    text: "What slows that down the most?",
    timestamp: 4_000,
  },
];

const transcriptTwo = [
  {
    speaker: "Participant",
    text: "I have to check four different dashboards before making a call.",
    timestamp: 2_000,
  },
];

test.describe("@built analysis, transcripts, and personas", () => {
  let userId: string;

  test.beforeAll(async () => {
    const id = await getUserIdByEmail(process.env.E2E_TEST_EMAIL!);
    if (!id) throw new Error("E2E test user not found - check global-setup");
    userId = id;
    await upsertSubscription({ userId, plan: "free" });
  });

  test.beforeEach(async ({ tauriPage }) => {
    await cleanupProjectsForUser(userId);
    await restoreAuth(tauriPage);
  });

  test.afterEach(async () => {
    await cleanupProjectsForUser(userId);
  });

  test("completed transcript, findings, customer language, and personas render after reload", async ({
    tauriPage,
  }) => {
    const projectId = await seedProject({
      userId,
      name: "Built Insight Persistence",
      ideaDescription: "A finance workflow research project.",
      targetProfile: "Finance leaders",
    });
    const interviewId = await seedInterview({
      projectId,
      attendeeName: "Morgan Transcript",
      status: "completed",
      transcript: transcriptOne,
      uploadStatus: "done",
      recordingPath: `${userId}/${projectId}/recording.wav`,
    });
    await seedAnalystDocument({
      projectId,
      painPoints: [
        {
          title: "Manual reporting consumes days",
          severity: "high",
          count: 2,
          example_quote: "closing the books",
          example_source: interviewId,
        },
      ],
      keyQuotes: [
        {
          quote: "We spend three days every month closing the books.",
          interview_id: interviewId,
        },
      ],
      customerLanguage: ["closing the books", "monthly close"],
      saturationScore: 60,
      interviewCount: 1,
      uniquePatternCount: 1,
    });
    await seedPersona({
      projectId,
      name: "Confirmed Finance Lead",
      status: "confirmed",
      painPoints: ["Manual reporting consumes days"],
    });

    for (let i = 0; i < 2; i += 1) {
      await tauriPage.goto(`${devUrl}/project/${projectId}`);
      await clickSelector(tauriPage, `[data-testid="interview-row-${interviewId}"]`);
      await expect.poll(() => visibleText(tauriPage)).toContain(
        "We spend three days every month closing the books."
      );
      await expect.poll(() => visibleText(tauriPage)).toContain("Manual reporting consumes days");
      await expect.poll(() => visibleText(tauriPage)).toContain("closing the books");
      await expect.poll(() => visibleText(tauriPage)).toContain("Confirmed Finance Lead");
    }
  });

  test("native recording keeps visible transcript while recording and preserves it after stop", async ({
    tauriPage,
  }) => {
    const projectId = await seedProject({ userId, name: "Built Transcript Recording" });
    const interviewId = await seedInterview({
      projectId,
      attendeeName: "Live Transcript Person",
      status: "scheduled",
      transcript: transcriptOne,
    });

    await tauriPage.goto(`${devUrl}/project/${projectId}`);
    await clickSelector(tauriPage, `[data-testid="interview-row-${interviewId}"]`);
    await clickSelector(tauriPage, '[data-testid="start-recording-button"]');
    await waitForSelector(tauriPage, '[data-testid="stop-recording-button"]');
    await expect.poll(() => visibleText(tauriPage)).toContain("Recording");
    await expect.poll(() => visibleText(tauriPage)).toContain(
      "We spend three days every month closing the books."
    );

    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await clickSelector(tauriPage, '[data-testid="stop-recording-button"]');
    await expect
      .poll(async () => {
        const row = (await getInterviewsForProject(projectId)).find((r) => r.id === interviewId);
        return row?.recording_path ?? null;
      }, { timeout: 30_000 })
      .toMatch(/\.wav$/);

    const row = (await getInterviewsForProject(projectId)).find((r) => r.id === interviewId);
    expect(row?.transcript).toEqual(transcriptOne);

    await tauriPage.goto(`${devUrl}/project/${projectId}`);
    await clickSelector(tauriPage, `[data-testid="interview-row-${interviewId}"]`);
    await expect.poll(() => visibleText(tauriPage)).toContain(
      "We spend three days every month closing the books."
    );
  });

  test("run analysis synthesizes findings and proposes customer personas in the built app", async ({
    tauriPage,
  }) => {
    const projectId = await seedProject({
      userId,
      name: "Built Analyst Run",
      ideaDescription: "Automated finance reporting",
      targetProfile: "Finance and operations leaders",
    });
    await seedInterview({
      projectId,
      attendeeName: "Finance One",
      status: "completed",
      transcript: transcriptOne,
      uploadStatus: "done",
    });
    await seedInterview({
      projectId,
      attendeeName: "Finance Two",
      status: "completed",
      transcript: transcriptTwo,
      uploadStatus: "done",
    });

    await tauriPage.goto(`${devUrl}/project/${projectId}`);
    await expect
      .poll(() =>
        tauriPage.evaluate<boolean>(
          `(() => {
            const button = Array.from(document.querySelectorAll('button'))
              .find((el) => (el.textContent ?? '').toLowerCase().includes('run analysis'));
            return !!button && !button.disabled;
          })()`
        )
      )
      .toBe(true);
    await clickByText(tauriPage, "button", "Run analysis");

    await expect
      .poll(async () => getProjectAnalysisState(projectId), { timeout: 45_000 })
      .toMatchObject({ analyst_status: "complete", analyst_run_count: 1 });
    await expect
      .poll(async () => {
        const doc = await getAnalystDocument(projectId);
        return Array.isArray(doc?.pain_points) ? doc?.pain_points.length : 0;
      }, { timeout: 15_000 })
      .toBeGreaterThan(0);
    await expect
      .poll(async () => (await getPersonasForProject(projectId)).map((p) => p.name), {
        timeout: 15_000,
      })
      .toContain("The Overwhelmed Finance Lead");

    await tauriPage.goto(`${devUrl}/project/${projectId}`);
    await expect.poll(() => visibleText(tauriPage)).toContain(
      "Manual monthly reporting consumes multiple days"
    );
    await expect.poll(() => visibleText(tauriPage)).toContain("closing the books");
    await expect.poll(() => visibleText(tauriPage)).toContain("The Overwhelmed Finance Lead");
  });

  test("suggested customer persona can be confirmed and persists between built app visits", async ({
    tauriPage,
  }) => {
    const projectId = await seedProject({ userId, name: "Built Persona Confirm" });
    await seedPersona({
      projectId,
      name: "Suggested Operator",
      description: "Needs one source of truth for customer data.",
      jobTitles: ["Director of Operations"],
      painPoints: ["Brittle dashboards"],
      status: "suggested",
    });

    await tauriPage.goto(`${devUrl}/project/${projectId}`);
    await expect.poll(() => visibleText(tauriPage)).toContain("Suggested Operator");
    await clickByText(tauriPage, "a", "Edit");
    await expect.poll(() => currentPath(tauriPage)).toBe(`/project/${projectId}/archetypes`);
    await clickByText(tauriPage, "button", "Confirm");
    await clickByText(tauriPage, "button", "Save archetypes");

    await expect
      .poll(async () => {
        const personas = await getPersonasForProject(projectId);
        return personas.find((p) => p.name === "Suggested Operator")?.status ?? null;
      })
      .toBe("confirmed");

    await tauriPage.goto(`${devUrl}/project/${projectId}`);
    await expect.poll(() => visibleText(tauriPage)).toContain("Suggested Operator");
    await expect.poll(() => visibleText(tauriPage)).not.toContain("Edit →");
  });
});
