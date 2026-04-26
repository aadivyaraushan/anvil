import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  cleanupProjectsForUser,
  getUserIdByEmail,
  supportsRedesignSchema,
} from "./helpers/db";

/**
 * Full front-to-back user flow as one continuous test. Every other spec
 * targets a slice; this one drives the entire journey from sign-out
 * through transcript appearing through findings rendering.
 *
 * Scope:
 *   1.  Sign out (sidebar Log out)
 *   2.  Sign in via /login form
 *   3.  Land on dashboard, click New project
 *   4.  Create a project via the form
 *   5.  Land in the project workspace, see empty inbox + locked findings
 *   6.  Open the Add interview drawer, fill it, submit
 *   7.  See the new interview row appear in the inbox
 *   8.  Click the row, canvas opens with placeholder
 *   9.  Simulate Deepgram completion via service-role write
 *       (real transcription requires actual audio + Deepgram; the API
 *       route's behavior is covered in apps/api/src/__tests__/unit/.)
 *  10.  Reload, see transcript lines render in the canvas
 *  11.  Simulate analyst run completion via service-role write
 *  12.  Verify the findings rail surfaces the seeded pain point
 *  13.  Sign out via the sidebar, end on /login
 *
 * Run-time: ~15s. Catches integration regressions across auth /
 * routing / mutation / refetch / canvas / findings rendering that no
 * single-slice spec covers.
 */

let testUserId: string;
let schemaReady = false;

const TEST_PROJECT_NAME = "FF: Full-Flow Project";
const TEST_ATTENDEE = "FF: Pat Lee";
const TEST_TRANSCRIPT = [
  { speaker: "Speaker 0", text: "Hi Pat, thanks for joining today.", timestamp: 500 },
  { speaker: "Speaker 1", text: "Happy to help. What are we covering?", timestamp: 2100 },
  { speaker: "Speaker 0", text: "Walk me through your month-end close.", timestamp: 4800 },
  { speaker: "Speaker 1", text: "Honestly, it eats my whole first week.", timestamp: 7400 },
];

test.beforeAll(async () => {
  testUserId = (await getUserIdByEmail(process.env.E2E_TEST_EMAIL!))!;
  if (!testUserId) throw new Error("E2E test user not found — did globalSetup run?");
  schemaReady = await supportsRedesignSchema();
});

test.afterEach(async () => {
  await cleanupProjectsForUser(testUserId);
});

// Service-role helper for the two simulated-async-completion steps. We
// can't actually run Deepgram or the analyst pipeline E2E without real
// audio + API keys; the API route is covered by Vitest. Here we directly
// write the rows the pipeline would have written, which is exactly what
// the desktop client polls for.
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function findInterviewIdByAttendee(
  projectId: string,
  attendee: string,
): Promise<string> {
  const sb = adminClient();
  const { data, error } = await sb
    .from("interviews")
    .select("id")
    .eq("project_id", projectId)
    .eq("attendee_name", attendee)
    .limit(1)
    .single();
  if (error || !data) throw new Error(`interview row not found: ${error?.message}`);
  return (data as { id: string }).id;
}

async function injectDeepgramCompletion(
  interviewId: string,
  transcript: Array<{ speaker: string; text: string; timestamp: number }>,
) {
  const sb = adminClient();
  const { error } = await sb
    .from("interviews")
    .update({
      transcript,
      upload_status: "done",
      status: "completed",
    })
    .eq("id", interviewId);
  if (error) throw new Error(`injectDeepgramCompletion: ${error.message}`);
}

async function injectAnalystCompletion(projectId: string) {
  const sb = adminClient();
  const { error } = await sb
    .from("analyst_documents")
    .update({
      content: { summary: "Manual close eats most of week 1." },
      pain_points: [
        {
          title: "Month-end close consumes a full week",
          count: 1,
          severity: "high",
        },
      ],
      patterns: [],
      key_quotes: [],
      customer_language: ["month-end close", "first week"],
      saturation_score: 50,
      interview_count: 1,
      unique_pattern_count: 1,
    })
    .eq("project_id", projectId);
  if (error) throw new Error(`injectAnalystCompletion: ${error.message}`);
}

