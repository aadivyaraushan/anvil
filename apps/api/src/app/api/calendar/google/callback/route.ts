import type { NextRequest } from "next/server";
import { google } from "googleapis";

import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { consumeOAuthState } from "@/lib/oauth-state";

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!,
  );
}

function redirectToSettings(error: string): Response {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return Response.redirect(
    `${appUrl}/settings?calendar_error=${encodeURIComponent(error)}`,
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) return redirectToSettings(error);

  if (!code || !state) {
    return Response.json({ error: "Missing code or state" }, { status: 400 });
  }

  // Validate the state nonce against oauth_states. Single-use; the
  // helper deletes the row regardless of validity, so a forged or
  // replayed callback can't piggy-back on a previous successful flow.
  const serviceSupabase = createServiceSupabaseClient();
  const consumed = await consumeOAuthState(serviceSupabase, state, "google");

  if (!consumed.ok) {
    return Response.json(
      { error: `Invalid state: ${consumed.reason}` },
      { status: 400 },
    );
  }

  const userId = consumed.userId;

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
    return Response.json(
      { error: "Failed to exchange authorization code" },
      { status: 500 },
    );
  }

  if (!tokens.access_token || !tokens.refresh_token) {
    return Response.json(
      { error: "Incomplete token response from Google" },
      { status: 500 },
    );
  }

  oauth2Client.setCredentials(tokens);
  let calendarEmail: string | null = null;
  try {
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const { data } = await calendar.calendarList.get({ calendarId: "primary" });
    calendarEmail = data.id ?? null;
  } catch {
    // Non-fatal — store without calendar email
  }

  const expiresAt = tokens.expiry_date
    ? new Date(tokens.expiry_date).toISOString()
    : new Date(Date.now() + 3600 * 1000).toISOString();

  await serviceSupabase.from("calendar_connections").upsert(
    {
      user_id: userId,
      provider: "google" as const,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      calendar_email: calendarEmail,
    },
    { onConflict: "user_id" },
  );

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return Response.redirect(`${appUrl}/settings?calendar_connected=true`);
}
