"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
      prototype_status: "pending" as const,
    })
    .select()
    .single();

  if (error) throw error;

  revalidatePath("/dashboard");
  redirect(`/project/${data.id}`);
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
