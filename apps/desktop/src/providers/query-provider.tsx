"use client";

import { useEffect } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { getQueryClient } from "@/lib/query-client";
import { persistOptions } from "@/lib/query-persistence";
import { getSupabase } from "@/lib/supabase/client";

/**
 * Always-alive Supabase auth-state mirror. Sits at the QueryProvider
 * level (above every route, including /login and /signup) so that auth
 * events fired by sign-in / sign-out flows are caught even when
 * AuthGuard isn't mounted. Without this, signing in from /login
 * persisted the stale post-sign-out cached `null` for the
 * ['auth', 'session'] query, and AuthGuard on the freshly-mounted
 * /dashboard page would briefly redirect back to /login before the
 * refetch landed.
 */
function AuthStateMirror() {
  useEffect(() => {
    const supabase = getSupabase();
    const queryClient = getQueryClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION fires synchronously on subscribe, often BEFORE
      // Supabase has finished hydrating the session from localStorage.
      // On slower browsers (webkit / firefox) it lands as `null` and
      // wipes the cache that useSession's queryFn would otherwise have
      // populated correctly. Let queryFn own the initial read; only
      // mirror real state-change events (sign-in / sign-out / token
      // refresh / user update).
      if (event === "INITIAL_SESSION") return;
      queryClient.setQueryData(["auth", "session"], session);
    });
    return () => subscription.unsubscribe();
  }, []);
  return null;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
    >
      <AuthStateMirror />
      {children}
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </PersistQueryClientProvider>
  );
}
