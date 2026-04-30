import { getUserIdByEmail, cleanupProjectsForUser } from "./helpers/db";

export default async function globalTeardown() {
  const email = process.env.E2E_TEST_EMAIL;
  if (!email) {
    console.warn("[global-teardown] E2E_TEST_EMAIL not set, skipping");
    return;
  }

  const userId = await getUserIdByEmail(email);
  if (!userId) {
    console.log(`[global-teardown] No user for ${email}, nothing to clean up`);
    return;
  }

  await cleanupProjectsForUser(userId);
  // Keep the user alive. The browser E2E (ci.yml) and Tauri E2E
  // (tauri-build.yml) workflows run in parallel on the same push and
  // share the same Supabase test user. Deleting the user here revokes
  // all refresh tokens, causing "refresh token revoked" errors in
  // whichever job is still running. The global-setup is idempotent —
  // it reuses the existing user on the next CI run.
  console.log(`[global-teardown] Cleaned projects for: ${userId} (${email})`);
}
