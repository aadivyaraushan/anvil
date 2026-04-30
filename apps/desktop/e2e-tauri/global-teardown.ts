import {
  cleanupProjectsForUser,
  deleteUser,
  getUserIdByEmail,
} from "./helpers/db.js";

export default async function tauriGlobalTeardown() {
  if (globalThis.__ANVIL_TAURI_INSTANCE__) {
    await globalThis.__ANVIL_TAURI_INSTANCE__.kill();
    globalThis.__ANVIL_TAURI_INSTANCE__ = undefined;
  }

  const email = process.env.E2E_TEST_EMAIL;
  if (!email) {
    console.warn("[tauri-global-teardown] E2E_TEST_EMAIL not set, skipping user cleanup");
    return;
  }

  const userId = await getUserIdByEmail(email);
  if (!userId) return;

  await cleanupProjectsForUser(userId);
  await deleteUser(userId);
  console.log(`[tauri-global-teardown] Deleted test user: ${userId} (${email})`);
}
