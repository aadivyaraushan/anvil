import { test, expect, restoreAuth } from "../fixtures";
import {
  getUserIdByEmail,
  seedProject,
  seedInterview,
  cleanupProjectsForUser,
  getInterviewsForProject,
} from "../helpers/db";

async function clickSelector(tauriPage: Parameters<typeof restoreAuth>[0], selector: string) {
  await expect
    .poll(
      () =>
        tauriPage.evaluate<boolean>(
          `(() => !!document.querySelector(${JSON.stringify(selector)}))()`
        ),
      { timeout: 15_000 }
    )
    .toBe(true);
  await tauriPage.evaluate(
    `(() => {
       const el = document.querySelector(${JSON.stringify(selector)});
       if (!el) throw new Error('missing selector: ${selector}');
       el.click();
     })()`
  );
}

// The headline test the harness was built for: the real WKWebView starts a
// recording from the conversation page, Rust captures a WAV via cpal, and the
// existing interview row gets a recording_path after upload. Browser
// Playwright cannot exercise that native boundary.

test.describe("recording (real Tauri WKWebView + cpal)", () => {
  let userId: string;
  let projectId: string;
  let interviewId: string;

  test.beforeAll(async () => {
    const id = await getUserIdByEmail(process.env.E2E_TEST_EMAIL!);
    if (!id) throw new Error("E2E test user not found — check global-setup");
    userId = id;
    await cleanupProjectsForUser(userId);
    projectId = await seedProject({ userId, name: "Tauri Recording Test" });
    interviewId = await seedInterview({
      projectId,
      attendeeName: "Tauri E2E",
      source: "inperson",
    });
  });

  test.beforeEach(async ({ tauriPage }) => {
    await restoreAuth(tauriPage);
  });

  test("conversation page Start recording to Stop writes recording_path", async ({
    tauriPage,
  }) => {
    await tauriPage.goto(`${process.env.ANVIL_E2E_DEV_URL ?? "http://localhost:3000"}/project/${projectId}`);
    await clickSelector(tauriPage, `[data-testid="interview-row-${interviewId}"]`);
    await clickSelector(tauriPage, '[data-testid="start-recording-button"]');

    await new Promise((r) => setTimeout(r, 1_500));

    await clickSelector(tauriPage, '[data-testid="stop-recording-button"]');

    // The page uploads the WAV to /api/interviews/upload and appends it to
    // the same conversation row.
    await expect
      .poll(
        async () => {
          const rows = await getInterviewsForProject(projectId);
          return rows.find((row) => row.id === interviewId)?.recording_path ?? null;
        },
        { timeout: 30_000, message: "recording_path never appeared" }
      )
      .toMatch(/\.wav$/);

    const row = (await getInterviewsForProject(projectId)).find(
      (candidate) => candidate.id === interviewId,
    );
    expect(row?.recording_path).toContain(`/${projectId}/${interviewId}/`);
  });

  test.afterAll(async () => {
    await cleanupProjectsForUser(userId);
  });
});
