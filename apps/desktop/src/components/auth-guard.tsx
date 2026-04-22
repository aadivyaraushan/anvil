"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/hooks/use-auth";

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * Client-side auth guard.
 * - While the session is loading: renders nothing.
 * - If there is no session: redirects to /login.
 * - If there is a session: renders children.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { data: session, isLoading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/login");
    }
  }, [isLoading, session, router]);

  if (isLoading) return null;
  if (!session) return null;

  return <>{children}</>;
}
