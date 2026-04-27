import { test, expect } from "@playwright/test";

test.describe("Marketing site", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("hero headline is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { level: 1 })
    ).toContainText("Record the");
    await expect(page.locator("h1")).toContainText("conversation.");
  });

  test("download button points to release URL", async ({ page }) => {
    const links = page.getByRole("link", { name: /download for mac/i });
    await expect(links.first()).toBeVisible();
    const href = await links.first().getAttribute("href");
    // Currently points at the GitHub releases page. Lock that in until
    // we cut over to a custom release host.
    expect(href).toMatch(/github\.com\/.+\/releases/);
  });

  test("nav links are present", async ({ page }) => {
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
    // Use .first() — "How it works" appears twice (nav link + section
    // heading). Same for "Pricing".
    await expect(page.getByText("How it works").first()).toBeVisible();
    await expect(page.getByText("Pricing").first()).toBeVisible();
  });

  test("how it works section renders all three steps", async ({ page }) => {
    await expect(page.getByText("Capture any conversation")).toBeVisible();
    await expect(page.getByText("Transcript appears in seconds")).toBeVisible();
    await expect(page.getByText("Findings surface automatically")).toBeVisible();
  });

  test("pricing section shows three plans with prices matching plans.ts", async ({
    page,
  }) => {
    await page.locator("#pricing").scrollIntoViewIfNeeded();
    // .first() — these names also appear in the hero/CTA and footer.
    // We're verifying the pricing cards render with the expected prices,
    // which match desktop's apps/desktop/src/lib/billing/plans.ts.
    await expect(page.getByText("Free").first()).toBeVisible();
    await expect(page.getByText("Pro").first()).toBeVisible();
    await expect(page.getByText("Max").first()).toBeVisible();
    await expect(page.getByText("$0").first()).toBeVisible();
    await expect(page.getByText("$29").first()).toBeVisible();
    await expect(page.getByText("$79").first()).toBeVisible();
  });

  test("footer has legal links", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Privacy" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Terms" })).toBeVisible();
  });

  test("app mock capsule copy is visible", async ({ page }) => {
    await expect(page.getByText("Recording")).toBeVisible();
    await expect(page.getByText("Stop & review")).toBeVisible();
  });
});

test.describe("Legal pages", () => {
  test("/privacy renders without errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    await page.goto("/privacy");
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test("/terms renders without errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    await page.goto("/terms");
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });
});
