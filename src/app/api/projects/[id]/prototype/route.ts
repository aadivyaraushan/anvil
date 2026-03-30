import { after } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildPrototypeGraph } from "@/lib/agents/prototype/graph";

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

  // Fetch the project
  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  // Prevent double-triggering if already running
  if (project.prototype_status === "generating") {
    return Response.json({ status: "already_running" }, { status: 409 });
  }

  // Mark as generating immediately
  await supabase
    .from("projects")
    .update({ prototype_status: "generating", prototype_phase: "starting" })
    .eq("id", id);

  // Run the prototype graph in the background after response
  after(async () => {
    try {
      const graph = buildPrototypeGraph();
      await graph.invoke({
        projectId: id,
        ideaDescription: project.idea_description,
        targetProfile: project.target_profile,
        projectName: project.name,
        architectSpec: null,
        designBrief: null,
        codeFiles: null,
        buildErrors: null,
        reviewFeedback: null,
        reviewRounds: 0,
        githubRepoUrl: null,
        prototypeUrl: null,
      });
    } catch (err) {
      // Mark as failed on unrecoverable error
      const supabaseInner = await createServerSupabaseClient();
      await supabaseInner
        .from("projects")
        .update({
          prototype_status: "failed",
          prototype_phase: `Error: ${String(err).slice(0, 200)}`,
        })
        .eq("id", id);
    }
  });

  return Response.json({ status: "started" });
}
