import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { getSession, clearSession } from "@/lib/auth";
import type { Session, User } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// useSession
// ---------------------------------------------------------------------------

export function useSession() {
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
