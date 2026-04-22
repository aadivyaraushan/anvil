"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { setSession } from "@/lib/auth";
import { mapError } from "@/lib/errors";
import { ErrorCard } from "@/components/error-card";
import { Card, CardContent } from "@/components/ui/card";

function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function exchange() {
      const code = searchParams.get("code");
      const returnedState = searchParams.get("state");

      if (!code) {
        setError(mapError(new Error("Missing authorization code")));
        return;
      }

      const storedState = sessionStorage.getItem("anvil_pkce_state");
      if (storedState && returnedState && storedState !== returnedState) {
        setError(mapError(new Error("State mismatch — possible CSRF attempt")));
        return;
      }

      sessionStorage.removeItem("anvil_pkce_state");
      sessionStorage.removeItem("anvil_pkce_verifier");

      try {
        const supabase = createClient();
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) throw exchangeError;
        if (!data.session) throw new Error("No session returned from code exchange");

        await setSession(data.session);
        router.replace("/dashboard");
      } catch (err) {
        setError(mapError(err));
      }
    }

    exchange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-sm space-y-4">
          <ErrorCard error={error} />
          <p className="text-center text-sm text-muted-foreground">
            <a href="/login" className="text-accent-foreground underline">
              Back to sign in
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardContent className="flex items-center justify-center gap-3 py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Signing you in&hellip;</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Card className="w-full max-w-sm">
            <CardContent className="flex items-center justify-center gap-3 py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Signing you in&hellip;</p>
            </CardContent>
          </Card>
        </div>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
