import { test, expect, restoreAuth } from "../fixtures";
import {
  getUserIdByEmail,
  seedProject,
  seedInterview,
  cleanupProjectsForUser,
  getInterviewsForProject,
} from "../helpers/db";
import { clickSelector, visibleText } from "../helpers/dom";
import { invoke } from "../helpers/ipc";

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
  });

  test.beforeEach(async ({ tauriPage }) => {
    await cleanupProjectsForUser(userId);
    projectId = await seedProject({ userId, name: "Tauri Recording Test" });
    interviewId = await seedInterview({
      projectId,
      attendeeName: "Tauri E2E",
      source: "inperson",
    });
    await restoreAuth(tauriPage);
  });

  test("recording starts only from a conversation page, not dashboard/capsule", async ({
    tauriPage,
  }) => {
    const devUrl = process.env.ANVIL_E2E_DEV_URL ?? "http://localhost:3000";

    await tauriPage.goto(`${devUrl}/dashboard`);
    await expect
      .poll(() => visibleText(tauriPage), { timeout: 15_000 })
      .not.toContain("Start recording");

    await tauriPage.goto(`${devUrl}/capsule`);
    await expect
      .poll(() => visibleText(tauriPage), { timeout: 15_000 })
      .toContain("404");

    await tauriPage.goto(`${devUrl}/project/${projectId}`);
    await clickSelector(tauriPage, `[data-testid="interview-row-${interviewId}"]`);
    await expect
      .poll(
        () =>
          tauriPage.evaluate<boolean>(
            `(() => !!document.querySelector('[data-testid="start-recording-button"]'))()`
          ),
        { timeout: 15_000 }
      )
      .toBe(true);
  });

  test("conversation page Start recording to Stop writes recording_path on the existing row", async ({
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
    expect(await getInterviewsForProject(projectId)).toHaveLength(1);
  });

  test("native recording IPC rejects duplicate starts and mismatched stops", async ({
    tauriPage,
  }) => {
    await expect
      .poll(() => invoke<{ is_recording: boolean }>(tauriPage, "get_recording_state"))
      .toMatchObject({ is_recording: false });

    const recordingId = await invoke<string>(tauriPage, "start_recording", {
      projectId,
      attendeeName: "Duplicate Guard",
    });
    await expect
      .poll(() => invoke<{ is_recording: boolean; project_id: string | null }>(tauriPage, "get_recording_state"))
      .toMatchObject({ is_recording: true, project_id: projectId });

    await expect(
      invoke(tauriPage, "start_recording", {
        projectId,
        attendeeName: "Second Start",
      })
    ).rejects.toThrow(/Already recording/);

    await expect(
      invoke(tauriPage, "stop_recording", { recordingId: "wrong-id" })
    ).rejects.toThrow(/Recording ID mismatch/);
    await expect
      .poll(() => invoke<{ is_recording: boolean }>(tauriPage, "get_recording_state"))
      .toMatchObject({ is_recording: true });

    const wavPath = await invoke<string>(tauriPage, "stop_recording", { recordingId });
    expect(wavPath).toMatch(/\.wav$/);
    await expect
      .poll(() => invoke<{ is_recording: boolean }>(tauriPage, "get_recording_state"))
      .toMatchObject({ is_recording: false });
  });

  test.afterAll(async () => {
    await cleanupProjectsForUser(userId);
  });
});
