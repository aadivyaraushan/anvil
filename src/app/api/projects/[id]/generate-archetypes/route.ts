import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createLlm } from "@/lib/llm";
import { buildArchetypePrompt } from "@/lib/agents/analyst/prompts";

export async function GET(
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
    .select("idea_description, target_profile")
    .eq("id", id)
    .single();

  if (!project) return Response.json({ error: "Not found" }, { status: 404 });

  const llm = createLlm();
  const prompt = buildArchetypePrompt(
    project.idea_description,
    project.target_profile
  );

  let archetypes: unknown[] = [];
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

  return Response.json({ archetypes });
}
