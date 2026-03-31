import { test, expect } from "@playwright/test";

// These tests run in the 'auth-tests' project which has NO storageState.
// They verify that unauthenticated users are redirected to /login,
// and that public auth pages render correctly.

test.describe("unauthenticated redirect protection", () => {
  test("GET /dashboard redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL("/login", { timeout: 10_000 });
    await expect(page).toHaveURL("/login");
  });

  test("GET /project/:id redirects to /login", async ({ page }) => {
    await page.goto("/project/00000000-0000-0000-0000-000000000000");
    await page.waitForURL("/login", { timeout: 10_000 });
    await expect(page).toHaveURL("/login");
  });

  test("GET /settings redirects to /login", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForURL("/login", { timeout: 10_000 });
    await expect(page).toHaveURL("/login");
  });
});

test.describe("public auth pages", () => {
  test("GET /login renders the login form", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL("/login");
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
  });

  test("GET /signup renders the signup form", async ({ page }) => {
    await page.goto("/signup");
    await expect(page).toHaveURL("/signup");
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
  });

  test("login with bad credentials shows error message", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill("nobody@nowhere.invalid");
    await page.locator("#password").fill("wrongpassword");
    await page.getByRole("button", { name: "Log in" }).click();
    // Error rendered as <p class="text-destructive">...</p>
    await expect(page.locator("p.text-destructive")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("landing page renders without authentication", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();
  });
});
