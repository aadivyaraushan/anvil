import {
  cleanupProjectsForUser,
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
  // Keep the user alive — the built-app smoke suite (test:e2e:tauri:built)
  // runs after this suite and reuses the auth snapshot saved during
  // tauri-auth.setup.ts. Deleting the user here invalidates the JWT tokens
  // in that snapshot, causing every @built test to fail with stale auth.
  console.log(`[tauri-global-teardown] Cleaned projects for: ${userId} (${email})`);
}
