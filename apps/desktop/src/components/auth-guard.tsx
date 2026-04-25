"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/hooks/use-auth";

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * Client-side auth guard.
 *
 * Distinguishes "haven't checked yet" (data === undefined) from "checked,
 * no session" (data === null). The `isLoading` flag is unreliable here:
 * on SSR / first hydration, React Query reports isLoading=false because no
 * fetch has actually started (isLoading = isPending && isFetching, and
 * isFetching is false on the server). Reading `session === null` instead
 * avoids the SSR-hydration bounce where AuthGuard would redirect to /login
 * before the queryFn ever ran.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session === null) {
      router.replace("/login");
    }
  }, [session, router]);

  if (!session) return null;

  return <>{children}</>;
}
