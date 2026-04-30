/**
 * Unit tests for POST /api/interviews/upload — the entry point of the
 * transcription pipeline.
 *
 * The route does:
 *   1. extract Bearer token, validate the user
 *   2. parse multipart (file, project_id, attendee_name, source)
 *   3. RLS-check that the user owns the project
 *   4. insert an interview row (status='scheduled', upload_status='uploading')
 *   5. upload audio to Supabase Storage at user/project/interview/filename
 *   6. fire-and-forget Deepgram nova-2 prerecorded transcription
 *      6a. on success: update transcript + upload_status='done' + status='completed'
 *      6b. on error:  update upload_status='failed'
 *   7. return 201 { id }
 *
 * Supabase server helpers and fetch (for Deepgram) are mocked here so the
 * tests assert behavior in isolation. End-to-end against real Supabase
 * lives in src/__tests__/integration/.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The route hands the Deepgram pipeline to Next's `after()` so it survives
// past Response.json on serverless. `after()` requires a request scope at
// runtime, which we don't have in vitest — stub it to start the promise
// immediately. Tests still flush with `await new Promise(setImmediate)`.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (work: Promise<unknown> | (() => Promise<unknown>)) => {
      const p = typeof work === "function" ? work() : work;
      // Swallow rejections — the route's background work owns its own
      // failure handling (writes upload_status='failed'). An unhandled
      // rejection here would just be the route's own catch path running.
      void Promise.resolve(p).catch(() => {});
    },
  };
});

const VALID_TOKEN = "test.bearer.jwt";
const USER_ID = "user-aaa";
const PROJECT_ID = "proj-bbb";

// The route's Deepgram call is fire-and-forget — its .then/.catch chain
// can land AFTER the test that triggered it has already run teardown,
// at which point the chain crashes on undefined Supabase mocks and Node
// logs an unhandled rejection that Vitest treats as a suite-level
// error. We swallow ONLY those noisy late-arriving chains here so they
// don't pollute test output. Real failures are still asserted inside
// each test.
//
// We have to displace Vitest's own unhandledRejection listener (which
// is what fails the run) by removing it and installing our own. Real
// rejections from product code that happen DURING a test still surface
// as test failures; this only silences orphaned chains during teardown.
const priorListeners: NodeJS.UnhandledRejectionListener[] = [];
beforeAll(() => {
  priorListeners.push(...process.listeners("unhandledRejection"));
  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", () => {
    /* swallowed — see comment above */
  });
});
afterAll(() => {
  process.removeAllListeners("unhandledRejection");
  for (const l of priorListeners) process.on("unhandledRejection", l);
});

// ---------------------------------------------------------------------------
// Supabase mocks
// ---------------------------------------------------------------------------
//
// We model the user-scoped client (used for auth + RLS project lookup) and
// the service-role client (used for inserts + storage + status updates) as
// independent fluent-API stubs so each test can inject the failure mode
// it cares about.

type SupabaseQueryShape = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
};

function makeQueryStub(opts: {
  selectSingle?: () => Promise<{ data: unknown; error: unknown | null }>;
  insertSingle?: () => Promise<{ data: unknown; error: unknown | null }>;
  updateResult?: () => Promise<{
    error: unknown | null;
    data?: unknown;
    count?: number;
  }>;
}): SupabaseQueryShape {
  const q = {} as SupabaseQueryShape;
  q.select = vi.fn(() => q);
  q.insert = vi.fn(() => q);
  // `.update().eq()` must support both `await .eq()` (legacy callers that
  // don't care about row count) AND `.eq().select(...)` (callers that need
  // to detect 0-row updates). Returning a thenable with a `.select` method
  // lets the same mock satisfy both shapes.
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
    opts.insertSingle
      ? opts.insertSingle()
      : opts.selectSingle
        ? opts.selectSingle()
        : { data: null, error: null },
  );
  return q;
}

