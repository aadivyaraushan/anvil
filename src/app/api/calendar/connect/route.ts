import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const SCOPES = "https://www.googleapis.com/auth/calendar.events.readonly";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.redirect(new URL("/login", req.url));

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!clientId || !appUrl) {
    return Response.json(
      { error: "Google Calendar integration not configured" },
      { status: 503 }
    );
  }

  const projectId = req.nextUrl.searchParams.get("project_id") ?? "";
  const redirectUri = `${appUrl}/api/calendar/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state: projectId,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return Response.redirect(authUrl);
}
