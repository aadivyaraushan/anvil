import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";
import type { MeetingPlatform } from "@/lib/supabase/types";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();

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
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    contact_id: string | null;
    meeting_platform: MeetingPlatform;
    meeting_link: string;
    scheduled_at: string;
  };

  const { data, error } = await supabase
    .from("interviews")
    .insert({
      project_id: id,
      contact_id: body.contact_id,
      meeting_platform: body.meeting_platform,
      meeting_link: body.meeting_link,
      scheduled_at: body.scheduled_at,
      status: "scheduled" as const,
      transcript: [],
      suggested_questions: [],
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
