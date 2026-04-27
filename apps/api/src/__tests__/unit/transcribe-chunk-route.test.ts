/**
 * Unit tests for POST /api/interviews/transcribe-chunk — the streaming
 * path that fires every 10 seconds while a recording is live.
 *
 * The route does:
 *   1. Bearer token + user check
 *   2. parse multipart (audio, interview_id, time_offset_secs)
 *   3. RLS-scoped lookup of the interview
 *   4. service-role flip to status='live' on first chunk
 *   5. Deepgram nova-2 transcribe of the chunk
 *   6. service-role update of `transcript = existing ++ newSegments`
 *      6a. NEW: errors and 0-row updates surface as 500 (regression guard
 *          for the silent-drop bug where chunk transcripts vanished)
 *
 * Mocks Supabase + fetch so we can drive each branch deterministically.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const VALID_TOKEN = "test.bearer.jwt";
const USER_ID = "user-aaa";
const INTERVIEW_ID = "iv-zzz";

// Late-arriving rejections from background work in other tests can pollute
// this suite; mirror the upload-route test's listener swap.
const priorListeners: NodeJS.UnhandledRejectionListener[] = [];
beforeAll(() => {
  priorListeners.push(...process.listeners("unhandledRejection"));
  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", () => {});
});
afterAll(() => {
  process.removeAllListeners("unhandledRejection");
  for (const l of priorListeners) process.on("unhandledRejection", l);
});

// ---------------------------------------------------------------------------
// Supabase mocks — modelled on the upload-route test for consistency.
// ---------------------------------------------------------------------------
type SupabaseQueryShape = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
};

function makeQueryStub(opts: {
  selectSingle?: () => Promise<{ data: unknown; error: unknown | null }>;
  updateResult?: () => Promise<{
    error: unknown | null;
    data?: unknown;
    count?: number;
  }>;
}): SupabaseQueryShape {
  const q = {} as SupabaseQueryShape;
  q.select = vi.fn(() => q);
  q.insert = vi.fn(() => q);
  q.update = vi.fn(() => ({
    eq: vi.fn(() => {
      const resultPromise = opts.updateResult
        ? opts.updateResult()
        : Promise.resolve({
            error: null,
            data: [{ id: "mock-row-id" }],
            count: 1,
          });
      const builder = {
        then: <TResult1, TResult2>(
          onFulfilled?: ((value: unknown) => TResult1) | null,
          onRejected?: ((reason: unknown) => TResult2) | null,
        ) => resultPromise.then(onFulfilled as never, onRejected as never),
        select: vi.fn(() => resultPromise),
      };
      return builder;
    }),
  })) as unknown as SupabaseQueryShape["update"];
  q.eq = vi.fn(() => q);
  q.single = vi.fn(async () =>
    opts.selectSingle
      ? opts.selectSingle()
      : { data: null, error: null },
  );
  return q;
}

const userClient = {
  auth: {
    getUser: vi.fn(async (): Promise<{
      data: { user: { id: string } | null };
      error: null;
    }> => ({
      data: { user: { id: USER_ID } },
      error: null,
    })),
  },
  from: vi.fn(),
};

const serviceClient = {
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createUserSupabaseClient: vi.fn(() => userClient),
  createServiceSupabaseClient: vi.fn(() => serviceClient),
  extractBearerToken: (h: string | null) =>
    h?.startsWith("Bearer ") ? h.slice(7) : null,
}));

function buildChunkRequest(opts: {
  token?: string | null;
  audio?: File | null;
  interviewId?: string | null;
  timeOffsetSecs?: string;
} = {}): Request {
  const fd = new FormData();
  if (opts.audio !== null) {
    fd.set(
      "audio",
      opts.audio ?? new File(["chunk-bytes"], "chunk.webm", { type: "audio/webm" }),
    );
  }
  if (opts.interviewId !== null) {
    fd.set("interview_id", opts.interviewId ?? INTERVIEW_ID);
  }
  if (opts.timeOffsetSecs !== undefined) {
    fd.set("time_offset_secs", opts.timeOffsetSecs);
  }

  const headers = new Headers();
  if (opts.token !== null) {
    headers.set("authorization", `Bearer ${opts.token ?? VALID_TOKEN}`);
  }

  return new Request("http://localhost:3001/api/interviews/transcribe-chunk", {
    method: "POST",
    headers,
    body: fd,
  });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
  process.env.DEEPGRAM_API_KEY = "dg-key";

  vi.clearAllMocks();
  userClient.auth.getUser.mockResolvedValue({
    data: { user: { id: USER_ID } },
    error: null,
  });
  userClient.from.mockImplementation(() =>
    makeQueryStub({
      selectSingle: async () => ({
        data: {
          id: INTERVIEW_ID,
          project_id: "proj-bbb",
          transcript: [],
          status: "scheduled",
        },
        error: null,
      }),
    }),
  );
  serviceClient.from.mockImplementation(() => makeQueryStub({}));
});

async function importRoute() {
  return await import("@/app/api/interviews/transcribe-chunk/route");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/interviews/transcribe-chunk — auth and validation", () => {
  it("returns 401 with no Authorization header", async () => {
    const { POST } = await importRoute();
    const res = await POST(buildChunkRequest({ token: null }) as never);
    expect(res.status).toBe(401);
  });

  it("returns 401 when Supabase says no user for the token", async () => {
    userClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const { POST } = await importRoute();
    const res = await POST(buildChunkRequest() as never);
    expect(res.status).toBe(401);
  });

  it("returns 400 when audio is missing", async () => {
    const { POST } = await importRoute();
    const res = await POST(buildChunkRequest({ audio: null }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when interview_id is missing", async () => {
    const { POST } = await importRoute();
    const res = await POST(buildChunkRequest({ interviewId: null }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the interview lookup returns null (RLS hides it)", async () => {
    userClient.from.mockImplementation(() =>
      makeQueryStub({
        selectSingle: async () => ({ data: null, error: null }),
      }),
    );
    const { POST } = await importRoute();
    const res = await POST(buildChunkRequest() as never);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/interviews/transcribe-chunk — happy path", () => {
  it("returns 200 with no segments when DEEPGRAM_API_KEY is unset", async () => {
    delete process.env.DEEPGRAM_API_KEY;
    const { POST } = await importRoute();
    const res = await POST(buildChunkRequest() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.segments).toEqual([]);
  });

  it("transforms Deepgram utterances and writes them appended to existing transcript", async () => {
    // Pre-existing one-segment transcript so we can assert the append.
    userClient.from.mockImplementation(() =>
      makeQueryStub({
        selectSingle: async () => ({
          data: {
            id: INTERVIEW_ID,
            project_id: "proj-bbb",
            transcript: [
              { speaker: "Speaker 0", text: "earlier", timestamp: 0 },
            ],
            status: "live",
          },
          error: null,
        }),
      }),
    );
    serviceClient.from.mockImplementation(() =>
      makeQueryStub({
        updateResult: async () => ({
          error: null,
          data: [{ id: INTERVIEW_ID }],
          count: 1,
        }),
      }),
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: {
            utterances: [
              { speaker: 0, transcript: "first new", start: 0.5 },
              { speaker: 1, transcript: "second new", start: 1.0 },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    const { POST } = await importRoute();
    const res = await POST(
      buildChunkRequest({ timeOffsetSecs: "10" }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.segments).toHaveLength(2);
    // Time offset is added (10s) and converted to ms.
    expect(body.segments[0].timestamp).toBe(10500);
    expect(body.segments[1].timestamp).toBe(11000);

    // The persist update should have been called with existing ++ new.
    const updateCalls = serviceClient.from.mock.results.flatMap((r) => {
      const builder = r.value as SupabaseQueryShape;
      return builder.update.mock.calls;
    });
    const transcriptUpdate = updateCalls.find((args) => {
      const payload = args[0] as Record<string, unknown>;
      return Array.isArray(payload?.transcript);
    });
    expect(transcriptUpdate).toBeTruthy();
    const transcript = (transcriptUpdate![0] as { transcript: unknown[] })
      .transcript;
    expect(transcript).toHaveLength(3);
    fetchSpy.mockRestore();
  });

  it("returns 200 with empty segments when Deepgram returns no utterances (no DB write attempted)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: { utterances: [] } }), {
        status: 200,
      }),
    );
    let updateCalled = false;
    serviceClient.from.mockImplementation(() =>
      makeQueryStub({
        updateResult: async () => {
          updateCalled = true;
          return { error: null, data: [{ id: INTERVIEW_ID }], count: 1 };
        },
      }),
    );

    const { POST } = await importRoute();
    const res = await POST(buildChunkRequest() as never);
    expect(res.status).toBe(200);
    // The first-chunk status flip still fires (status was 'scheduled' → 'live')
    // — that's an update. So we can't assert "no update at all". Instead
    // assert that no transcript-array update happened.
    const transcriptWriteHappened = serviceClient.from.mock.results.some((r) => {
      const builder = r.value as SupabaseQueryShape;
      return builder.update.mock.calls.some((args) =>
        Array.isArray((args[0] as Record<string, unknown>).transcript),
      );
    });
    expect(transcriptWriteHappened).toBe(false);
    void updateCalled;
    fetchSpy.mockRestore();
  });
});

describe("POST /api/interviews/transcribe-chunk — persistence error paths (regression guards)", () => {
  it("returns 500 when the transcript update returns a Supabase error", async () => {
    // Status flip update succeeds; transcript update errors.
    let n = 0;
    serviceClient.from.mockImplementation(() =>
      makeQueryStub({
        updateResult: async () => {
          n += 1;
          if (n === 1) {
            // First update is the status flip — succeed.
            return { error: null, data: [{ id: INTERVIEW_ID }], count: 1 };
          }
          // Second update is the transcript persist — fail.
          return {
            error: { message: "constraint violation", code: "23514" },
            data: null,
          };
        },
      }),
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: {
            utterances: [{ speaker: 0, transcript: "hello", start: 0 }],
          },
        }),
        { status: 200 },
      ),
    );

    const { POST } = await importRoute();
    const res = await POST(buildChunkRequest() as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.stage).toBe("transcript_update");
    expect(body.detail).toMatch(/constraint violation/);
    fetchSpy.mockRestore();
  });

  it("returns 500 when the transcript update affects 0 rows (silent-drop bug guard)", async () => {
    // The reported user bug: chunk update returns error:null with 0 rows
    // because the row is gone or RLS-via-service-role isn't matching.
    // Without `.select("id")`, this would be reported as success.
    let n = 0;
    serviceClient.from.mockImplementation(() =>
      makeQueryStub({
        updateResult: async () => {
          n += 1;
          if (n === 1) {
            return { error: null, data: [{ id: INTERVIEW_ID }], count: 1 };
          }
          return { error: null, data: [], count: 0 };
        },
      }),
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: {
            utterances: [{ speaker: 0, transcript: "hello", start: 0 }],
          },
        }),
        { status: 200 },
      ),
    );

    const { POST } = await importRoute();
    const res = await POST(buildChunkRequest() as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.stage).toBe("transcript_update");
    expect(body.detail).toBe("no rows updated");
    fetchSpy.mockRestore();
  });
});
