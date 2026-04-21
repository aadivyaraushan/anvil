import { after } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildBriefGraph } from "@/lib/agents/brief/graph";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; interviewId: string }> }
) {
  const { id, interviewId } = await ctx.params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: interview, error: iErr } = await supabase
    .from("interviews")
    .select("id, project_id, interviewee_name, interviewee_email, brief_status")
    .eq("id", interviewId)
    .eq("project_id", id)
    .single();

  if (iErr || !interview) {
    return Response.json({ error: "Interview not found" }, { status: 404 });
  }

  if (interview.brief_status === "generating") {
    return Response.json({ status: "already_running" }, { status: 409 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("idea_description, target_profile")
    .eq("id", id)
    .single();

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

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
        intervieweeName: interview.interviewee_name ?? "",
        intervieweeEmail: interview.interviewee_email ?? "",
        searchResults: [],
        brief: null,
      });
    } catch (err) {
      const supabaseInner = await createServerSupabaseClient();
      await supabaseInner
        .from("interviews")
        .update({ brief_status: "failed" })
        .eq("id", interviewId);
      console.error("[brief] graph failed:", String(err));
    }
  });

  return Response.json({ status: "started" });
}
