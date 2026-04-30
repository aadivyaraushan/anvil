import { test, expect, restoreAuth } from "../fixtures";
import {
  cleanupProjectsForUser,
  getInterviewsForProject,
  getProjectsForUser,
  getUserIdByEmail,
  seedInterview,
  seedProject,
  upsertSubscription,
} from "../helpers/db";
import {
  clickByText,
  clickSelector,
  currentPath,
  fillSelector,
  visibleText,
  waitForPath,
  waitForSelector,
} from "../helpers/dom";

const devUrl = process.env.ANVIL_E2E_DEV_URL ?? "http://localhost:3000";

test.describe("@built built-app core workflows (WKWebView + real API + Supabase)", () => {
  let userId: string;

  test.beforeAll(async () => {
    const id = await getUserIdByEmail(process.env.E2E_TEST_EMAIL!);
    if (!id) throw new Error("E2E test user not found — check global-setup");
    userId = id;
    await upsertSubscription({ userId, plan: "free" });
  });

  test.beforeEach(async ({ tauriPage }) => {
    await cleanupProjectsForUser(userId);
    await restoreAuth(tauriPage);
  });

  test.afterEach(async () => {
    await cleanupProjectsForUser(userId);
  });

  test("auth survives direct dashboard/settings/billing navigation in the built app", async ({
    tauriPage,
  }) => {
    await tauriPage.goto(`${devUrl}/dashboard`);
    await expect.poll(() => currentPath(tauriPage)).toBe("/dashboard");
    await expect.poll(() => visibleText(tauriPage)).toContain("New project");

    await tauriPage.goto(`${devUrl}/settings`);
    await expect.poll(() => currentPath(tauriPage)).toBe("/settings");
    await expect.poll(() => visibleText(tauriPage)).toContain("Settings");
    await expect.poll(() => visibleText(tauriPage)).toContain(process.env.E2E_TEST_EMAIL!);

    await tauriPage.goto(`${devUrl}/billing?success=true`);
    await expect.poll(() => currentPath(tauriPage)).toBe("/billing?success=true");
    await expect.poll(() => visibleText(tauriPage)).toContain("Billing");
    await expect.poll(() => visibleText(tauriPage)).toContain("Free");
  });

  test("dashboard empty state renders in built WKWebView", async ({
    tauriPage,
  }) => {
    await tauriPage.goto(`${devUrl}/dashboard`);
    await expect.poll(() => visibleText(tauriPage)).toContain("New project");
    await expect.poll(() => visibleText(tauriPage)).toContain("No projects yet");
  });

  test("seeded project workspace renders in built WKWebView", async ({
    tauriPage,
  }) => {
    const projectId = await seedProject({
      userId,
      name: "Built Seeded Project",
      ideaDescription: "Seeded before dashboard load",
    });
    await tauriPage.goto(`${devUrl}/project/${projectId}`);
    await expect.poll(() => visibleText(tauriPage)).toContain("Built Seeded Project");
    await expect.poll(() => currentPath(tauriPage)).toBe(`/project/${projectId}`);
  });

  test("create project through built app persists row and routes to workspace", async ({
    tauriPage,
  }) => {
    await tauriPage.goto(`${devUrl}/dashboard/new`);
    await fillSelector(tauriPage, "#name", "Built Project Create");
    await fillSelector(
      tauriPage,
      "#idea_description",
      "Created from the packaged Tauri WKWebView path."
    );
    await clickByText(tauriPage, "button", "Create project");
    const path = await waitForPath(tauriPage, "^/project/[0-9a-f-]{36}$");
    const projectId = path.split("/").pop()!;

    const rows = await getProjectsForUser(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(projectId);
    expect(rows[0].name).toBe("Built Project Create");
    expect(rows[0].idea_description).toBe(
      "Created from the packaged Tauri WKWebView path."
    );
  });

  test("edit project settings through built app persists changed fields", async ({
    tauriPage,
  }) => {
    const projectId = await seedProject({
      userId,
      name: "Built Settings Original",
      ideaDescription: "Before edit",
      targetProfile: "Before profile",
    });

    await tauriPage.goto(`${devUrl}/project/${projectId}/settings`);
    await fillSelector(tauriPage, "#name", "Built Settings Edited");
    await fillSelector(tauriPage, "#idea_description", "Edited from built app");
    await fillSelector(tauriPage, "#target_profile", "Built target profile");
    await clickByText(tauriPage, "button", "Save changes");
    await expect.poll(() => visibleText(tauriPage)).toContain("Saved.");

    const row = (await getProjectsForUser(userId)).find((p) => p.id === projectId);
    expect(row?.name).toBe("Built Settings Edited");
    expect(row?.idea_description).toBe("Edited from built app");
    expect(row?.target_profile).toBe("Built target profile");
  });

  test("delete project from settings removes row and returns to dashboard", async ({
    tauriPage,
  }) => {
    const projectId = await seedProject({ userId, name: "Built Settings Delete" });
    await seedInterview({ projectId, attendeeName: "Cascade Child" });

    await tauriPage.goto(`${devUrl}/project/${projectId}/settings`);
    await clickSelector(tauriPage, '[data-testid="delete-project-open"]');
    await fillSelector(tauriPage, '[data-testid="delete-project-input"]', "Built Settings Delete");
    await clickSelector(tauriPage, '[data-testid="delete-project-submit"]');
    await waitForPath(tauriPage, "^/dashboard$");

    const rows = await getProjectsForUser(userId);
    expect(rows.find((row) => row.id === projectId)).toBeUndefined();
    expect(await getInterviewsForProject(projectId)).toHaveLength(0);
  });

  test("delete project from dashboard kebab removes row", async ({ tauriPage }) => {
    await tauriPage.goto(`${devUrl}/dashboard/new`);
    await fillSelector(tauriPage, "#name", "Built Dashboard Delete");
    await fillSelector(tauriPage, "#idea_description", "Delete from dashboard");
    await clickByText(tauriPage, "button", "Create project");
    const path = await waitForPath(tauriPage, "^/project/[0-9a-f-]{36}$");
    const projectId = path.split("/").pop()!;

    await restoreAuth(tauriPage);
    await tauriPage.goto(`${devUrl}/dashboard`);
    await waitForSelector(tauriPage, `[data-testid="project-row-${projectId}"]`);
    await clickSelector(tauriPage, `[data-testid="project-row-kebab-${projectId}"]`);
    await clickSelector(tauriPage, `[data-testid="project-row-delete-${projectId}"]`);
    await fillSelector(
      tauriPage,
      `[data-testid="project-row-delete-input-${projectId}"]`,
      "Built Dashboard Delete"
    );
    await clickSelector(tauriPage, `[data-testid="project-row-delete-confirm-${projectId}"]`);

    await expect
      .poll(async () => (await getProjectsForUser(userId)).some((row) => row.id === projectId))
      .toBe(false);
  });

  test("free project limit blocks second project in built app", async ({
    tauriPage,
  }) => {
    await upsertSubscription({ userId, plan: "free" });
    await seedProject({ userId, name: "Existing Free Project" });

    await tauriPage.goto(`${devUrl}/dashboard/new`);
    await fillSelector(tauriPage, "#name", "Blocked Built Project");
    await fillSelector(tauriPage, "#idea_description", "Should not insert");
    await clickByText(tauriPage, "button", "Create project");

    await expect.poll(() => currentPath(tauriPage)).toBe("/dashboard/new");
    await waitForSelector(tauriPage, '[data-testid="plan-limit-banner"]');
    expect(await getProjectsForUser(userId)).toHaveLength(1);
  });

  test("schedule in-person conversation through built app persists interview row", async ({
    tauriPage,
  }) => {
    const projectId = await seedProject({ userId, name: "Built Interviews" });

    await tauriPage.goto(`${devUrl}/project/${projectId}`);
    await clickByText(tauriPage, "button", "Add conversation");
    await fillSelector(tauriPage, "input[placeholder*='Attendee name']", "Built In Person");
    await clickByText(tauriPage, "button", "Schedule conversation");
    await expect.poll(() => visibleText(tauriPage)).toContain("Built In Person");

    const interviews = await getInterviewsForProject(projectId);
    expect(interviews).toHaveLength(1);
    expect(interviews[0].attendee_name).toBe("Built In Person");
    expect(interviews[0].source).toBe("inperson");
    expect(interviews[0].status).toBe("scheduled");
  });

  test("schedule online conversation through built app persists non-inperson source", async ({
    tauriPage,
  }) => {
    const projectId = await seedProject({ userId, name: "Built Online Interview" });

    await tauriPage.goto(`${devUrl}/project/${projectId}`);
    await clickByText(tauriPage, "button", "Add conversation");
    await clickByText(tauriPage, "button", "Online");
    await fillSelector(tauriPage, "input[placeholder*='Attendee name']", "Built Online");
    await fillSelector(
      tauriPage,
      "input[placeholder*='meet.google.com'], input[placeholder*='zoom.us'], input[placeholder*='Meeting link']",
      "https://meet.google.com/abc-defg-hij"
    );
    await clickByText(tauriPage, "button", "Anvil will join");
    await expect.poll(() => visibleText(tauriPage)).toContain("Built Online");

    await expect
      .poll(async () => getInterviewsForProject(projectId), { timeout: 15_000 })
      .toHaveLength(1);
    const interviews = await getInterviewsForProject(projectId);
    expect(interviews).toHaveLength(1);
    expect(interviews[0].attendee_name).toBe("Built Online");
    expect(interviews[0].source).not.toBe("inperson");
  });

  test("delete conversation through built app removes interview row", async ({
    tauriPage,
  }) => {
    const projectId = await seedProject({ userId, name: "Built Delete Interview" });
    const interviewId = await seedInterview({
      projectId,
      attendeeName: "Built Conversation Delete",
    });

    await tauriPage.goto(`${devUrl}/project/${projectId}`);
    await clickSelector(tauriPage, `[data-testid="interview-row-${interviewId}"]`);
    await clickSelector(tauriPage, '[data-testid="interview-row-kebab"]');
    await clickSelector(tauriPage, '[data-testid="interview-row-delete"]');
    await waitForSelector(tauriPage, '[data-testid="interview-row-delete-dialog"]');
    await clickSelector(tauriPage, '[data-testid="interview-row-delete-confirm"]');

    await expect
      .poll(async () => (await getInterviewsForProject(projectId)).some((row) => row.id === interviewId))
      .toBe(false);
  });

  test("free interview limit blocks third conversation in built app", async ({
    tauriPage,
  }) => {
    const projectId = await seedProject({ userId, name: "Built Interview Limit" });
    await seedInterview({ projectId, attendeeName: "Existing One" });
    await seedInterview({ projectId, attendeeName: "Existing Two" });

    await tauriPage.goto(`${devUrl}/project/${projectId}`);
    await clickByText(tauriPage, "button", "Add conversation");
    await fillSelector(tauriPage, "input[placeholder*='Attendee name']", "Blocked Third");
    await clickByText(tauriPage, "button", "Schedule conversation");

    await waitForSelector(tauriPage, '[data-testid="plan-limit-banner"]');
    const interviews = await getInterviewsForProject(projectId);
    expect(interviews).toHaveLength(2);
    expect(interviews.find((row) => row.attendee_name === "Blocked Third")).toBeUndefined();
  });

  test("seeded unicode and long interview data renders without losing workspace", async ({
    tauriPage,
  }) => {
    const projectId = await seedProject({ userId, name: "Built Weird Data" });
    const longName = `Very Long Built WKWebView Participant ${"x".repeat(140)}`;
    await seedInterview({
      projectId,
      attendeeName: `佐藤 Built ✨ ${longName}`,
      source: "inperson",
    });

    await tauriPage.goto(`${devUrl}/project/${projectId}`);
    await expect.poll(() => visibleText(tauriPage)).toContain("佐藤 Built");
    await expect.poll(() => currentPath(tauriPage)).toBe(`/project/${projectId}`);
  });
});
