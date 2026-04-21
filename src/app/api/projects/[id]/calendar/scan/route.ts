import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const INTERVIEW_KEYWORDS =
  /interview|chat|intro|discovery|call|research|feedback|meet|sync|conversation|user|study/i;

type CalendarAttendee = {
  email: string;
  displayName?: string;
  self?: boolean;
};

type CalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: CalendarAttendee[];
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: Array<{ entryPointType: string; uri: string }>;
  };
  htmlLink?: string;
};

type DetectedInterviewee = {
  name: string;
  email: string;
  confidence: "high" | "low" | "unknown";
};

function extractMeetingLink(event: CalendarEvent): string {
  if (event.hangoutLink) return event.hangoutLink;

  const video = event.conferenceData?.entryPoints?.find(
    (ep) => ep.entryPointType === "video"
  );
  if (video) return video.uri;

  const zoomMatch = (event.description ?? "").match(
    /https?:\/\/[\w.-]*zoom\.us\/[^\s<"]+/i
  );
  if (zoomMatch) return zoomMatch[0];

  return "";
}

function extractInterviewee(
  event: CalendarEvent,
  selfEmail: string
): DetectedInterviewee {
  const externalAttendees = (event.attendees ?? []).filter(
    (a) => !a.self && a.email !== selfEmail
  );

  if (externalAttendees.length === 1) {
    const a = externalAttendees[0];
    return {
      name: a.displayName ?? "",
      email: a.email,
      confidence: "high",
    };
  }

  if (externalAttendees.length > 1) {
    const first = externalAttendees[0];
    return {
      name: first.displayName ?? "",
      email: first.email,
      confidence: "low",
    };
  }

  // Fall back to title parsing
  const title = event.summary ?? "";
  const withMatch = title.match(/(?:with|w\/)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (withMatch) {
    return { name: withMatch[1], email: "", confidence: "low" };
  }

  return { name: "", email: "", confidence: "unknown" };
}

function isInterviewLike(event: CalendarEvent): boolean {
  const title = event.summary ?? "";
  const hasKeyword = INTERVIEW_KEYWORDS.test(title);
  const hasMeetingLink = !!extractMeetingLink(event);
  const hasExternalAttendee = (event.attendees ?? []).some((a) => !a.self);

  // All-day events are not interviews (no dateTime means all-day)
  if (!event.start?.dateTime) return false;

  // Duration check: 10–90 minutes
  if (event.start.dateTime && event.end?.dateTime) {
    const duration =
      (new Date(event.end.dateTime).getTime() -
        new Date(event.start.dateTime).getTime()) /
      60000;
    if (duration < 10 || duration > 90) return false;
  }

  return (hasKeyword && hasMeetingLink) || (hasExternalAttendee && hasMeetingLink);
}

async function refreshAccessToken(
  refreshToken: string,
  userId: string
): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  const supabase = await createServerSupabaseClient();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  await supabase
    .from("user_google_tokens")
    .update({ access_token: data.access_token, expires_at: expiresAt })
    .eq("user_id", userId);

  return data.access_token;
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .single();
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  const { data: tokenRow } = await supabase
    .from("user_google_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", user.id)
    .single();

  if (!tokenRow) {
    return Response.json({ error: "calendar_not_connected" }, { status: 403 });
  }

  let accessToken = tokenRow.access_token;

  // Refresh if expired or expiring within 60 seconds
  if (new Date(tokenRow.expires_at).getTime() - Date.now() < 60_000) {
    if (tokenRow.refresh_token) {
      const refreshed = await refreshAccessToken(tokenRow.refresh_token, user.id);
      if (refreshed) accessToken = refreshed;
    }
  }

  const now = new Date();
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const calParams = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: thirtyDaysOut.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });

  const calRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${calParams}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!calRes.ok) {
    console.error("[calendar/scan] Google API error:", calRes.status);
    return Response.json({ error: "Failed to fetch calendar events" }, { status: 502 });
  }

  const calData = (await calRes.json()) as { items: CalendarEvent[] };

  const selfEmail = user.email ?? "";

  const detected = (calData.items ?? [])
    .filter(isInterviewLike)
    .map((event) => {
      const interviewee = extractInterviewee(event, selfEmail);
      return {
        calendar_event_id: event.id,
        title: event.summary ?? "",
        scheduled_at: event.start?.dateTime ?? "",
        meeting_link: extractMeetingLink(event),
        meeting_platform: extractMeetingLink(event).includes("zoom")
          ? "zoom"
          : "google_meet",
        interviewee_name: interviewee.name,
        interviewee_email: interviewee.email,
        confidence: interviewee.confidence,
      };
    });

  // Filter out events already imported
  const existingEventIds = new Set<string>();
  if (detected.length > 0) {
    const { data: existing } = await supabase
      .from("interviews")
      .select("calendar_event_id")
      .eq("project_id", id)
      .not("calendar_event_id", "is", null);

    for (const row of existing ?? []) {
      if (row.calendar_event_id) existingEventIds.add(row.calendar_event_id);
    }
  }

  const newEvents = detected.filter(
    (e) => !existingEventIds.has(e.calendar_event_id)
  );

  return Response.json({ events: newEvents });
}
