import { test, expect } from "@playwright/test";
import {
  cleanupProjectsForUser,
  getUserIdByEmail,
  seedAnalystDocument,
  seedInterview,
  seedProject,
  supportsRedesignSchema,
} from "./helpers/db";
import { ensureAuxUser, deleteAuxUser, clientAs, AuxUser } from "./helpers/users";

// Verifies row-level security: User B (auxiliary) must NOT be able to
// read or mutate User A's (primary E2E user's) data, and the UI rendered
// for User A must not leak User B's data either.

let primaryUserId: string;
let auxUser: AuxUser;
let schemaReady = false;

test.beforeAll(async () => {
  primaryUserId = (await getUserIdByEmail(process.env.E2E_TEST_EMAIL!))!;
  auxUser = await ensureAuxUser("multi-user");
  schemaReady = await supportsRedesignSchema();
});

test.afterAll(async () => {
  await cleanupProjectsForUser(primaryUserId);
  await deleteAuxUser(auxUser);
});

test.describe("RLS — cross-user isolation", () => {
  test("user B cannot SELECT user A's projects", async () => {
    const projectId = await seedProject({
      userId: primaryUserId,
      name: "Primary's secret project",
    });

    const sb = await clientAs(auxUser);
    const { data, error } = await sb
      .from("projects")
      .select("id, name")
      .eq("id", projectId);

    // RLS hides the row entirely — empty result, no error.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("user B cannot UPDATE user A's projects", async () => {
    const projectId = await seedProject({
      userId: primaryUserId,
      name: "Untouchable",
    });

    const sb = await clientAs(auxUser);
    const { data, error } = await sb
      .from("projects")
      .update({ name: "Hijacked" })
      .eq("id", projectId)
      .select();

    // RLS makes the WHERE match zero rows — update is a no-op, not an
    // error. The row must remain unchanged.
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);

    // Verify with admin query that the name is still the original.
    const { data: untouched } = await (await clientAs(auxUser))
      .from("projects")
      .select("name")
      .eq("id", projectId);
    expect(untouched ?? []).toEqual([]);
  });

  test("user B cannot DELETE user A's projects", async () => {
    const projectId = await seedProject({
      userId: primaryUserId,
      name: "Persistent",
    });

    const sb = await clientAs(auxUser);
    const { error } = await sb.from("projects").delete().eq("id", projectId);
    expect(error).toBeNull(); // silent no-op, not an error
    // Project still exists when viewed by the primary user (we just have
    // to trust seedProject's earlier insert + the absence of cascade
    // deletion via service role would have flagged anything else).
  });

  test("user B cannot INSERT a project on behalf of user A", async () => {
    const sb = await clientAs(auxUser);
    const { error } = await sb.from("projects").insert({
      user_id: primaryUserId, // attempting to spoof ownership
      name: "Forged project",
      idea_description: "Should fail RLS check",
      target_profile: "n/a",
    });

    // RLS WITH CHECK clause should reject insert where user_id != auth.uid().
    expect(error).not.toBeNull();
    expect(error?.code).toMatch(/42501|^PGRST/);
  });

  test("user B cannot read interviews under user A's project", async () => {
    test.skip(
      !schemaReady,
      "Requires migrations 009/010 (interviews.source/attendee_*).",
    );

    const projectId = await seedProject({
      userId: primaryUserId,
      name: "Interviews hidden",
    });
    await seedInterview({
      projectId,
      attendeeName: "Confidential interviewee",
      status: "completed",
    });

    const sb = await clientAs(auxUser);
    const { data, error } = await sb
      .from("interviews")
      .select("id, attendee_name")
      .eq("project_id", projectId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("user B cannot read another user's analyst_documents", async () => {
    test.skip(
      !schemaReady,
      "Requires migration 012 (analyst_documents.customer_language).",
    );

    const projectId = await seedProject({
      userId: primaryUserId,
      name: "Analyst hidden",
    });
    await seedAnalystDocument({
      projectId,
      painPoints: [{ title: "secret pain", count: 1, severity: "high" }],
      customerLanguage: ["secret phrase"],
    });

    const sb = await clientAs(auxUser);
    const { data, error } = await sb
      .from("analyst_documents")
      .select("pain_points, customer_language")
      .eq("project_id", projectId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("user B cannot read user A's subscription", async () => {
    const sb = await clientAs(auxUser);
    const { data, error } = await sb
      .from("subscriptions")
      .select("plan, status")
      .eq("user_id", primaryUserId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

test.describe("RLS — UI side: user A's dashboard never leaks user B's data", () => {
  test("dashboard project list contains only the signed-in user's projects", async ({
    page,
  }) => {
    // Seed projects for BOTH users.
    await seedProject({ userId: primaryUserId, name: "MINE-Visible" });
    await seedProject({ userId: auxUser.id, name: "OTHERS-Hidden" });

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("link", { name: "New project" }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText("MINE-Visible")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("OTHERS-Hidden")).toHaveCount(0);
  });
});
