import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  cleanupProjectsForUser,
  getUserIdByEmail,
  seedInterview,
  seedProject,
  upsertSubscription,
} from "./helpers/db";

/**
 * Audit-pass coverage for LLM-backed analysis flows.
 *
 *   E1   POST /api/projects/{id}/analyst — verify the route's lifecycle
 *        (immediate 200 + analyst_status='generating' flip + the
 *        already_running 409 path), without burning OpenAI credits on
 *        the full LangGraph run. Achieved by triggering against a
 *        project with zero completed interviews — the graph's fetchData
 *        node throws, the route's catch sets analyst_status='failed',
 *        no LLM nodes run.
 *
 *   E2   GET /api/projects/{id}/generate-archetypes — verify the
 *        working 422 gate when fewer than 2 completed interviews exist
 *        (this gate IS enforced; locking it in).
 *
 *   E3   Copilot endpoint plan gate — verify CURRENT behavior that a
 *        free-plan user can stream copilot suggestions despite the
 *        plans.ts config saying liveAICopilot is Pro+. This regression
 *        lock fails the day server-side gating ships.
 */

let testUserId: string;
let userToken: string;

test.beforeAll(async () => {
  const id = await getUserIdByEmail(process.env.E2E_TEST_EMAIL!);
  if (!id) throw new Error("E2E test user not found");
  testUserId = id;
  await upsertSubscription({ userId: id, plan: "free" });

  // Sign in once via Supabase client to grab a real bearer token —
  // direct API calls in these tests skip the browser fixture.
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await sb.auth.signInWithPassword({
    email: process.env.E2E_TEST_EMAIL!,
    password: process.env.E2E_TEST_PASSWORD!,
  });
  if (error || !data.session) {
    throw new Error(`audit-analysis: could not sign in test user: ${error?.message}`);
  }
  userToken = data.session.access_token;
});

test.afterEach(async () => {
  await cleanupProjectsForUser(testUserId);
});

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

