import { getUserIdByEmail, cleanupProjectsForUser, deleteUser } from "./helpers/db";

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
  await deleteUser(userId);
  console.log(`[global-teardown] Deleted test user: ${userId} (${email})`);
}
