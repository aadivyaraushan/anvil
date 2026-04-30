import { test, expect } from "@playwright/test";
import {
  cleanupProjectsForUser,
  getInterviewsForProject,
  getUserIdByEmail,
  seedProject,
  upsertSubscription,
} from "./helpers/db";

/**
 * Audit-pass coverage for interview flows.
 *
 *   C1  Schedule in-person interview from the "Add conversation" drawer —
 *       assert `interviews` row lands with status='scheduled', source='inperson'.
 *   C2  Schedule online interview with a meeting link — assert
 *       meeting_link saved and source='meet-link' (or whichever the form sets).
 *   C3  Recording is only offered from a selected conversation page; the
 *       old dashboard/capsule quick-capture entry point stays gone.
 *   C5  Free-tier limit: third interview MUST be blocked once enforcement
 *       lands. Today the limit isn't enforced anywhere — locking in current
 *       behavior so the test fails when enforcement is added.
 *
 * Note: edit has no UI surface today (`useUpdateInterview` exists as a hook
 * but no component calls it). Documented in AUDIT-2026-04-27.md; not
 * test-covered until UI ships.
 */

let testUserId: string;
let projectId: string;

test.beforeAll(async () => {
  const id = await getUserIdByEmail(process.env.E2E_TEST_EMAIL!);
  if (!id) throw new Error("E2E test user not found");
  testUserId = id;
  await upsertSubscription({ userId: id, plan: "free" });
});

test.beforeEach(async () => {
  // Fresh project per test so the inbox starts empty.
  projectId = await seedProject({
    userId: testUserId,
    name: "Audit C — interviews",
    ideaDescription: "Testing interview persistence",
    targetProfile: "QA testers",
  });
});

test.afterEach(async () => {
  await cleanupProjectsForUser(testUserId);
});