const userClient = {
  auth: {
    // The `user` field is widened to `| null` so individual tests can
    // override with `mockResolvedValueOnce({ data: { user: null }, ... })`
    // to exercise the unauthenticated branch without a TS2322 cast.
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
  storage: {
    from: vi.fn(),
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createUserSupabaseClient: vi.fn(() => userClient),
  createServiceSupabaseClient: vi.fn(() => serviceClient),
  extractBearerToken: (h: string | null) =>
    h?.startsWith("Bearer ") ? h.slice(7) : null,
}));

// Helper: build a multipart Request the route can parse.
function buildUploadRequest(opts: {
  token?: string | null;
  file?: File | null;
  projectId?: string | null;
  attendeeName?: string;
  source?: string;
  interviewId?: string;
  rawBody?: BodyInit;
} = {}): Request {
  const fd = new FormData();
  if (opts.file !== null) {
    fd.set(
      "file",
      opts.file ?? new File(["fake-audio-bytes"], "recording.wav", { type: "audio/wav" }),
    );
  }
  if (opts.projectId !== null) {
    fd.set("project_id", opts.projectId ?? PROJECT_ID);
  }
  if (opts.attendeeName) fd.set("attendee_name", opts.attendeeName);
  if (opts.source) fd.set("source", opts.source);
  if (opts.interviewId) fd.set("interview_id", opts.interviewId);

  const headers = new Headers();
  if (opts.token !== null) {
    headers.set("authorization", `Bearer ${opts.token ?? VALID_TOKEN}`);
  }

  return new Request("http://localhost:3001/api/interviews/upload", {
    method: "POST",
    headers,
    body: opts.rawBody ?? fd,
  });
}

// Default-success setup. Each test can override one slot.
function happyPathSetup() {
  // user-client: project lookup returns the row
  userClient.from.mockImplementation(() =>
    makeQueryStub({
      selectSingle: async () => ({ data: { id: PROJECT_ID }, error: null }),
    }),
  );

  // service-client: insert returns the new interview, updates succeed
  let updateInvocations = 0;
  serviceClient.from.mockImplementation(() =>
    makeQueryStub({
      insertSingle: async () => ({
        data: {
          id: "iv-ccc",
          project_id: PROJECT_ID,
          upload_status: "uploading",
          status: "scheduled",
        },
        error: null,
      }),
      updateResult: async () => {
        updateInvocations += 1;
        // Return a non-empty `data` so callers that chain `.select()` after
        // `.update().eq()` see rows-updated > 0. The persist path in the
        // upload route uses `.select("id")` to detect 0-row updates.
        return { error: null, data: [{ id: "iv-ccc" }], count: 1 };
      },
    }),
  );

  // service-client.storage: upload + signed URL succeed
  serviceClient.storage.from.mockImplementation(() => ({
    upload: vi.fn(async () => ({ data: { path: "x" }, error: null })),
    createSignedUrl: vi.fn(async () => ({
      data: { signedUrl: "https://signed.example/audio.wav" },
      error: null,
    })),
  }));

  return {
    getUpdateInvocations: () => updateInvocations,
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
  process.env.DEEPGRAM_API_KEY = "dg-key";

  // Clear call history but keep implementations so a fire-and-forget
  // .catch chain that lands AFTER teardown doesn't hit undefined and
  // crash Vitest with an unhandled rejection. Tests can still override
  // implementations with their own mockImplementation calls.
  vi.clearAllMocks();
  userClient.auth.getUser.mockResolvedValue({
    data: { user: { id: USER_ID } },
    error: null,
  });

  // Benign defaults that swallow any late call without throwing.
  userClient.from.mockImplementation(() =>
    makeQueryStub({
      selectSingle: async () => ({ data: { id: PROJECT_ID }, error: null }),
    }),
  );
  serviceClient.from.mockImplementation(() =>
    makeQueryStub({
      insertSingle: async () => ({ data: { id: "iv-default" }, error: null }),
    }),
  );
  serviceClient.storage.from.mockImplementation(() => ({
    upload: vi.fn(async () => ({ data: { path: "x" }, error: null })),
    createSignedUrl: vi.fn(async () => ({
      data: { signedUrl: "https://signed.example/audio.wav" },
      error: null,
    })),
  }));
});

