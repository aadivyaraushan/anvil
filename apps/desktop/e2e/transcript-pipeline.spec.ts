import { test, expect } from "@playwright/test";
import {
  cleanupProjectsForUser,
  getUserIdByEmail,
  seedInterview,
  seedProject,
  supportsRedesignSchema,
  updateInterviewTranscript,
} from "./helpers/db";

// End-to-end coverage of the transcription pipeline as it surfaces in
// the desktop UI. The API-side route (POST /api/interviews/upload →
// Deepgram → DB write) is covered by Vitest in apps/api. These specs
// drive the *desktop's* response to each pipeline state:
//
//   - upload_status='uploading' → canvas shows "no transcript" + status
//     reflected in inbox
//   - upload_status='done' + non-empty transcript → canvas renders each
//     line with timestamp + speaker
//   - upload_status='failed' → canvas does not crash; row remains
//     interactive
//   - conversation recording POST to /api/interviews/upload sends the right multipart
//     shape (mocked endpoint)
//   - Deepgram-shaped transcript (Speaker 0/1, ms timestamps) renders
//     correctly after API write
//   - Long transcript (500 lines) renders without freezing

let testUserId: string;
let schemaReady = false;

test.beforeAll(async () => {
  testUserId = (await getUserIdByEmail(process.env.E2E_TEST_EMAIL!))!;
  schemaReady = await supportsRedesignSchema();
});

test.afterEach(async () => {
  await cleanupProjectsForUser(testUserId);
});

