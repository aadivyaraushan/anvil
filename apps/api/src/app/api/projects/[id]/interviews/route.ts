import { createUserSupabaseClient, extractBearerToken } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";
import type { MeetingPlatform } from "@/lib/supabase/types";

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

  const body = await req.json() as {
    persona_id?: string | null;
    meeting_platform: MeetingPlatform;
    meeting_link: string;
    scheduled_at: string;
    attendee_name?: string | null;
    attendee_company?: string | null;
  };

  const { data, error } = await supabase
    .from("interviews")
    .insert({
      project_id: id,
      persona_id: body.persona_id ?? null,
      meeting_platform: body.meeting_platform,
      meeting_link: body.meeting_link,
      scheduled_at: body.scheduled_at,
      attendee_name: body.attendee_name ?? null,
      attendee_company: body.attendee_company ?? null,
      source: "desktop" as const,
      status: "scheduled" as const,
      transcript: [],
      suggested_questions: [],
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