afterEach(() => {
  // NOTE: do NOT call vi.restoreAllMocks() — it would tear down the
  // service-client / user-client mocks that a leaked fire-and-forget
  // Deepgram chain may still be holding a reference to. Each test that
  // installs a fetch spy is responsible for calling fetchSpy.mockRestore()
  // itself so we don't accumulate fetch stubs across tests.
});

// Lazily import the route so module-level env reads see our setup.
async function importRoute() {
  return await import("@/app/api/interviews/upload/route");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/interviews/upload — auth and validation", () => {
  it("returns 401 when no Authorization header is present", async () => {
    const { POST } = await importRoute();
    const res = await POST(buildUploadRequest({ token: null }) as never);
    expect(res.status).toBe(401);
  });

  it("returns 401 when the token is present but Supabase says no user", async () => {
    userClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const { POST } = await importRoute();
    const res = await POST(buildUploadRequest() as never);
    expect(res.status).toBe(401);
  });

  it("returns 400 when multipart cannot be parsed", async () => {
    const { POST } = await importRoute();
    // Send a body that pretends to be JSON when the route tries formData() it
    // throws. We construct a Request that won't successfully parse as FormData.
    const req = new Request("http://localhost:3001/api/interviews/upload", {
      method: "POST",
      headers: {
        authorization: `Bearer ${VALID_TOKEN}`,
        "content-type": "application/json",
      },
      body: "not-form-data",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when file is missing from the multipart body", async () => {
    const { POST } = await importRoute();
    const res = await POST(
      buildUploadRequest({ file: null }) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/file/i);
  });

  it("returns 400 when project_id is missing", async () => {
    const { POST } = await importRoute();
    const res = await POST(
      buildUploadRequest({ projectId: null }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when the user does not own the project (RLS hides it)", async () => {
    // Project lookup returns null — RLS would return zero rows when the
    // user doesn't own the project. The route maps that to 404.
    userClient.from.mockImplementation(() =>
      makeQueryStub({
        selectSingle: async () => ({ data: null, error: null }),
      }),
    );
    const { POST } = await importRoute();
    const res = await POST(buildUploadRequest() as never);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/interviews/upload — happy path", () => {
  it("returns 201 with the new interview ID and creates the row with the right shape", async () => {
    happyPathSetup();
    // Stub Deepgram fetch so we don't actually call it; resolve the
    // promise immediately so the .then chain doesn't dangle.
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ results: { utterances: [] } }), {
          status: 200,
        }),
      );

    const { POST } = await importRoute();
    const res = await POST(
      buildUploadRequest({ attendeeName: "Pat" }) as never,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("iv-ccc");

    // Service-role insert was called with the multipart values flattened
    // onto the schema. Pull the first .from("interviews").insert() call.
    const interviewsCalls = serviceClient.from.mock.calls.filter(
      (c) => c[0] === "interviews",
    );
    expect(interviewsCalls.length).toBeGreaterThan(0);
    fetchSpy.mockRestore();
  });

  it("calls Deepgram with the signed URL and the nova-2 model params", async () => {
    happyPathSetup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ results: { utterances: [] } }), {
          status: 200,
        }),
      );

    const { POST } = await importRoute();
    await POST(buildUploadRequest() as never);

    // The Deepgram POST is fire-and-forget. Wait a microtask tick so the
    // .then chain runs and we can inspect the fetch call.
    await new Promise((r) => setImmediate(r));

    const dgCall = fetchSpy.mock.calls.find((c) =>
      String(c[0]).includes("api.deepgram.com/v1/listen"),
    );
    expect(dgCall).toBeTruthy();
    const url = String(dgCall![0]);
    expect(url).toMatch(/model=nova-2/);
    expect(url).toMatch(/diarize=true/);
    expect(url).toMatch(/utterances=true/);

    const init = dgCall![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Token dg-key",
    );
    const body = JSON.parse(String(init.body));
    expect(body.url).toBe("https://signed.example/audio.wav");

    fetchSpy.mockRestore();
  });

  it("transforms Deepgram utterances into transcript-row shape and writes them back", async () => {
    happyPathSetup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: {
            utterances: [
              { speaker: 0, transcript: "Hi there", start: 0.5 },
              { speaker: 1, transcript: "Hello!", start: 1.25 },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    const { POST } = await importRoute();
    await POST(buildUploadRequest() as never);

    // Wait for the Deepgram .then to flush.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    // The final .update call should set status='completed' and a
    // transcript array of the right shape. We capture every .update via
    // a spy on the service-role from() builder.
    const interviewsBuilders = serviceClient.from.mock.results.filter(
      (r, i) => serviceClient.from.mock.calls[i]?.[0] === "interviews",
    );
    // Find an update call with status='completed'
    const sawCompletedUpdate = interviewsBuilders.some((r) => {
      const builder = r.value as SupabaseQueryShape;
      return builder.update.mock.calls.some((args) => {
        const payload = args[0] as Record<string, unknown>;
        if (payload?.status === "completed" && payload?.upload_status === "done") {
          const transcript = payload.transcript as Array<Record<string, unknown>>;
          return (
            Array.isArray(transcript) &&
            transcript.length === 2 &&
            transcript[0].speaker === "Speaker 0" &&
            transcript[0].text === "Hi there" &&
            transcript[0].timestamp === 500 &&
            transcript[1].speaker === "Speaker 1" &&
            transcript[1].timestamp === 1250
          );
        }
        return false;
      });
    });
    expect(sawCompletedUpdate).toBe(true);
    fetchSpy.mockRestore();
  });

  it("handles an empty utterances result without crashing (status still goes to completed)", async () => {
    happyPathSetup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: { utterances: [] } }), {
        status: 200,
      }),
    );
    const { POST } = await importRoute();
    const res = await POST(buildUploadRequest() as never);
    expect(res.status).toBe(201);
    fetchSpy.mockRestore();
  });

  it("does not overwrite an existing interview transcript when Deepgram returns no utterances", async () => {
    userClient.from.mockImplementation((table: string) =>
      makeQueryStub({
        selectSingle: async () => ({
          data:
            table === "interviews"
              ? { id: "iv-existing", project_id: PROJECT_ID }
              : { id: PROJECT_ID },
          error: null,
        }),
      }),
    );
    const interviewUpdates: Array<Record<string, unknown>> = [];
    serviceClient.from.mockImplementation(() => {
      const q = makeQueryStub({
        updateResult: async () => ({ error: null, data: [{ id: "iv-existing" }], count: 1 }),
      });
      const origUpdate = q.update;
      q.update = vi.fn((payload: Record<string, unknown>) => {
        interviewUpdates.push(payload);
        return (origUpdate as unknown as (...a: unknown[]) => unknown)(payload) as ReturnType<typeof q.update>;
      }) as unknown as SupabaseQueryShape["update"];
      return q;
    });
    serviceClient.storage.from.mockImplementation(() => ({
      upload: vi.fn(async () => ({ data: { path: "x" }, error: null })),
      createSignedUrl: vi.fn(async () => ({
        data: { signedUrl: "https://signed.example/audio.wav" },
        error: null,
      })),
    }));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: { utterances: [] } }), {
        status: 200,
      }),
    );

    const { POST } = await importRoute();
    const res = await POST(buildUploadRequest({ interviewId: "iv-existing" }) as never);
    expect(res.status).toBe(201);

    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    const completedUpdate = interviewUpdates.find(
      (payload) => payload.status === "completed" && payload.upload_status === "done",
    );
    expect(completedUpdate).toBeTruthy();
    expect(completedUpdate).not.toHaveProperty("transcript");
    fetchSpy.mockRestore();
  });
});

