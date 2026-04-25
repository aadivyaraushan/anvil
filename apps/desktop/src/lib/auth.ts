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
// One-time hydration: prime the in-memory Supabase client from the Tauri store.
// Without this, supabase.from(...) calls go out without an Authorization
// header on a fresh app launch — RLS denies them with 401, which the app
// surfaces as "Session expired. Sign in again."
// ---------------------------------------------------------------------------

let hydratePromise: Promise<void> | null = null;

async function ensureHydrated(): Promise<void> {
  if (!isTauri()) return;
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    const supabase = getSupabase();

    // Mirror future Supabase auth changes (silent token refresh, sign-in,
    // sign-out) back to the Tauri store so the persisted session stays
    // current across app restarts. INITIAL_SESSION fires synchronously
    // during registration and we don't want it clobbering the store.
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "INITIAL_SESSION") return;
      try {
        const store = await getTauriStore();
        if (session) {
          await store.set(STORE_KEY, session);
        } else {
          await store.delete(STORE_KEY);
        }
        await store.save();
      } catch {
        // best-effort persistence
      }
    });

    try {
      const store = await getTauriStore();
      const stored = await store.get<Session>(STORE_KEY);
      if (!stored) return;

      const { data, error } = await supabase.auth.setSession({
        access_token: stored.access_token,
        refresh_token: stored.refresh_token,
      });

      if (error || !data.session) {
        await store.delete(STORE_KEY);
        await store.save();
      }
    } catch {
      // ignore — fall through to unauthenticated state
    }
  })();

  return hydratePromise;
}

/**
 * Returns the current session.
 * In Tauri: hydrates the Supabase client from the plugin store on first
 * call, then returns Supabase's in-memory session (which auto-refreshes).
 * In browser/dev: delegates to supabase.auth.getSession().
 */
export async function getSession(): Promise<Session | null> {
  await ensureHydrated();
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
  // Local-scope sign-out: only revoke this device's session. The default
  // "global" scope kills every refresh token the user has, including
  // sessions on other devices/browsers — almost never the intent of a
  // user-triggered sign-out.
  await supabase.auth.signOut({ scope: "local" });
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
