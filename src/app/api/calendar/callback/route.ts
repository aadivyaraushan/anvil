import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.redirect(new URL("/login", req.url));

  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const projectId = searchParams.get("state") ?? "";

  if (!code) {
    const dest = projectId
      ? `/project/${projectId}/interviews`
      : "/dashboard";
    return Response.redirect(new URL(dest, req.url));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!clientId || !clientSecret || !appUrl) {
    return Response.json({ error: "Google Calendar not configured" }, { status: 503 });
  }

  const redirectUri = `${appUrl}/api/calendar/callback`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    console.error("[calendar/callback] token exchange failed:", await tokenRes.text());
    const dest = projectId ? `/project/${projectId}/interviews` : "/dashboard";
    return Response.redirect(new URL(dest, req.url));
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await supabase.from("user_google_tokens").upsert(
    {
      user_id: user.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_at: expiresAt,
    },
    { onConflict: "user_id" }
  );

  const dest = projectId ? `/project/${projectId}/interviews` : "/dashboard";
  return Response.redirect(new URL(dest, req.url));
}
