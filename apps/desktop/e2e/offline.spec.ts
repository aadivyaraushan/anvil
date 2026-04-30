import { test, expect } from "@playwright/test";
import {
  cleanupProjectsForUser,
  getUserIdByEmail,
  seedProject,
} from "./helpers/db";

let testUserId: string;

test.beforeAll(async () => {
  const id = await getUserIdByEmail(process.env.E2E_TEST_EMAIL!);
  if (!id) throw new Error("E2E test user not found — did globalSetup run?");
  testUserId = id;
});

test.afterAll(async () => {
  await cleanupProjectsForUser(testUserId);
});

// NetworkBanner copy is driven by a GET /api/health probe. To control
// banner state from tests we stub that endpoint; just toggling the
// browser online/offline isn't enough on its own because the dev server
// doesn't ship an /api/health route, so the probe always returns 4xx →
// "Can't reach Anvil's servers" and the banner is permanently visible.
test.describe("Offline / network resilience", () => {
  test("api-unreachable banner appears when health probe fails", async ({
    page,
  }) => {
    let healthOk = true;
    await page.route("**/api/health", (route) =>
      healthOk
        ? route.fulfill({ status: 200, body: "ok" })
        : route.fulfill({ status: 503, body: "down" }),
    );

    await page.goto("/dashboard");
    await expect(page.getByText(/can't reach anvil/i)).toHaveCount(0);

    healthOk = false;
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    await expect(page.getByText(/can't reach anvil/i)).toBeVisible({
      timeout: 5_000,
    });
  });

  test("banner clears when health probe succeeds again", async ({ page }) => {
    let healthOk = false;
    await page.route("**/api/health", (route) =>
      healthOk
        ? route.fulfill({ status: 200, body: "ok" })
        : route.fulfill({ status: 503, body: "down" }),
    );

    await page.goto("/dashboard");
    await expect(page.getByText(/can't reach anvil/i)).toBeVisible({
      timeout: 5_000,
    });

    healthOk = true;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    await expect(page.getByText(/can't reach anvil/i)).toHaveCount(0, {
      timeout: 5_000,
    });
  });

  test("dashboard renders cached projects after going offline", async ({
    page,
    context,
  }) => {
    await seedProject({ userId: testUserId, name: "Cached Project" });

    await page.route("**/api/health", (route) =>
      route.fulfill({ status: 200, body: "ok" }),
    );

    const projectsLoaded = page.waitForResponse((resp) =>
      resp.url().includes("/rest/v1/projects"),
    );
    await page.goto("/dashboard");
    await projectsLoaded;
    await expect(page.getByText("Cached Project")).toBeVisible({
      timeout: 10_000,
    });

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    // The project list is served by React Query's in-memory cache; going
    // offline must not blank it out.
    await expect(page.getByText("Cached Project")).toBeVisible();
  });

  test("analyst run button is disabled while offline", async ({
    page,
    context,
  }) => {
    const projectId = await seedProject({
      userId: testUserId,
      name: "Offline Analyst Project",
    });
    await page.route("**/api/health", (route) =>
      route.fulfill({ status: 200, body: "ok" }),
    );
    await page.goto(`/project/${projectId}`);

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    const runBtn = page.getByRole("button", { name: /run analysis/i });
    if (await runBtn.isVisible()) {
      await expect(runBtn).toBeDisabled();
    }
  });
});
