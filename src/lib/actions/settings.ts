"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
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