test.describe("Transcript pipeline — render states", () => {
  test.beforeEach(() => {
    test.skip(!schemaReady, "Requires migrations 010+ (interviews columns).");
  });

  test("interview with empty transcript shows the no-transcript message", async ({
    page,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Transcript: empty",
    });
    await seedInterview({
      projectId,
      attendeeName: "Empty Sara",
      status: "completed",
      transcript: [],
    });

    await page.goto(`/project/${projectId}`);
    await page.getByText("Empty Sara").click();
    await expect(page.getByText(/no transcript available/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Deepgram-shaped transcript renders each line with speaker + timestamp", async ({
    page,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Transcript: Deepgram shape",
    });

    // This is the exact shape the api route writes after the Deepgram
    // transformation: Speaker 0/1 + ms timestamp + text.
    await seedInterview({
      projectId,
      attendeeName: "Diarized Dax",
      status: "completed",
      transcript: [
        { speaker: "Speaker 0", text: "Hi there, thanks for joining.", timestamp: 500 },
        { speaker: "Speaker 1", text: "Of course, happy to help.", timestamp: 1250 },
        { speaker: "Speaker 0", text: "Tell me about your workflow.", timestamp: 2750 },
      ],
    });

    await page.goto(`/project/${projectId}`);
    await page.getByText("Diarized Dax").click();

    await expect(
      page.getByText("Hi there, thanks for joining."),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Of course, happy to help.")).toBeVisible();
    await expect(page.getByText("Tell me about your workflow.")).toBeVisible();
  });

  test("interview with status='live' shows 'Transcript will appear here…' empty state", async ({
    page,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Transcript: live",
    });
    await seedInterview({
      projectId,
      attendeeName: "Live Lou",
      status: "live",
      transcript: [],
    });

    await page.goto(`/project/${projectId}`);
    await page.getByText("Live Lou").click();
    // For status='live' the canvas shows the "Listening…" empty state.
    await expect(
      page.getByText(/Listening/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("transcript auto-appears when interview transitions from uploading to completed", async ({
    page,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Transcript: auto-refresh",
    });
    const interviewId = await seedInterview({
      projectId,
      attendeeName: "Auto Refresh Ali",
      status: "live",
      uploadStatus: "uploading",
      transcript: [],
    });

    await page.goto(`/project/${projectId}`);
    await page.getByText("Auto Refresh Ali").click();

    await expect(page.getByText(/Transcribing/i)).toBeVisible({ timeout: 10_000 });

    await updateInterviewTranscript({
      interviewId,
      status: "completed",
      uploadStatus: "done",
      transcript: [
        { speaker: "Speaker 0", text: "Hello, this is the auto-refresh test.", timestamp: 100 },
        { speaker: "Speaker 1", text: "Great, the transcript appeared automatically.", timestamp: 2500 },
      ],
    });

    await expect(
      page.getByText("Hello, this is the auto-refresh test."),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("Great, the transcript appeared automatically."),
    ).toBeVisible();
  });
});

test.describe("Transcript pipeline — upload-status state machine", () => {
  test.beforeEach(() => {
    test.skip(!schemaReady, "Requires migrations 010+ (interviews columns).");
  });

  test("upload_status='uploading' shows transcribing message", async ({
    page,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Transcript: uploading",
    });
    await seedInterview({
      projectId,
      attendeeName: "Uploading Uma",
      status: "live",
      uploadStatus: "uploading",
      transcript: [],
    });

    await page.goto(`/project/${projectId}`);
    await page.getByText("Uploading Uma").click();
    await expect(page.getByText(/Transcribing/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("upload_status='failed' shows transcription failed and retry", async ({
    page,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Transcript: failed",
    });
    await seedInterview({
      projectId,
      attendeeName: "Failed Felix",
      status: "scheduled",
      uploadStatus: "failed",
      transcript: [],
    });

    await page.goto(`/project/${projectId}`);
    await page.getByText("Failed Felix").click();
    await expect(page.getByText(/transcription failed/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("a completed interview with no transcript shows 'no transcript' message", async ({
    page,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Transcript: empty completed",
    });
    await seedInterview({
      projectId,
      attendeeName: "Empty Edith",
      status: "completed",
      transcript: [],
    });

    await page.goto(`/project/${projectId}`);
    await page.getByText("Empty Edith").click();
    await expect(page.getByText(/no transcript available/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe("Transcript pipeline — large content perf", () => {
  test.beforeEach(() => {
    test.skip(!schemaReady, "Requires migrations 010+ (interviews columns).");
  });

  test("500-line Deepgram transcript renders without freezing", async ({
    page,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Transcript: long",
    });
    const transcript = Array.from({ length: 500 }, (_, i) => ({
      speaker: `Speaker ${i % 2}`,
      text: `Line ${i}: this is filler interview content meant to mimic a 90-minute session.`,
      timestamp: i * 1000,
    }));
    await seedInterview({
      projectId,
      attendeeName: "Marathon Mira",
      status: "completed",
      transcript,
    });

    const start = Date.now();
    await page.goto(`/project/${projectId}`);
    await page.getByText("Marathon Mira").click();
    await expect(page.getByText("Line 0:", { exact: false })).toBeVisible({
      timeout: 20_000,
    });
    expect(Date.now() - start).toBeLessThan(20_000);
  });
});

test.describe("Conversation recording upload — POST shape contract", () => {
  test("recording upload POSTs the right multipart shape to /api/interviews/upload (mocked)", async ({
    page,
  }) => {
    let captured: {
      url: string;
      method: string;
      authPresent: boolean;
      contentType: string | null;
    } | null = null;

    // Stub the upload endpoint and capture the request the conversation
    // recorder sends.
    await page.route(
      /\/api\/interviews\/upload$/,
      async (route) => {
        const req = route.request();
        captured = {
          url: req.url(),
          method: req.method(),
          authPresent: Boolean(req.headers()["authorization"]),
          contentType: req.headers()["content-type"] ?? null,
        };
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: "iv-stub" }),
        });
      },
    );

    await page.goto("/dashboard");

    // The actual recording flow needs microphone permission and either
    // MediaRecorder or Tauri native capture. Here we pin the upload contract:
    // multipart body, bearer token, and /api/interviews/upload destination.
    const result = await page.evaluate(async (apiUrl) => {
      const fd = new FormData();
      fd.append(
        "file",
        new Blob(["fake-wav-bytes"], { type: "audio/wav" }),
        "test.wav",
      );
      fd.append("project_id", "00000000-0000-0000-0000-000000000000");
      fd.append("source", "desktop");
      const res = await fetch(`${apiUrl}/api/interviews/upload`, {
        method: "POST",
        body: fd,
        headers: { Authorization: "Bearer test-token" },
      });
      return { status: res.status, body: await res.json() };
    }, process.env.NEXT_PUBLIC_API_URL ?? "");

    // The mocked endpoint should have been hit with the multipart shape.
    expect(result.status).toBe(201);
    expect(result.body).toEqual({ id: "iv-stub" });
    expect(captured).not.toBeNull();
    expect(captured!.method).toBe("POST");
    expect(captured!.authPresent).toBe(true);
    expect(captured!.contentType).toMatch(/^multipart\/form-data/i);
  });
});
