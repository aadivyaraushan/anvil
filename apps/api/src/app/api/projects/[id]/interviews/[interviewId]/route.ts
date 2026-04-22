import { createUserSupabaseClient, extractBearerToken } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; interviewId: string }> }
) {
  const { interviewId } = await ctx.params;
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createUserSupabaseClient(token);
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
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createUserSupabaseClient(token);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;

  // Only allow updating permitted fields
  const allowed: Record<string, unknown> = {};
  if ("status" in body) allowed.status = body.status;
  if ("transcript" in body) allowed.transcript = body.transcript;
  if ("suggested_questions" in body) allowed.suggested_questions = body.suggested_questions;
  if ("attendee_name" in body) allowed.attendee_name = body.attendee_name;
  if ("attendee_company" in body) allowed.attendee_company = body.attendee_company;
  if ("upload_status" in body) allowed.upload_status = body.upload_status;
  if ("recording_path" in body) allowed.recording_path = body.recording_path;
  if ("duration_seconds" in body) allowed.duration_seconds = body.duration_seconds;

  const { data, error } = await supabase
    .from("interviews")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(allowed as any)
    .eq("id", interviewId)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
