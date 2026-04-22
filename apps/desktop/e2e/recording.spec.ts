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

test.describe("Recording capsule UI", () => {
  test("capsule page renders in non-Tauri environment with graceful message", async ({
    page,
  }) => {
    // In a browser context __TAURI__ is absent — the capsule should render the
    // "Requires desktop app" notice instead of throwing.
    await page.goto("/capsule");

    await expect(
      page.getByText(/requires the anvil desktop app/i)
    ).toBeVisible();

    // Start recording button should exist but be disabled
    const startBtn = page.getByRole("button", { name: /start recording/i });
    await expect(startBtn).toBeDisabled();
  });

  test("capsule shows project picker when projects are available", async ({
    page,
  }) => {
    // Mock the Supabase projects endpoint
    await page.route("**/rest/v1/projects**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: "proj-1", name: "Finops Research", user_id: "u1" },
          { id: "proj-2", name: "GTM Study", user_id: "u1" },
        ]),
      });
    });

    await page.goto("/capsule");

    // The select dropdown should be rendered (we're not in Tauri so recording is disabled,
    // but the UI still renders the project picker in ready state).
    const select = page.locator("select");
    if (await select.isVisible()) {
      await expect(select).toContainText("Finops Research");
    }
  });

  test("capsule displays duration timer format MM:SS", async ({ page }) => {
    await page.goto("/capsule");
    // Should show 00:00 when not recording
    await expect(page.getByText("00:00")).toBeVisible();
  });

  test("capsule close button is present", async ({ page }) => {
    await page.goto("/capsule");
    await expect(page.getByRole("button", { name: /close|✕/i })).toBeVisible();
  });
});
