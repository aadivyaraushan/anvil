import type { NextRequest } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { google } from "googleapis";

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return Response.redirect(`${appUrl}/settings?calendar_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return Response.json({ error: "Missing code or state" }, { status: 400 });
  }

  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
      user_id: string;
    };
    userId = decoded.user_id;
  } catch {
    return Response.json({ error: "Invalid state parameter" }, { status: 400 });
  }

  const oauth2Client = getOAuth2Client();
  let tokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
  };

  try {
    const { tokens: t } = await oauth2Client.getToken(code);
    tokens = t;
  } catch {
    return Response.json({ error: "Failed to exchange authorization code" }, { status: 500 });
  }

  if (!tokens.access_token || !tokens.refresh_token) {
    return Response.json({ error: "Incomplete token response from Google" }, { status: 500 });
  }

  // Fetch the calendar email (primary calendar)
  oauth2Client.setCredentials(tokens);
  let calendarEmail: string | null = null;
  try {
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const { data } = await calendar.calendarList.get({ calendarId: "primary" });
    calendarEmail = data.id ?? null;
  } catch {
    // Non-fatal — store without calendar email
  }

  const supabase = createServiceSupabaseClient();
  const expiresAt = tokens.expiry_date
    ? new Date(tokens.expiry_date).toISOString()
    : new Date(Date.now() + 3600 * 1000).toISOString();

  await supabase.from("calendar_connections").upsert(
    {
      user_id: userId,
      provider: "google" as const,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      calendar_email: calendarEmail,
    },
    { onConflict: "user_id" }
  );

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return Response.redirect(`${appUrl}/settings?calendar_connected=true`);
}
