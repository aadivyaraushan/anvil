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
    // At least one download link
    await expect(links.first()).toBeVisible();
    const href = await links.first().getAttribute("href");
    expect(href).toContain("releases.anvil.app");
    expect(href).toContain(".dmg");
  });

  test("nav links are present", async ({ page }) => {
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
    await expect(page.getByText("How it works")).toBeVisible();
    await expect(page.getByText("Pricing")).toBeVisible();
  });

  test("how it works section renders all three steps", async ({ page }) => {
    await expect(page.getByText("Capture any conversation")).toBeVisible();
    await expect(page.getByText("Transcript appears in seconds")).toBeVisible();
    await expect(page.getByText("Findings surface automatically")).toBeVisible();
  });

  test("pricing section shows three plans", async ({ page }) => {
    await page.locator("#pricing").scrollIntoViewIfNeeded();
    await expect(page.getByText("Free")).toBeVisible();
    await expect(page.getByText("Pro")).toBeVisible();
    await expect(page.getByText("Max")).toBeVisible();
    // Prices
    await expect(page.getByText("$0")).toBeVisible();
    await expect(page.getByText("$29")).toBeVisible();
    await expect(page.getByText("$79")).toBeVisible();
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
