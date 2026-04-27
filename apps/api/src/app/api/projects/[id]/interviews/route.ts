import { createUserSupabaseClient, extractBearerToken } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";
import type { InterviewSource, MeetingPlatform } from "@/lib/supabase/types";
import { assertWithinLimit } from "@/lib/billing/enforce";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createUserSupabaseClient(token);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("interviews")
    .select("*")
    .eq("project_id", id)
    .order("scheduled_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createUserSupabaseClient(token);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const limit = await assertWithinLimit(supabase, "interview_create", { projectId: id });
  if (!limit.ok) return limit.response;

  // Conversations can be in-person or online — meeting_platform and
  // meeting_link are both optional. Callers that omit them get a row
  // with no link, which is the correct shape for an in-person
  // conversation. `source` is also optional and defaults to "desktop".
  const body = await req.json() as {
    persona_id?: string | null;
    source?: InterviewSource;
    meeting_platform?: MeetingPlatform | null;
    meeting_link?: string | null;
    scheduled_at?: string | null;
    attendee_name?: string | null;
    attendee_company?: string | null;
  };

  const { data, error } = await supabase
    .from("interviews")
    .insert({
      project_id: id,
      persona_id: body.persona_id ?? null,
      meeting_platform: body.meeting_platform ?? null,
      meeting_link: body.meeting_link ?? null,
      scheduled_at: body.scheduled_at ?? null,
      attendee_name: body.attendee_name ?? null,
      attendee_company: body.attendee_company ?? null,
      source: body.source ?? "desktop",
      status: "scheduled" as const,
      transcript: [],
      suggested_questions: [],
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
