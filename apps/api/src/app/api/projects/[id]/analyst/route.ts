import { after } from "next/server";
import type { NextRequest } from "next/server";
import {
  createUserSupabaseClient,
  createServiceSupabaseClient,
  extractBearerToken,
} from "@/lib/supabase/server";
import { buildAnalystGraph } from "@/lib/agents/analyst/graph";
import { assertWithinLimit } from "@/lib/billing/enforce";

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

  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  if (project.analyst_status === "generating") {
    return Response.json({ status: "already_running" }, { status: 409 });
  }

  const limit = await assertWithinLimit(supabase, "analyst_run", { projectId: id });
  if (!limit.ok) return limit.response;

  const serviceSupabase = createServiceSupabaseClient();
  await serviceSupabase
    .from("projects")
    .update({ analyst_status: "generating" })
    .eq("id", id);

  after(async () => {
    try {
      const graph = buildAnalystGraph();
      await graph.invoke({
        projectId: id,
        projectName: project.name,
        ideaDescription: project.idea_description,
        targetProfile: project.target_profile,
        interviews: [],
        contacts: {},
        extractedData: [],
        analystResult: null,
      });
    } catch (err) {
      const supabaseInner = createServiceSupabaseClient();
      await supabaseInner
        .from("projects")
        .update({ analyst_status: "failed" })
        .eq("id", id);
      console.error("[analyst] graph failed:", String(err));
    }
  });

  return Response.json({ status: "started" });
}
