/**
 * Helpers for managing additional E2E users (beyond the primary one
 * created by globalSetup). Used by multi-user / RLS specs that need to
 * verify cross-user isolation.
 *
 * Cleanup is the caller's responsibility — call deleteAuxUser() in
 * afterAll. globalTeardown only knows about the primary E2E_TEST_EMAIL.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _admin: SupabaseClient | null = null;

function admin(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env for admin client");
  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}

export type AuxUser = {
  id: string;
  email: string;
  password: string;
};

/**
 * Idempotently provision an auxiliary E2E user. Email is namespaced with
 * the suite name so concurrent specs don't collide.
 */
export async function ensureAuxUser(label: string): Promise<AuxUser> {
  const sb = admin();
  const email = `e2e-aux-${label}-${process.env.E2E_TEST_EMAIL!.replace("@", "+at+")}@e2e.invalid`.toLowerCase();
  const password = `aux-pw-${label}-${Math.random().toString(36).slice(2, 10)}`;

  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find((u) => u.email === email);
  if (existing) {
    // Reset to a known password so the spec can sign in deterministically.
    const { error } = await sb.auth.admin.updateUserById(existing.id, { password });
    if (error) throw new Error(`ensureAuxUser(update password): ${error.message}`);
    return { id: existing.id, email, password };
  }

  const { data, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`ensureAuxUser(create): ${error.message}`);

  // Give the user a default subscription row so billing-aware UI doesn't
  // 500 on missing row (the trigger only fires for new auth.users that
  // were created through normal sign-up; admin createUser bypasses it).
  await sb
    .from("subscriptions")
    .upsert(
      { user_id: data.user.id, plan: "free", status: "active" },
      { onConflict: "user_id" },
    );

  return { id: data.user.id, email, password };
}

export async function deleteAuxUser(user: AuxUser): Promise<void> {
  const sb = admin();
  // Cleanup any projects this user owns first (cascade deletes).
  await sb.from("projects").delete().eq("user_id", user.id);
  await sb.auth.admin.deleteUser(user.id).catch(() => {
    // Best-effort — don't fail teardown if user is already gone
  });
}

/**
 * Returns a Supabase client authenticated *as* the given user (using
 * their access token). Used by RLS specs to make user-scoped queries
 * server-side without driving the UI.
 */
export async function clientAs(user: AuxUser): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase env");
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error || !data.session) {
    throw new Error(`clientAs(signIn): ${error?.message ?? "no session"}`);
  }
  return sb;
}