test.describe("audit: analysis (LLM-backed)", () => {
  test("E1 POST /analyst on a project with no completed interviews → 200 then analyst_status flips to 'failed'", async ({
    request,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Audit E1 — no completed interviews",
    });

    const res = await request.post(
      `${apiBase}/api/projects/${projectId}/analyst`,
      {
        headers: { Authorization: `Bearer ${userToken}` },
      },
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("started");

    // analyst_status is set BEFORE after() fires, so we should observe
    // 'generating' immediately. Then the graph's fetchData throws ("no
    // completed interviews"), the route's catch flips to 'failed'.
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );

    let observedFinalStatus: string | null = null;
    for (let i = 0; i < 30; i++) {
      const { data } = await sb
        .from("projects")
        .select("analyst_status")
        .eq("id", projectId)
        .single();
      const status = (data as { analyst_status: string } | null)?.analyst_status ?? null;
      if (status === "failed" || status === "complete") {
        observedFinalStatus = status;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    // We expect 'failed' (no completed interviews). 'complete' would
    // mean fetchData unexpectedly succeeded — surface either case so
    // the test's intent is clear.
    expect(observedFinalStatus).toBe("failed");
  });

  test("E1b free user, 2nd analyst run on same project → 422 PLAN_LIMIT", async ({
    request,
  }) => {
    // Free plan: analystRuns: 1. PR 1 wired the gate at
    // POST /api/projects/[id]/analyst, with analyst_run_count incremented
    // by saveAnalyst on success. Stamp the count to 1 directly so we
    // can hit the gate without running the LangGraph pipeline twice.
    const projectId = await seedProject({
      userId: testUserId,
      name: "Audit E1b — analyst run cap",
    });

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    await sb
      .from("projects")
      .update({ analyst_run_count: 1, analyst_status: "complete" })
      .eq("id", projectId);

    const res = await request.post(
      `${apiBase}/api/projects/${projectId}/analyst`,
      { headers: { Authorization: `Bearer ${userToken}` } },
    );
    expect(res.status()).toBe(422);
    const body = (await res.json()) as { code?: string; stage?: string };
    expect(body.code).toBe("PLAN_LIMIT");
    expect(body.stage).toBe("analyst_run");
  });

  test("E1 POST /analyst while another run is in progress returns 409", async ({
    request,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Audit E1 — already running",
    });

    // Stamp analyst_status='generating' directly so the next POST trips
    // the in-progress branch without us spending an LLM round-trip.
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    await sb
      .from("projects")
      .update({ analyst_status: "generating" })
      .eq("id", projectId);

    const res = await request.post(
      `${apiBase}/api/projects/${projectId}/analyst`,
      { headers: { Authorization: `Bearer ${userToken}` } },
    );
    expect(res.status()).toBe(409);
    const body = (await res.json()) as { status?: string };
    expect(body.status).toBe("already_running");
  });

  test("E2 GET /generate-archetypes with <2 completed interviews returns 422", async ({
    request,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Audit E2 — gate",
    });
    // One scheduled (not completed) interview; gate requires 2 completed.
    await seedInterview({ projectId, attendeeName: "Solo", status: "scheduled" });

    const res = await request.get(
      `${apiBase}/api/projects/${projectId}/generate-archetypes`,
      { headers: { Authorization: `Bearer ${userToken}` } },
    );
    expect(res.status()).toBe(422);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/at least 2 completed/i);
  });

  test("E3 copilot endpoint enforces plan gate — free user gets 402 with PLAN_LIMIT code", async ({
    request,
  }) => {
    // plans.ts: liveAICopilot is Pro+. Server-side gate added in this
    // audit — free users hitting the copilot stream now get 402 with a
    // structured error instead of a working SSE response.

    const projectId = await seedProject({
      userId: testUserId,
      name: "Audit E3 — copilot gate",
    });
    const interviewId = await seedInterview({
      projectId,
      attendeeName: "Subject",
      status: "completed",
      transcript: [
        { speaker: "Speaker 0", text: "Tell me about your week.", timestamp: 0 },
        { speaker: "Speaker 1", text: "It was busy.", timestamp: 2000 },
      ],
    });

    const res = await request.get(
      `${apiBase}/api/projects/${projectId}/interviews/${interviewId}/copilot`,
      { headers: { Authorization: `Bearer ${userToken}` } },
    );

    expect(res.status()).toBe(402);
    const body = (await res.json()) as { code?: string; feature?: string };
    expect(body.code).toBe("PLAN_LIMIT");
    expect(body.feature).toBe("liveAICopilot");
  });

  test("E3 copilot endpoint allows pro user to stream", async ({ request }) => {
    // Sanity check the gate doesn't false-positive for paid users.
    await upsertSubscription({ userId: testUserId, plan: "pro" });

    const projectId = await seedProject({
      userId: testUserId,
      name: "Audit E3 — copilot pro",
    });
    const interviewId = await seedInterview({
      projectId,
      attendeeName: "Subject",
      status: "completed",
      transcript: [
        { speaker: "Speaker 0", text: "Hello.", timestamp: 0 },
        { speaker: "Speaker 1", text: "Hi there.", timestamp: 1000 },
      ],
    });

    const res = await request.get(
      `${apiBase}/api/projects/${projectId}/interviews/${interviewId}/copilot`,
      { headers: { Authorization: `Bearer ${userToken}` } },
    );

    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/text\/event-stream/);

    // Reset to free for subsequent tests.
    await upsertSubscription({ userId: testUserId, plan: "free" });
  });

  test("E1 happy path: 2 completed interviews → analyst_documents row lands with shape", async ({
    request,
  }) => {
    // This test exercises the full LangGraph pipeline (extractAll →
    // synthesize → saveAnalyst) end-to-end. To avoid burning OpenAI
    // credits on every CI run, the api server is started with
    // ANVIL_LLM_MODE=mock (see apps/desktop/playwright.config.ts) which
    // makes createLlm() return a MockLlm whose invoke()/stream() pull
    // pre-baked fixtures from apps/api/src/__tests__/fixtures/llm/. The
    // pipeline never talks to OpenAI.
    //
    // Skip locally when the api server isn't running in mock mode — eg.
    // a dev has `pnpm dev:api` already up without the env var. Reading
    // /api/health is the source of truth: it reflects the *server* env,
    // not the test process env.
    const healthRes = await request.get(`${apiBase}/api/health`);
    const health = (await healthRes.json()) as { llmMode?: string };
    test.skip(
      health.llmMode !== "mock",
      `api server is running in '${health.llmMode}' mode; restart it with ANVIL_LLM_MODE=mock`,
    );

    const projectId = await seedProject({
      userId: testUserId,
      name: "Audit E1 happy path",
    });

    await seedInterview({
      projectId,
      attendeeName: "Alice",
      status: "completed",
      transcript: [
        { speaker: "Speaker 0", text: "Walk me through your monthly close.", timestamp: 0 },
        { speaker: "Speaker 1", text: "We spend three days every month closing the books.", timestamp: 2000 },
        { speaker: "Speaker 0", text: "What part takes the most time?", timestamp: 4000 },
        { speaker: "Speaker 1", text: "Reconciling between four different dashboards.", timestamp: 6000 },
      ],
    });
    await seedInterview({
      projectId,
      attendeeName: "Bob",
      status: "completed",
      transcript: [
        { speaker: "Speaker 0", text: "Tell me about reporting today.", timestamp: 0 },
        { speaker: "Speaker 1", text: "Manual reporting takes too long.", timestamp: 2000 },
        { speaker: "Speaker 1", text: "Customer data is scattered across tools.", timestamp: 4000 },
      ],
    });

    const res = await request.post(
      `${apiBase}/api/projects/${projectId}/analyst`,
      { headers: { Authorization: `Bearer ${userToken}` } },
    );
    expect(res.status()).toBe(200);

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );

    let observedFinalStatus: string | null = null;
    for (let i = 0; i < 60; i++) {
      const { data } = await sb
        .from("projects")
        .select("analyst_status")
        .eq("id", projectId)
        .single();
      const status = (data as { analyst_status: string } | null)?.analyst_status ?? null;
      if (status === "complete" || status === "failed") {
        observedFinalStatus = status;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(observedFinalStatus).toBe("complete");

    // Assert the analyst_documents row landed with fixture-shaped content.
    const { data: doc } = await sb
      .from("analyst_documents")
      .select(
        "project_id, pain_points, patterns, key_quotes, customer_language, saturation_score, interview_count",
      )
      .eq("project_id", projectId)
      .maybeSingle();
    expect(doc).not.toBeNull();
    expect(doc).toMatchObject({
      project_id: projectId,
      interview_count: 2,
    });
    // pain_points/key_quotes/patterns are arrays containing the mock fixture
    // entries — at least one of each.
    expect(Array.isArray((doc as { pain_points: unknown }).pain_points)).toBe(true);
    expect((doc as { pain_points: unknown[] }).pain_points.length).toBeGreaterThan(0);
    expect(Array.isArray((doc as { key_quotes: unknown }).key_quotes)).toBe(true);
    expect((doc as { key_quotes: unknown[] }).key_quotes.length).toBeGreaterThan(0);
  });
});