describe("POST /api/interviews/upload — Deepgram and storage failure paths", () => {
  it("marks upload_status='failed' when Storage upload errors", async () => {
    // user-client project lookup ok, service-client insert ok, but storage upload errors
    userClient.from.mockImplementation(() =>
      makeQueryStub({
        selectSingle: async () => ({ data: { id: PROJECT_ID }, error: null }),
      }),
    );
    const interviewUpdates: Array<Record<string, unknown>> = [];
    serviceClient.from.mockImplementation(() => {
      const q = makeQueryStub({
        insertSingle: async () => ({
          data: { id: "iv-ccc" },
          error: null,
        }),
      });
      const origUpdate = q.update;
      q.update = vi.fn((payload: Record<string, unknown>) => {
        interviewUpdates.push(payload);
        return (origUpdate as unknown as (...a: unknown[]) => unknown)(payload) as ReturnType<typeof q.update>;
      }) as unknown as SupabaseQueryShape["update"];
      return q;
    });
    serviceClient.storage.from.mockImplementation(() => ({
      upload: vi.fn(async () => ({
        data: null,
        error: { message: "bucket full" },
      })),
      createSignedUrl: vi.fn(),
    }));

    const { POST } = await importRoute();
    const res = await POST(buildUploadRequest() as never);
    expect(res.status).toBe(500);
    expect(interviewUpdates.some((p) => p.upload_status === "failed")).toBe(true);
  });

  it("still returns 201 and marks upload_status='failed' when Deepgram errors", async () => {
    happyPathSetup();
    // Deepgram fetch rejects.
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("deepgram timed out"));

    const { POST } = await importRoute();
    const res = await POST(buildUploadRequest() as never);
    // The request itself succeeds — Deepgram is fire-and-forget, the user
    // gets their interview back immediately.
    expect(res.status).toBe(201);

    // After the .catch chain runs, the row should be marked failed.
    await new Promise((r) => setImmediate(r));
    const sawFailed = serviceClient.from.mock.results.some((r) => {
      const builder = r.value as SupabaseQueryShape;
      return builder.update.mock.calls.some(
        (args) => (args[0] as Record<string, unknown>).upload_status === "failed",
      );
    });
    expect(sawFailed).toBe(true);
    fetchSpy.mockRestore();
  });

  it("does not throw when DEEPGRAM_API_KEY is missing — interview row still created", async () => {
    delete process.env.DEEPGRAM_API_KEY;
    happyPathSetup();
    // No fetch should be called — we still spy to assert it.
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { POST } = await importRoute();
    const res = await POST(buildUploadRequest() as never);
    expect(res.status).toBe(201);
    expect(
      fetchSpy.mock.calls.some((c) => String(c[0]).includes("deepgram")),
    ).toBe(false);
    fetchSpy.mockRestore();
  });

  it("marks upload_status='failed' when the final transcript persist returns an error", async () => {
    // Project lookup OK, insert OK, storage OK — but the final .update
    // that writes the transcript returns an error from Supabase. The
    // route must call markFailed so the canvas doesn't strand on
    // status='live'.
    userClient.from.mockImplementation(() =>
      makeQueryStub({
        selectSingle: async () => ({ data: { id: PROJECT_ID }, error: null }),
      }),
    );
    let updateCallNumber = 0;
    serviceClient.from.mockImplementation(() =>
      makeQueryStub({
        insertSingle: async () => ({ data: { id: "iv-persist-err" }, error: null }),
        updateResult: async () => {
          updateCallNumber += 1;
          // Insert-new path: update #1 is recording_path, update #2 is the
          // transcript persist (the one we want to fail). markFailed will
          // then be #3.
          if (updateCallNumber === 2) {
            return {
              error: { message: "constraint violation", code: "23514" },
              data: null,
            };
          }
          return { error: null, data: [{ id: "iv-persist-err" }], count: 1 };
        },
      }),
    );
    serviceClient.storage.from.mockImplementation(() => ({
      upload: vi.fn(async () => ({ data: { path: "x" }, error: null })),
      createSignedUrl: vi.fn(async () => ({
        data: { signedUrl: "https://signed.example/audio.wav" },
        error: null,
      })),
    }));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ results: { utterances: [{ speaker: 0, transcript: "hi", start: 0 }] } }),
        { status: 200 },
      ),
    );

    const { POST } = await importRoute();
    const res = await POST(buildUploadRequest() as never);
    expect(res.status).toBe(201);

    // Wait for the after() chain to flush.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    const sawFailed = serviceClient.from.mock.results.some((r) => {
      const builder = r.value as SupabaseQueryShape;
      return builder.update.mock.calls.some(
        (args) => (args[0] as Record<string, unknown>).upload_status === "failed",
      );
    });
    expect(sawFailed).toBe(true);
    fetchSpy.mockRestore();
  });

  it("marks upload_status='failed' when the final persist update affects 0 rows (silent failure)", async () => {
    // The bug we fixed: `.update().eq()` on a missing/invisible row returns
    // `error: null` but `data: []`. Without `.select("id")` to surface it,
    // we'd report success while writing nothing. Mock that exact shape.
    userClient.from.mockImplementation(() =>
      makeQueryStub({
        selectSingle: async () => ({ data: { id: PROJECT_ID }, error: null }),
      }),
    );
    let updateCallNumber = 0;
    serviceClient.from.mockImplementation(() =>
      makeQueryStub({
        insertSingle: async () => ({ data: { id: "iv-zero-rows" }, error: null }),
        updateResult: async () => {
          updateCallNumber += 1;
          if (updateCallNumber === 2) {
            // 0-row persist — error null, empty data. The fix is what
            // catches this; without `.select("id")` the route would treat
            // it as success.
            return { error: null, data: [], count: 0 };
          }
          return { error: null, data: [{ id: "iv-zero-rows" }], count: 1 };
        },
      }),
    );
    serviceClient.storage.from.mockImplementation(() => ({
      upload: vi.fn(async () => ({ data: { path: "x" }, error: null })),
      createSignedUrl: vi.fn(async () => ({
        data: { signedUrl: "https://signed.example/audio.wav" },
        error: null,
      })),
    }));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ results: { utterances: [{ speaker: 0, transcript: "hi", start: 0 }] } }),
        { status: 200 },
      ),
    );

    const { POST } = await importRoute();
    const res = await POST(buildUploadRequest() as never);
    expect(res.status).toBe(201);

    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    const sawFailed = serviceClient.from.mock.results.some((r) => {
      const builder = r.value as SupabaseQueryShape;
      return builder.update.mock.calls.some(
        (args) => (args[0] as Record<string, unknown>).upload_status === "failed",
      );
    });
    expect(sawFailed).toBe(true);
    fetchSpy.mockRestore();
  });

  it("strips `;codecs=...` from file MIME before uploading to Storage (regression: Chromium MediaRecorder labels chunks audio/webm;codecs=opus)", async () => {
    happyPathSetup();
    let observedContentType: string | undefined;
    serviceClient.storage.from.mockImplementation(() => ({
      upload: vi.fn(async (_path: string, _buf: ArrayBuffer, opts: { contentType?: string }) => {
        observedContentType = opts?.contentType;
        return { data: { path: "x" }, error: null };
      }),
      createSignedUrl: vi.fn(async () => ({
        data: { signedUrl: "https://signed.example/audio.wav" },
        error: null,
      })),
    }));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: { utterances: [] } }), { status: 200 }),
    );

    const fd = new FormData();
    fd.set(
      "file",
      new File(["webm-bytes"], "recording.webm", {
        type: "audio/webm;codecs=opus",
      }),
    );
    fd.set("project_id", PROJECT_ID);
    const req = new Request("http://localhost:3001/api/interviews/upload", {
      method: "POST",
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
      body: fd,
    });

    const { POST } = await importRoute();
    const res = await POST(req as never);
    expect(res.status).toBe(201);
    expect(observedContentType).toBe("audio/webm");
    fetchSpy.mockRestore();
  });

  it("source defaults to 'uploaded' when not provided in the form", async () => {
    happyPathSetup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: { utterances: [] } }), {
        status: 200,
      }),
    );
    const { POST } = await importRoute();
    await POST(buildUploadRequest({ source: undefined }) as never);

    // The first interviews insert should have source='uploaded'.
    const interviewsBuilders = serviceClient.from.mock.results.filter(
      (_r, i) => serviceClient.from.mock.calls[i]?.[0] === "interviews",
    );
    const insertCall = interviewsBuilders
      .flatMap((b) => (b.value as SupabaseQueryShape).insert.mock.calls)
      .find((args) => args.length > 0);
    expect((insertCall?.[0] as Record<string, unknown> | undefined)?.source).toBe(
      "uploaded",
    );
  });
});
