"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Plan } from "./plans";
import type { Subscription } from "@/lib/supabase/types";

/** Returns the authenticated user's active plan. Falls back to "free" if no subscription row exists. */
export async function getUserPlan(): Promise<Plan> {
  const sub = await getUserSubscription();
  if (!sub) return "free";
  // Treat past_due as still active (grace period), canceled/incomplete as free
  if (sub.status === "canceled" || sub.status === "incomplete") return "free";
  return sub.plan as Plan;
}

/** Returns the raw subscription row for the authenticated user, or null if none. */
export async function getUserSubscription(): Promise<Subscription | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .single();

  return data ?? null;
}
