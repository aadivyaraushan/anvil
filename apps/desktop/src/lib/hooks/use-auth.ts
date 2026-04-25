import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { getSession, clearSession } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// useSession
// ---------------------------------------------------------------------------

export function useSession() {
  const queryClient = useQueryClient();

  // Mirror Supabase auth state changes into React Query: when Supabase
  // signs out, refreshes a token, or emits a USER_UPDATED event, invalidate
  // our cached session so consumers re-evaluate. Without this, AuthGuard
  // can stay stuck on a stale "logged in" view long after Supabase has
  // rotated or revoked the underlying tokens.
  useEffect(() => {
    const supabase = getSupabase();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      queryClient.invalidateQueries({ queryKey: ["auth", "session"] });
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);

  return useQuery<Session | null>({
    queryKey: ["auth", "session"],
    queryFn: getSession,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// ---------------------------------------------------------------------------
// useUser
// ---------------------------------------------------------------------------

export function useUser(): User | null {
  const { data: session } = useSession();
  return session?.user ?? null;
}

// ---------------------------------------------------------------------------
// useSignOut
// ---------------------------------------------------------------------------

export function useSignOut() {
  const router = useRouter();

  return useMutation({
    mutationFn: clearSession,
    onSuccess: () => {
      router.push("/login");
    },
  });
}
