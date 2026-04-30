import { createClient } from "@supabase/supabase-js";
import { launchTauri, type LaunchedTauri } from "./helpers/launcher.js";

// Stash the running Tauri instance on globalThis so global-teardown can SIGTERM
// it. Playwright spawns global-setup and global-teardown in the same process,
// so a module-level let would also work — globalThis is just defensive.
declare global {
  var __ANVIL_TAURI_INSTANCE__: LaunchedTauri | undefined;
}

// Inlined from `apps/desktop/e2e/global-setup.ts` to keep this folder fully
// ESM. The browser suite is CJS and Node's strict ESM loader can't transpile
// across the boundary inside Playwright's transform pipeline. Keep the two
// in sync if the test user / subscription provisioning changes.
async function ensureTestUserAndSubscription(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!url || !serviceKey || !email || !password) {
    throw new Error(
      "globalSetup: missing env. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, E2E_TEST_EMAIL, E2E_TEST_PASSWORD."
    );
  }
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find((u) => u.email === email);
  let userId: string;
  if (existing) {
    userId = existing.id;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`globalSetup createUser: ${error.message}`);
    userId = data.user.id;
  }
  const { error: subErr } = await supabase
    .from("subscriptions")
    .upsert(
      { user_id: userId, plan: "free", status: "active" },
      { onConflict: "user_id" }
    );
  if (subErr) {
    // Non-fatal — table may not exist in all environments.
    console.warn(`[tauri-global-setup] subscription upsert: ${subErr.message}`);
  }
}

export default async function tauriGlobalSetup() {
  await ensureTestUserAndSubscription();
  if (!globalThis.__ANVIL_TAURI_INSTANCE__) {
    globalThis.__ANVIL_TAURI_INSTANCE__ = await launchTauri();
  }
}
