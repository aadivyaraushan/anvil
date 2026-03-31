import { test, expect } from "@playwright/test";

test.describe("landing page pricing section", () => {
  test("renders three plan cards", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("#pricing");
    await expect(section).toBeVisible();
    await expect(section.getByText("Free", { exact: true }).first()).toBeVisible();
    await expect(section.getByText("Pro", { exact: true }).first()).toBeVisible();
    await expect(section.getByText("Max", { exact: true }).first()).toBeVisible();
  });

  test("shows correct prices", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("#pricing");
    await expect(section.getByText("$0")).toBeVisible();
    await expect(section.getByText("$29")).toBeVisible();
    await expect(section.getByText("$79")).toBeVisible();
  });

  test("Pro card shows Most popular badge", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#pricing").getByText("Most popular")).toBeVisible();
  });

  test("CTA buttons link to /signup", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("#pricing");
    const ctaLinks = section.getByRole("link");
    const count = await ctaLinks.count();
    expect(count).toBe(3);
    for (let i = 0; i < count; i++) {
      await expect(ctaLinks.nth(i)).toHaveAttribute("href", "/signup");
    }
  });

  test("hero See pricing button links to #pricing", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "See pricing" })).toHaveAttribute("href", "#pricing");
  });
});
