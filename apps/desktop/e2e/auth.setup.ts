import { test as setup, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const AUTH_FILE = path.join(__dirname, ".auth/user.json");

setup("authenticate as E2E test user", async ({ page }) => {
  // Ensure .auth directory exists
  const dir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  await page.goto("/login");
  await expect(page).toHaveURL("/login");

  await page.locator("#email").fill(process.env.E2E_TEST_EMAIL!);
  await page.locator("#password").fill(process.env.E2E_TEST_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL("/dashboard", { timeout: 15_000 });
  await expect(page).toHaveURL("/dashboard");

  await page.context().storageState({ path: AUTH_FILE });
});
