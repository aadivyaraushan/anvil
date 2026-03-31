import { after } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildSynthesisGraph } from "@/lib/agents/synthesis/graph";

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

  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  if (project.synthesis_status === "generating") {
    return Response.json({ status: "already_running" }, { status: 409 });
  }

  await supabase
    .from("projects")
    .update({ synthesis_status: "generating" })
    .eq("id", id);

  after(async () => {
    try {
      const graph = buildSynthesisGraph();
      await graph.invoke({
        projectId: id,
        projectName: project.name,
        ideaDescription: project.idea_description,
        targetProfile: project.target_profile,
        interviews: [],
        contacts: {},
        extractedData: [],
        synthesisResult: null,
      });
    } catch (err) {
      const supabaseInner = await createServerSupabaseClient();
      await supabaseInner
        .from("projects")
        .update({ synthesis_status: "failed" })
        .eq("id", id);
      console.error("[synthesis] graph failed:", String(err));
    }
  });

  return Response.json({ status: "started" });
}
