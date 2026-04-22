/**
 * Auth helpers for the Tauri desktop app.
 * - In Tauri context: tokens are persisted to @tauri-apps/plugin-store.
 * - In browser/dev: falls back to the Supabase JS SDK's built-in storage.
 */

import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";

const STORE_KEY = "anvil_session";

// ---------------------------------------------------------------------------
// Environment detection
// ---------------------------------------------------------------------------

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

// ---------------------------------------------------------------------------
// Tauri store helpers (lazy-loaded so the module is safe in browser/SSR)
// ---------------------------------------------------------------------------

async function getTauriStore() {
  const { load } = await import("@tauri-apps/plugin-store");
  return load("session.json", { autoSave: true, defaults: {} });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the current session.
 * In Tauri: reads from the plugin store.
 * In browser/dev: delegates to supabase.auth.getSession().
 */
export async function getSession(): Promise<Session | null> {
  if (isTauri()) {
    try {
      const store = await getTauriStore();
      const raw = await store.get<Session>(STORE_KEY);
      return raw ?? null;
    } catch {
      return null;
    }
  }

  const supabase = getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

/**
 * Persists a session.
 * In Tauri: saves to plugin store AND calls supabase.auth.setSession() so the
 * in-memory client is also updated.
 * In browser/dev: delegates entirely to supabase.auth.setSession().
 */
export async function setSession(session: Session): Promise<void> {
  const supabase = getSupabase();

  if (isTauri()) {
    const store = await getTauriStore();
    await store.set(STORE_KEY, session);
    await store.save();
  }

  await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
}

/**
 * Clears the session.
 * In Tauri: removes from plugin store AND calls supabase.auth.signOut().
 * In browser/dev: calls supabase.auth.signOut() only.
 */
export async function clearSession(): Promise<void> {
  if (isTauri()) {
    try {
      const store = await getTauriStore();
      await store.delete(STORE_KEY);
      await store.save();
    } catch {
      // ignore — sign out regardless
    }
  }

  const supabase = getSupabase();
  await supabase.auth.signOut();
}

/**
 * Refreshes the access token and persists the updated session.
 */
export async function refreshSession(): Promise<Session | null> {
  const supabase = getSupabase();
  const {
    data: { session },
    error,
  } = await supabase.auth.refreshSession();

  if (error || !session) return null;

  await setSession(session);
  return session;
}
