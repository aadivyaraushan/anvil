import { test, expect, restoreAuth } from "../fixtures";
import {
  getUserIdByEmail,
  seedProject,
  cleanupProjectsForUser,
} from "../helpers/db";
import { invoke } from "../helpers/ipc";
import { readTrayState } from "../helpers/tray";

// Tray icon swaps between tray-idle.png and tray-recording.png based on the
// recording state. Asserted via the e2e-only `__test_get_tray_state` command,
// which mirrors the icon flag set by `update_tray_icon` in lib.rs.

test.describe("tray icon state", () => {
  let userId: string;
  let projectId: string;

  test.beforeAll(async () => {
    const id = await getUserIdByEmail(process.env.E2E_TEST_EMAIL!);
    if (!id) throw new Error("E2E test user not found — check global-setup");
    userId = id;
    await cleanupProjectsForUser(userId);
    projectId = await seedProject({ userId, name: "Tauri Tray Test" });
  });

  test.beforeEach(async ({ tauriPage }) => {
    await restoreAuth(tauriPage);
  });

  test("tray flips to recording while a recording is active", async ({
    tauriPage,
  }) => {
    await expect.poll(() => readTrayState(tauriPage)).toBe("idle");

    const recordingId = await invoke<string>(tauriPage, "start_recording", {
      projectId,
      attendeeName: "Tray E2E",
    });

    await expect
      .poll(() => readTrayState(tauriPage), { timeout: 5_000 })
      .toBe("recording");

    await invoke(tauriPage, "stop_recording", { recordingId });

    await expect
      .poll(() => readTrayState(tauriPage), { timeout: 5_000 })
      .toBe("idle");
  });

  test.afterAll(async () => {
    await cleanupProjectsForUser(userId);
  });
});
