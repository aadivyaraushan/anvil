import { test, expect, restoreAuth } from "../fixtures";
import {
  getUserIdByEmail,
  seedProject,
  seedInterview,
  cleanupProjectsForUser,
  getInterviewsForProject,
} from "../helpers/db";
import { clickSelector, existsSelector, visibleText, waitForSelector } from "../helpers/dom";
import { invoke } from "../helpers/ipc";
import { readTrayState } from "../helpers/tray";

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

  test("@built recording starts only from a conversation page, not dashboard/capsule", async ({
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
    await waitForSelector(tauriPage, '[data-testid="start-recording-button"]');
  });

  test("@built only the main native window exists after capsule removal", async ({
    tauriPage,
  }) => {
    const labels = await invoke<string[]>(tauriPage, "__test_get_window_labels");
    expect(labels).toEqual(["main"]);
  });

  test("@built conversation page Start recording to Stop writes recording_path on the existing row", async ({
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

  test("stopping after navigating away still uploads onto the conversation that started recording", async ({
    tauriPage,
  }) => {
    const secondInterviewId = await seedInterview({
      projectId,
      attendeeName: "Navigation Target",
      source: "inperson",
    });

    await tauriPage.goto(`${process.env.ANVIL_E2E_DEV_URL ?? "http://localhost:3000"}/project/${projectId}`);
    await clickSelector(tauriPage, `[data-testid="interview-row-${interviewId}"]`);
    await clickSelector(tauriPage, '[data-testid="start-recording-button"]');

    await clickSelector(tauriPage, `[data-testid="interview-row-${secondInterviewId}"]`);
    await waitForSelector(tauriPage, '[data-testid="stop-recording-button"]');
    await new Promise((r) => setTimeout(r, 1_000));
    await clickSelector(tauriPage, '[data-testid="stop-recording-button"]');

    await expect
      .poll(
        async () => {
          const rows = await getInterviewsForProject(projectId);
          return rows.find((row) => row.id === interviewId)?.recording_path ?? null;
        },
        { timeout: 30_000, message: "recording_path never appeared on original interview" }
      )
      .toMatch(/\.wav$/);

    const rows = await getInterviewsForProject(projectId);
    expect(rows.find((row) => row.id === interviewId)?.recording_path).toContain(
      `/${projectId}/${interviewId}/`
    );
    expect(rows.find((row) => row.id === secondInterviewId)?.recording_path).toBeNull();
    expect(rows).toHaveLength(2);
  });

  test("two sequential recordings attach to their own conversation rows", async ({
    tauriPage,
  }) => {
    const secondInterviewId = await seedInterview({
      projectId,
      attendeeName: "Second Recording",
      source: "inperson",
    });

    await tauriPage.goto(`${process.env.ANVIL_E2E_DEV_URL ?? "http://localhost:3000"}/project/${projectId}`);

    for (const id of [interviewId, secondInterviewId]) {
      await clickSelector(tauriPage, `[data-testid="interview-row-${id}"]`);
      await clickSelector(tauriPage, '[data-testid="start-recording-button"]');
      await new Promise((r) => setTimeout(r, 1_000));
      await clickSelector(tauriPage, '[data-testid="stop-recording-button"]');
      await expect
        .poll(
          async () => {
            const rows = await getInterviewsForProject(projectId);
            return rows.find((row) => row.id === id)?.recording_path ?? null;
          },
          { timeout: 30_000, message: `recording_path never appeared on ${id}` }
        )
        .toMatch(/\.wav$/);
    }

    const rows = await getInterviewsForProject(projectId);
    expect(rows.find((row) => row.id === interviewId)?.recording_path).toContain(
      `/${projectId}/${interviewId}/`
    );
    expect(rows.find((row) => row.id === secondInterviewId)?.recording_path).toContain(
      `/${projectId}/${secondInterviewId}/`
    );
    expect(rows).toHaveLength(2);
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

  test("forced microphone start failure leaves UI recoverable and tray idle", async ({
    tauriPage,
  }) => {
    await invoke(tauriPage, "__test_fail_next_recording_start", {
      message: "forced mic failure",
    });

    await tauriPage.goto(`${process.env.ANVIL_E2E_DEV_URL ?? "http://localhost:3000"}/project/${projectId}`);
    await clickSelector(tauriPage, `[data-testid="interview-row-${interviewId}"]`);
    await clickSelector(tauriPage, '[data-testid="start-recording-button"]');

    await expect.poll(() => visibleText(tauriPage)).toContain("forced mic failure");
    await expect.poll(() => existsSelector(tauriPage, '[data-testid="start-recording-button"]')).toBe(true);
    await expect
      .poll(() => invoke<{ is_recording: boolean }>(tauriPage, "get_recording_state"))
      .toMatchObject({ is_recording: false });
    await expect.poll(() => readTrayState(tauriPage)).toBe("idle");

    await clickSelector(tauriPage, '[data-testid="start-recording-button"]');
    await new Promise((r) => setTimeout(r, 1_000));
    await clickSelector(tauriPage, '[data-testid="stop-recording-button"]');
    await expect
      .poll(async () => (await getInterviewsForProject(projectId))[0]?.recording_path ?? null, {
        timeout: 30_000,
      })
      .toMatch(/\.wav$/);
  });

  test("missing stopped file surfaces an error, resets native state, and permits retry", async ({
    tauriPage,
  }) => {
    await tauriPage.goto(`${process.env.ANVIL_E2E_DEV_URL ?? "http://localhost:3000"}/project/${projectId}`);
    await clickSelector(tauriPage, `[data-testid="interview-row-${interviewId}"]`);
    await invoke(tauriPage, "__test_make_next_stop_return_missing_file");
    await clickSelector(tauriPage, '[data-testid="start-recording-button"]');
    await new Promise((r) => setTimeout(r, 1_000));
    await clickSelector(tauriPage, '[data-testid="stop-recording-button"]');

    await expect.poll(() => visibleText(tauriPage)).toContain("Could not read recording file");
    await expect
      .poll(() => invoke<{ is_recording: boolean }>(tauriPage, "get_recording_state"))
      .toMatchObject({ is_recording: false });
    await expect.poll(() => readTrayState(tauriPage)).toBe("idle");
    expect((await getInterviewsForProject(projectId))[0]?.recording_path).toBeNull();

    await clickSelector(tauriPage, '[data-testid="start-recording-button"]');
    await new Promise((r) => setTimeout(r, 1_000));
    await clickSelector(tauriPage, '[data-testid="stop-recording-button"]');
    await expect
      .poll(async () => (await getInterviewsForProject(projectId))[0]?.recording_path ?? null, {
        timeout: 30_000,
      })
      .toMatch(/\.wav$/);
  });

  test("upload API failure does not create a second row and permits retry", async ({
    tauriPage,
  }) => {
    await tauriPage.goto(`${process.env.ANVIL_E2E_DEV_URL ?? "http://localhost:3000"}/project/${projectId}`);
    await clickSelector(tauriPage, `[data-testid="interview-row-${interviewId}"]`);
    await tauriPage.evaluate(
      `(() => {
         const originalFetch = window.fetch.bind(window);
         let failed = false;
         window.fetch = async (...args) => {
           const input = args[0];
           const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
           if (!failed && url.includes('/api/interviews/upload')) {
             failed = true;
             return new Response(JSON.stringify({
               error: 'forced upload failure',
               stage: 'e2e',
               detail: 'forced upload failure',
             }), { status: 500, headers: { 'content-type': 'application/json' } });
           }
           return originalFetch(...args);
         };
       })()`
    );

    await clickSelector(tauriPage, '[data-testid="start-recording-button"]');
    await new Promise((r) => setTimeout(r, 1_000));
    await clickSelector(tauriPage, '[data-testid="stop-recording-button"]');

    await expect.poll(() => visibleText(tauriPage)).toContain("forced upload failure");
    await expect.poll(() => readTrayState(tauriPage)).toBe("idle");
    expect(await getInterviewsForProject(projectId)).toHaveLength(1);
    expect((await getInterviewsForProject(projectId))[0]?.recording_path).toBeNull();

    await clickSelector(tauriPage, '[data-testid="start-recording-button"]');
    await new Promise((r) => setTimeout(r, 1_000));
    await clickSelector(tauriPage, '[data-testid="stop-recording-button"]');
    await expect
      .poll(async () => (await getInterviewsForProject(projectId))[0]?.recording_path ?? null, {
        timeout: 30_000,
      })
      .toMatch(/\.wav$/);
    expect(await getInterviewsForProject(projectId)).toHaveLength(1);
  });

  test.afterAll(async () => {
    await cleanupProjectsForUser(userId);
  });
});
