import type { NextRequest } from "next/server";
import {
  createUserSupabaseClient,
  createServiceSupabaseClient,
  extractBearerToken,
} from "@/lib/supabase/server";
import { createLlm } from "@/lib/llm";
import { buildArchetypePrompt } from "@/lib/agents/analyst/prompts";

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

  const { data: project } = await supabase
    .from("projects")
    .select("idea_description, target_profile")
    .eq("id", id)
    .single();

  if (!project) return Response.json({ error: "Not found" }, { status: 404 });

  // Require at least 2 completed interviews before proposing archetypes
  const { count: completedCount } = await supabase
    .from("interviews")
    .select("id", { count: "exact", head: true })
    .eq("project_id", id)
    .eq("status", "completed");

  if ((completedCount ?? 0) < 2) {
    return Response.json(
      { error: "At least 2 completed interviews are required to generate archetypes." },
      { status: 422 }
    );
  }

  const llm = createLlm();
  const prompt = buildArchetypePrompt(
    project.idea_description,
    project.target_profile
  );

  let archetypes: Array<{
    name: string;
    description: string;
    job_titles: string[];
    pain_points: string[];
  }> = [];

  try {
    const result = await llm.invoke(prompt);
    const raw = typeof result.content === "string" ? result.content : "";
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      archetypes = JSON.parse(match[0]);
    }
  } catch {
    // return empty array — client will show error state
  }

  // Insert proposed archetypes with status: 'suggested'
  if (archetypes.length > 0) {
    const serviceSupabase = createServiceSupabaseClient();
    await serviceSupabase.from("personas").insert(
      archetypes.map((a) => ({
        project_id: id,
        name: a.name,
        description: a.description,
        job_titles: a.job_titles ?? [],
        pain_points: a.pain_points ?? [],
        status: "suggested" as const,
      }))
    );
  }

  return Response.json({ archetypes });
}
