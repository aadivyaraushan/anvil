import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; interviewId: string }> }
) {
  const { interviewId } = await ctx.params;
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("interviews")
    .select("*")
    .eq("id", interviewId)
    .single();

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return Response.json({ error: error.message }, { status });
  }
  return Response.json(data);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; interviewId: string }> }
) {
  const { interviewId } = await ctx.params;
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;

  // Only allow updating permitted fields
  const allowed: Record<string, unknown> = {};
  if ("status" in body) allowed.status = body.status;
  if ("transcript" in body) allowed.transcript = body.transcript;
  if ("suggested_questions" in body) allowed.suggested_questions = body.suggested_questions;

  const { data, error } = await supabase
    .from("interviews")
    .update(allowed)
    .eq("id", interviewId)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
