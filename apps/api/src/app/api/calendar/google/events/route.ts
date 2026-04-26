import type { NextRequest } from "next/server";
import {
  createUserSupabaseClient,
  createServiceSupabaseClient,
  extractBearerToken,
} from "@/lib/supabase/server";
import {
  emailDomain,
  filterOneExternalAttendeeEvents,
  type CalendarEventInput,
} from "@/lib/calendar/filter";
import { google } from "googleapis";

function getOAuth2Client(accessToken: string, refreshToken: string) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!
  );
  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  return client;
}

export async function GET(req: NextRequest) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createUserSupabaseClient(token);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const userDomain = emailDomain(user.email ?? "");

  // Fetch calendar connection — use service client to bypass RLS on this read
  const serviceSupabase = createServiceSupabaseClient();
  const { data: connection } = await serviceSupabase
    .from("calendar_connections")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .single();

  if (!connection) {
    return Response.json({ error: "Google Calendar not connected" }, { status: 404 });
  }

  const auth = getOAuth2Client(connection.access_token, connection.refresh_token);

  // Refresh token if expired
  const expiresAt = new Date(connection.expires_at).getTime();
  if (Date.now() >= expiresAt - 60_000) {
    try {
      const { credentials } = await auth.refreshAccessToken();
      auth.setCredentials(credentials);
      // Persist refreshed tokens
      await serviceSupabase
        .from("calendar_connections")
        .update({
          access_token: credentials.access_token ?? connection.access_token,
          expires_at: credentials.expiry_date
            ? new Date(credentials.expiry_date).toISOString()
            : connection.expires_at,
        })
        .eq("user_id", user.id)
        .eq("provider", "google");
    } catch (err) {
      console.error("[calendar/events] token refresh failed:", String(err));
      return Response.json({ error: "Calendar token expired" }, { status: 401 });
    }
  }

  const calendar = google.calendar({ version: "v3", auth });

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  let rawEvents: CalendarEventInput[] = [];

  try {
    const { data } = await calendar.events.list({
      calendarId: "primary",
      timeMin: thirtyDaysAgo.toISOString(),
      timeMax: thirtyDaysAhead.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 200,
    });
    rawEvents = data.items ?? [];
  } catch (err) {
    console.error("[calendar/events] list failed:", String(err));
    return Response.json({ error: "Failed to fetch calendar events" }, { status: 500 });
  }

  const filtered = filterOneExternalAttendeeEvents(rawEvents, userDomain, now);

  return Response.json({ events: filtered });
}
