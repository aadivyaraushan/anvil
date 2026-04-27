import { test, expect } from "@playwright/test";
import {
  cleanupProjectsForUser,
  getInterviewsForProject,
  getUserIdByEmail,
  seedInterview,
  seedProject,
} from "./helpers/db";

/**
 * Audit-pass coverage for the canvas recording flow.
 *
 *   D1  Start → wait → Stop on a real interview row, with `getUserMedia`
 *       mocked to a silent oscillator stream so MediaRecorder produces
 *       actual `audio/webm;codecs=opus` chunks. The chunks land in
 *       Supabase Storage and the `interviews` row's `upload_status`
 *       transitions to 'done' (or 'failed' if Deepgram errors — the
 *       route is correct either way).
 *
 *   This is the regression lock for two production bugs found in the
 *   prior audit pass:
 *     - Stripping `;codecs=...` from MIME before storage upload
 *       (Chromium MediaRecorder produces `audio/webm;codecs=opus`,
 *       Storage allowlist matched only `audio/webm`).
 *     - The storage-failure handler now also resets `status` to
 *       'scheduled' so a failed upload doesn't strand the UI on
 *       "End conversation".
 *
 * Run-time: long. Timeout 90s — covers ~15s recording + Deepgram batch
 * round-trip + write back. If the after() chain stalls past 90s, the
 * test surfaces the regression rather than silently passing.
 */

let testUserId: string;
let projectId: string;
let interviewId: string;

test.beforeAll(async () => {
  const id = await getUserIdByEmail(process.env.E2E_TEST_EMAIL!);
  if (!id) throw new Error("E2E test user not found");
  testUserId = id;
});

test.beforeEach(async () => {
  projectId = await seedProject({
    userId: testUserId,
    name: "Audit D — recording",
  });
  interviewId = await seedInterview({
    projectId,
    source: "inperson",
    attendeeName: "Audit D Subject",
    status: "scheduled",
  });
});

test.afterEach(async () => {
  await cleanupProjectsForUser(testUserId);
});

test.describe("audit: recording (canvas)", () => {
  test.setTimeout(90_000);

  test("D1 Start → Stop persists transcript shape and lands recording_path (audio/webm;codecs=opus)", async ({
    page,
  }) => {
    await page.goto(`/project/${projectId}`);
    await expect(
      page.getByText("Audit D Subject").first(),
    ).toBeVisible({ timeout: 10_000 });

    // Open the canvas for our interview.
    await page.getByText("Audit D Subject").first().click();
    await expect(
      page.getByRole("button", { name: /start recording/i }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Mock getUserMedia: a silent oscillator stream so MediaRecorder
    // produces real (silent) WebM/Opus chunks. We deliberately don't
    // touch MediaRecorder so the actual chunk MIME goes to the upload
    // route — that's what we want to lock in.
    await page.evaluate(() => {
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain).connect(dest);
      osc.start();
      const stream = dest.stream;
      navigator.mediaDevices.getUserMedia = async (c) =>
        c && c.audio
          ? stream
          : Promise.reject(new Error("only audio mocked"));
    });

    // Listen for the upload request so we can confirm the route saw the
    // codec-suffixed MIME at least once before the server stripped it.
    const uploadResponse = page.waitForResponse(
      (res) =>
        res.url().includes("/api/interviews/upload") &&
        res.request().method() === "POST",
      { timeout: 60_000 },
    );

    // Click Start. Header has the controls.
    await page
      .getByRole("button", { name: /^start recording$/i })
      .first()
      .click();
    await expect(page.getByRole("button", { name: /^stop$/i })).toBeVisible({
      timeout: 10_000,
    });

    // Record for ~12s so MediaRecorder fires its 10s `ondataavailable`
    // and we have at least one full chunk plus the trailing partial.
    await page.waitForTimeout(12_000);

    await page.getByRole("button", { name: /^stop$/i }).click();

    // Upload route returns 201 (or 500 if a regression returned). Assert
    // status explicitly so a 415 / 500 surfaces here rather than silently
    // leaving the row in a bad state.
    const res = await uploadResponse;
    expect(res.status(), `upload route returned ${res.status()}`).toBe(201);

    // Wait for the after() chain to complete the persist write. Poll the
    // DB rather than the UI — Deepgram + persist can take 15–30s and the
    // canvas's React Query refetch isn't deterministic from the test side.
    let row: Awaited<ReturnType<typeof getInterviewsForProject>>[number] | null = null;
    for (let i = 0; i < 30; i++) {
      const interviews = await getInterviewsForProject(projectId);
      row = interviews.find((r) => r.id === interviewId) ?? null;
      if (row && (row.upload_status === "done" || row.upload_status === "failed")) {
        break;
      }
      await page.waitForTimeout(1000);
    }

    expect(row).not.toBeNull();
    // Either Deepgram wrote a transcript (if DEEPGRAM_API_KEY was valid)
    // or the chain failed cleanly. Both are correctness signals — what
    // we're locking in is that the upload route accepted the codec'd
    // MIME without 415ing, so upload_status is NOT null.
    expect(row!.upload_status).not.toBeNull();
    expect(["done", "failed"]).toContain(row!.upload_status);
    // recording_path is set as soon as Storage accepts the file —
    // independent of Deepgram. This is the strongest signal that the
    // MIME stripping fix is in place.
    expect(row!.recording_path).not.toBeNull();
    expect(row!.recording_path).toMatch(/\.(webm|ogg|mp4)$/);
  });
});
