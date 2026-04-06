"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { buildPrototypeGraph } from "@/lib/agents/prototype/graph";
import { getUserPlan } from "@/lib/billing/subscription";
import { PLANS, withinLimit } from "@/lib/billing/plans";
import { updatePrototypeProject } from "@/lib/prototype-status";

export async function getProjects() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function getProject(id: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

export async function createProject(formData: FormData) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  // Enforce project count limit for current plan
  const plan = await getUserPlan();
  const limits = PLANS[plan];
  const { count } = await supabase
    .from("projects")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (!withinLimit(count ?? 0, limits.projects)) {
    redirect("/billing?limit=projects");
  }

  const name = formData.get("name") as string;
  const ideaDescription = formData.get("idea_description") as string;
  const targetProfile = formData.get("target_profile") as string;

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      name,
      idea_description: ideaDescription,
      target_profile: targetProfile,
      prototype_status: "generating",
    })
    .select()
    .single();

  if (error) throw error;

  const projectId = (data as { id: string }).id;

  after(async () => {
    try {
      const graph = buildPrototypeGraph();
      await graph.invoke({
        projectId,
        ideaDescription,
        targetProfile,
        projectName: name,
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
      await updatePrototypeProject(projectId, {
        prototype_status: "failed",
        prototype_phase: `Error: ${String(err).slice(0, 200)}`,
      });
    }
  });

  revalidatePath("/dashboard");
  redirect(`/project/${projectId}`);
}

export async function updateProject(id: string, formData: FormData) {
  const supabase = await createServerSupabaseClient();

  const updates: Record<string, unknown> = {};
  const name = formData.get("name");
  const ideaDescription = formData.get("idea_description");
  const targetProfile = formData.get("target_profile");

  if (name) updates.name = name;
  if (ideaDescription) updates.idea_description = ideaDescription;
  if (targetProfile) updates.target_profile = targetProfile;

  const { error } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", id);

  if (error) throw error;

  revalidatePath(`/project/${id}`);
  revalidatePath(`/project/${id}/settings`);
}

export async function getSynthesisDocument(projectId: string) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("synthesis_documents")
    .select("*")
    .eq("project_id", projectId)
    .single();
  return data ?? null;
}
