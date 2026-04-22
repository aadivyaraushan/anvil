import { test, expect } from "@playwright/test";
import { cleanupProjectsForUser, getUserIdByEmail, seedProject } from "./helpers/db";

let testUserId: string;

test.beforeAll(async () => {
  const id = await getUserIdByEmail(process.env.E2E_TEST_EMAIL!);
  if (!id) throw new Error("E2E test user not found — did globalSetup run?");
  testUserId = id;
});

test.afterAll(async () => {
  await cleanupProjectsForUser(testUserId);
});

test.describe("Offline / network resilience", () => {
  test("offline banner appears when network is blocked", async ({
    page,
    context,
  }) => {
    await page.goto("/dashboard");

    // Block all network requests to simulate offline state
    await context.setOffline(true);

    // Trigger a navigation or reload that would check network
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    // The NetworkBanner should appear
    await expect(
      page.getByText(/offline/i)
    ).toBeVisible({ timeout: 5000 });
  });

  test("online banner disappears when network is restored", async ({
    page,
    context,
  }) => {
    await page.goto("/dashboard");

    // Go offline
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.getByText(/offline/i)).toBeVisible({ timeout: 5000 });

    // Restore network
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    // Banner should be gone
    await expect(page.getByText(/offline/i)).not.toBeVisible({ timeout: 5000 });
  });

  test("dashboard renders cached projects while offline", async ({
    page,
    context,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Cached Project",
    });

    // Load while online so React Query can cache
    await page.goto("/dashboard");
    await expect(page.getByText("Cached Project")).toBeVisible({ timeout: 10000 });

    // Go offline
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    // Project should still be visible from cache
    await expect(page.getByText("Cached Project")).toBeVisible();

    await cleanupProjectsForUser(testUserId);
  });

  test("analyst run button is disabled while offline", async ({
    page,
    context,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Offline Analyst Project",
    });
    await page.goto(`/project/${projectId}`);

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    const runBtn = page.getByRole("button", { name: /run analysis/i });
    if (await runBtn.isVisible()) {
      await expect(runBtn).toBeDisabled();
    }

    await cleanupProjectsForUser(testUserId);
  });
});
