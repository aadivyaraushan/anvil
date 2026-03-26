"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { UserSettings } from "@/lib/supabase/types";

export async function getUserSettings(): Promise<UserSettings | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error) return null;
  return data;
}

export async function updateUserSettings(formData: FormData) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const updates: Record<string, unknown> = {};

  const senderEmail = formData.get("sender_email");
  const senderName = formData.get("sender_name");
  const autoSend = formData.get("auto_send_enabled");
  const reviewBeforeSend = formData.get("review_before_send");

  if (senderEmail !== null) updates.sender_email = senderEmail;
  if (senderName !== null) updates.sender_name = senderName;
  updates.auto_send_enabled = autoSend === "on";
  updates.review_before_send = reviewBeforeSend === "on";

  const { error } = await supabase
    .from("user_settings")
    .update(updates)
    .eq("user_id", user.id);

  if (error) throw error;

  revalidatePath("/settings");
}