test.describe("End-to-end user flow", () => {
  // The full journey involves >10 navigations, ~5 mutations, and a
  // reload to refetch transcripts. The default 30s test timeout is
  // tight for that on cold dev-server startup; raise it here. The
  // individual locator timeouts inside the test stay short so the
  // failure mode is still informative.
  test.setTimeout(120_000);

  test.beforeEach(() => {
    test.skip(
      !schemaReady,
      "Requires migrations 010+/012 (interviews + analyst customer_language).",
    );
  });

  test("sign out → sign in → create project → add interview → see transcript → see findings → sign out", async ({
    page,
  }) => {
    // ------------------------------------------------------------------
    // 1. Sign out from the storageState-warm session.
    // ------------------------------------------------------------------
    await page.goto("/dashboard");
    await expect(
      page.getByRole("link", { name: "New project" }),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /log out/i }).click();
    await page.waitForURL("/login", { timeout: 15_000 });

    // ------------------------------------------------------------------
    // 2. Sign in via the form.
    // ------------------------------------------------------------------
    await page.locator("#email").fill(process.env.E2E_TEST_EMAIL!);
    await page.locator("#password").fill(process.env.E2E_TEST_PASSWORD!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("/dashboard", { timeout: 15_000 });

    // ------------------------------------------------------------------
    // 3-4. Create a project from the dashboard.
    // ------------------------------------------------------------------
    // Pin to a stable indicator (sidebar's Log out button) before
    // clicking — the dashboard re-renders multiple times right after
    // sign-in as useProjects / interviews-all / analyst_documents-all /
    // user_settings settle, and the New-project link gets detached
    // mid-click. waitForLoadState("networkidle") doesn't help because
    // the /api/health probe polls every 15s.
    await expect(page.getByRole("button", { name: /log out/i })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("link", { name: "New project" }).click();
    await page.waitForURL("/dashboard/new", { timeout: 10_000 });

    await page.locator("#name").fill(TEST_PROJECT_NAME);
    await page
      .locator("#idea_description")
      .fill("Discover what slows down month-end close for finance leaders.");

    await page.getByRole("button", { name: /create project/i }).click();
    await page.waitForURL(/\/project\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    const projectId = page.url().match(/\/project\/([0-9a-f-]{36})$/)![1];

    // ------------------------------------------------------------------
    // 5. Project workspace renders inbox + findings rail.
    // ------------------------------------------------------------------
    await expect(
      page.getByRole("button", { name: /add conversation/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Findings", { exact: true })).toBeVisible();
    await expect(page.getByText(/no conversations yet/i)).toBeVisible();

    // ------------------------------------------------------------------
    // 6. Add a conversation via the inline drawer (online mode).
    // ------------------------------------------------------------------
    await page.getByRole("button", { name: /add conversation/i }).click();
    await page.getByRole("tab", { name: /online/i }).click();
    await page
      .locator("input[placeholder*='Attendee name']")
      .fill(TEST_ATTENDEE);
    await page.getByRole("button", { name: /Anvil will join/i }).click();

    // ------------------------------------------------------------------
    // 7. Row appears in the inbox.
    // ------------------------------------------------------------------
    await expect(page.getByText(TEST_ATTENDEE)).toBeVisible({
      timeout: 10_000,
    });

    // ------------------------------------------------------------------
    // 8. Click the row, canvas should show the scheduled empty state.
    // ------------------------------------------------------------------
    await page.getByText(TEST_ATTENDEE).click();
    await expect(
      page.getByRole("button", { name: /start recording/i }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // ------------------------------------------------------------------
    // 9. Simulate Deepgram completing transcription.
    // ------------------------------------------------------------------
    const interviewId = await findInterviewIdByAttendee(projectId, TEST_ATTENDEE);
    await injectDeepgramCompletion(interviewId, TEST_TRANSCRIPT);

    // ------------------------------------------------------------------
    // 10. Reload to refetch (the desktop polls Supabase; reload is the
    //     deterministic way to force the React Query refetch).
    // ------------------------------------------------------------------
    await page.reload();
    await page.getByText(TEST_ATTENDEE).click();
    await expect(
      page.getByText("Hi Pat, thanks for joining today."),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("Happy to help. What are we covering?"),
    ).toBeVisible();
    await expect(
      page.getByText("Honestly, it eats my whole first week."),
    ).toBeVisible();

    // ------------------------------------------------------------------
    // 11. Simulate the analyst pipeline writing back results.
    // ------------------------------------------------------------------
    await injectAnalystCompletion(projectId);

    // ------------------------------------------------------------------
    // 12. Findings rail surfaces the seeded pain point + customer language.
    // ------------------------------------------------------------------
    await page.reload();
    await expect(
      page.getByText(/Month-end close consumes a full week/i),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("month-end close", { exact: true }),
    ).toBeVisible();

    // ------------------------------------------------------------------
    // 13. Sign out via sidebar — back to /login.
    // ------------------------------------------------------------------
    // Sidebar isn't on the project workspace; navigate to a page that
    // has it (dashboard / settings / billing).
    await page.goto("/dashboard");
    await expect(
      page.getByRole("button", { name: /log out/i }),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /log out/i }).click();
    await page.waitForURL("/login", { timeout: 15_000 });
    await expect(page).toHaveURL("/login");
  });
});