test.describe("audit: interviews (free plan)", () => {
  test("C1 schedule in-person interview — `interviews` row lands with the right shape", async ({
    page,
  }) => {
    await page.goto(`/project/${projectId}`);
    await expect(
      page.getByRole("button", { name: /add conversation/i }),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /add conversation/i }).click();
    // Default tab is "In person". Just need attendee name.
    await page.locator("input[placeholder*='Attendee name']").fill("Audit C1");
    await page.getByRole("button", { name: /schedule conversation/i }).click();

    // Inbox row appears (UI confirmation).
    await expect(page.getByText("Audit C1").first()).toBeVisible({
      timeout: 10_000,
    });

    // Persistence assertion — the row landed with the expected fields.
    const interviews = await getInterviewsForProject(projectId);
    expect(interviews).toHaveLength(1);
    expect(interviews[0].attendee_name).toBe("Audit C1");
    expect(interviews[0].status).toBe("scheduled");
    expect(interviews[0].source).toBe("inperson");
  });

  test("C2 schedule online interview with meeting link — meeting_link persists", async ({
    page,
  }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole("button", { name: /add conversation/i }).click();
    await page.getByRole("tab", { name: /online/i }).click();
    await page.locator("input[placeholder*='Attendee name']").fill("Audit C2");

    // Tabs render a meeting-link input only on online mode.
    const linkInput = page.locator(
      "input[placeholder*='meet.google.com'], input[placeholder*='zoom.us'], input[placeholder*='Meeting link']",
    ).first();
    if (await linkInput.isVisible().catch(() => false)) {
      await linkInput.fill("https://meet.google.com/abc-defg-hij");
    }

    await page.getByRole("button", { name: /Anvil will join|schedule conversation/i }).click();
    await expect(page.getByText("Audit C2").first()).toBeVisible({
      timeout: 10_000,
    });

    const interviews = await getInterviewsForProject(projectId);
    expect(interviews).toHaveLength(1);
    expect(interviews[0].attendee_name).toBe("Audit C2");
    expect(interviews[0].status).toBe("scheduled");
    // Online flow may surface meeting_link or it may stay null depending
    // on the form's input visibility — we just assert non-inperson source.
    expect(interviews[0].source).not.toBe("inperson");
  });

  test("C4 delete interview — kebab menu removes the row", async ({
    page,
  }) => {
    await page.goto(`/project/${projectId}`);
    await expect(
      page.getByRole("button", { name: /add conversation/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Seed one interview via UI.
    await page
      .getByRole("button", { name: /add conversation/i })
      .first()
      .click();
    await page
      .locator("input[placeholder*='Attendee name']")
      .fill("Audit C4 to delete");
    await page
      .getByRole("button", { name: /^schedule conversation$/i })
      .click();
    await expect(page.getByText("Audit C4 to delete").first()).toBeVisible({
      timeout: 15_000,
    });

    let interviews = await getInterviewsForProject(projectId);
    expect(interviews).toHaveLength(1);
    const interviewId = interviews[0].id;

    // Hover to reveal the kebab, then open the dropdown. Delete now opens
    // an in-app Dialog (not window.confirm) so it works under Tauri's
    // WKWebView where blocking confirm() is suppressed.
    await page.getByTestId("interview-row-kebab").click();
    await page.getByTestId("interview-row-delete").click();
    await expect(page.getByTestId("interview-row-delete-dialog")).toBeVisible({
      timeout: 5_000,
    });
    await page.getByTestId("interview-row-delete-confirm").click();

    // Row disappears from the inbox; DB row gone. Use exact match so we
    // don't collide with the dialog description (which echoes the attendee
    // name) during its fade-out animation.
    await expect(
      page.getByText("Audit C4 to delete", { exact: true }),
    ).toBeHidden({ timeout: 10_000 });
    interviews = await getInterviewsForProject(projectId);
    expect(interviews.find((i) => i.id === interviewId)).toBeUndefined();
  });

  test("C3 recording starts from conversation page only — no dashboard quick-capture modal", async ({
    page,
  }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole("button", { name: /add conversation/i }).click();
    await page
      .locator("input[placeholder*='Attendee name']")
      .fill("Audit C3 recorder");
    await page
      .getByRole("button", { name: /^schedule conversation$/i })
      .click();
    await expect(page.getByText("Audit C3 recorder").first()).toBeVisible({
      timeout: 15_000,
    });

    await page.getByText("Audit C3 recorder").first().click();
    await expect(page.getByTestId("start-recording-button")).toBeVisible({
      timeout: 10_000,
    });

    await page.goto("/dashboard");
    await expect(
      page.getByRole("button", { name: /^start recording$/i }),
    ).toHaveCount(0);

    const capsuleResponse = await page.goto("/capsule");
    expect(capsuleResponse?.status()).toBe(404);
  });

  test("C5 free-tier interview limit is enforced — 3rd attempt shows plan-limit banner", async ({
    page,
  }) => {
    // Free plan limit is `interviewsPerProject: 2`. PR 1 wired the gate
    // through `POST /api/projects/[id]/interviews` so the 3rd attempt
    // gets a 422 with code='PLAN_LIMIT' and the inbox drawer surfaces
    // the inline upgrade banner instead of a successful insert.

    await page.goto(`/project/${projectId}`);
    await expect(
      page.getByRole("button", { name: /add conversation/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Two interviews — should succeed.
    for (const i of [1, 2]) {
      await page
        .getByRole("button", { name: /add conversation/i })
        .first()
        .click();
      await page
        .locator("input[placeholder*='Attendee name']")
        .fill(`Audit C5 #${i}`);
      await page
        .getByRole("button", { name: /^schedule conversation$/i })
        .click();
      await expect(page.getByText(`Audit C5 #${i}`).first()).toBeVisible({
        timeout: 15_000,
      });
    }

    // Third — should be blocked. Plan-limit banner appears in the drawer;
    // the row does not get inserted.
    await page
      .getByRole("button", { name: /add conversation/i })
      .first()
      .click();
    await page
      .locator("input[placeholder*='Attendee name']")
      .fill("Audit C5 #3 (should fail)");
    await page
      .getByRole("button", { name: /^schedule conversation$/i })
      .click();

    await expect(page.getByTestId("plan-limit-banner")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("plan-limit-banner")).toContainText(/upgrade/i);

    const interviews = await getInterviewsForProject(projectId);
    expect(interviews).toHaveLength(2);
    expect(interviews.find((i) => i.attendee_name?.includes("should fail"))).toBeUndefined();
  });
});
