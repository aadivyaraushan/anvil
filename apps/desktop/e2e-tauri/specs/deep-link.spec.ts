import { test, expect, restoreAuth } from "../fixtures";
import { invoke } from "../helpers/ipc";

test.beforeEach(async ({ tauriPage }) => {
  await restoreAuth(tauriPage);
});

// Verifies the app-level deep-link forwarding path without asking macOS
// LaunchServices which installed Anvil build owns anvil:// on this machine.

test("anvil:// deep link reaches the main window as a `deep-link` event", async ({
  tauriPage,
}) => {
  const url = `anvil://project/abc?spec=tauri-e2e`;

  await invoke(tauriPage, "__test_dispatch_deep_link", { url });

  await expect
    .poll(
      () => invoke<string | null>(tauriPage, "__test_get_last_deep_link"),
      { timeout: 15_000 }
    )
    .not.toBeNull();
  const payload = await invoke<string>(tauriPage, "__test_get_last_deep_link");
  expect(payload).toContain("anvil://project/abc");
  expect(payload).toContain("spec=tauri-e2e");
});
