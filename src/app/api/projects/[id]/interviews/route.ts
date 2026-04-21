import { after } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";
import type { MeetingPlatform } from "@/lib/supabase/types";
import { buildBriefGraph } from "@/lib/agents/brief/graph";

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
    persona_id: string | null;
    meeting_platform: MeetingPlatform;
    meeting_link: string;
    scheduled_at: string;
    calendar_event_id?: string | null;
    interviewee_name?: string | null;
    interviewee_email?: string | null;
  };

  const { data: project } = await supabase
    .from("projects")
    .select("idea_description, target_profile")
    .eq("id", id)
    .single();

  const { data, error } = await supabase
    .from("interviews")
    .insert({
      project_id: id,
      contact_id: body.contact_id,
      persona_id: body.persona_id,
      meeting_platform: body.meeting_platform,
      meeting_link: body.meeting_link,
      scheduled_at: body.scheduled_at,
      status: "scheduled" as const,
      transcript: [],
      suggested_questions: [],
      calendar_event_id: body.calendar_event_id ?? null,
      interviewee_name: body.interviewee_name ?? null,
      interviewee_email: body.interviewee_email ?? null,
      brief_status: "idle",
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Auto-trigger brief generation when we have interviewee info from calendar
  const hasIntervieweeInfo = body.interviewee_name || body.interviewee_email;
  if (data && hasIntervieweeInfo && project) {
    const interviewId = data.id;
    await supabase
      .from("interviews")
      .update({ brief_status: "generating" })
      .eq("id", interviewId);

    after(async () => {
      try {
        const graph = buildBriefGraph();
        await graph.invoke({
          interviewId,
          projectId: id,
          ideaDescription: project.idea_description,
          targetProfile: project.target_profile,
          intervieweeName: body.interviewee_name ?? "",
          intervieweeEmail: body.interviewee_email ?? "",
          searchResults: [],
          brief: null,
        });
      } catch (err) {
        const supabaseInner = await createServerSupabaseClient();
        await supabaseInner
          .from("interviews")
          .update({ brief_status: "failed" })
          .eq("id", interviewId);
        console.error("[brief] auto-generate failed:", String(err));
      }
    });
  }

  return Response.json(data, { status: 201 });
}
