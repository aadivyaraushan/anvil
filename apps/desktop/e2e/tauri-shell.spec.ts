import { test, expect } from "@playwright/test";

// Scope note. Real Tauri runtime testing (Rust commands, native FS,
// global shortcuts, the macOS WKWebView quirks the app actually ships
// on) requires `tauri-driver` against a built `.app`. Trying to fake
// __TAURI_INTERNALS__ in headless Chrome breaks the moment the app
// `await import("@tauri-apps/api/core")`s — that package's web build
// has runtime guards and throws when invoked without a real backend.
//
// What this file CAN cover safely from Chrome:
//   - the "no Tauri detected" graceful fallback users see when they
//     visit /capsule in a regular browser;
//   - that the capsule renders without unhandled errors in that mode;
//   - that the visible chrome (timer, waveform, close button, project
//     picker) is in place.
//
// JS-side behavior of the useTauri hook itself is covered by Vitest in
// src/lib/hooks/__tests__/use-tauri.test.ts (where we can mock the
// dynamic imports cleanly).

test.describe("Capsule — non-Tauri (browser) graceful fallback", () => {
  test("renders 'Requires desktop app' notice when window.__TAURI__ is absent", async ({
    page,
  }) => {
    await page.goto("/capsule");
    await expect(
      page.getByText(/requires the anvil desktop app/i),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /start recording/i }),
    ).toBeDisabled();
  });

  test("close button does not throw when clicked outside Tauri", async ({
    page,
  }) => {
    let pageError: string | null = null;
    page.on("pageerror", (e) => {
      pageError = String(e.message ?? e);
    });

    await page.goto("/capsule");
    await page.getByRole("button", { name: /close|✕/i }).click();
    await page.waitForTimeout(300);

    expect(pageError).toBeNull();
  });

  test("waveform bars render before recording starts", async ({ page }) => {
    await page.goto("/capsule");
    const bars = page.locator("div.flex.items-center.gap-px > div");
    await expect(bars.first()).toBeVisible({ timeout: 10_000 });
    expect(await bars.count()).toBe(36);
  });

  test("duration timer starts at 00:00", async ({ page }) => {
    await page.goto("/capsule");
    await expect(page.getByText("00:00")).toBeVisible();
  });

  test("the 'Ready to record' state renders without error", async ({ page }) => {
    await page.goto("/capsule");
    await expect(page.getByText(/Ready to record/i)).toBeVisible();
  });
});
