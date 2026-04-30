// Tiny Supabase admin shim for the Tauri suite. The browser suite has a
// richer helper at apps/desktop/e2e/helpers/db.ts, but it's authored as CJS
// and re-exporting across the ESM/CJS boundary that this folder needs (the
// @srsholmes/tauri-playwright package is ESM-only) breaks Playwright's
// transform pipeline. Keep this shim limited to what specs in this folder
// actually use; if a Tauri spec needs more helpers, copy them here rather
// than reaching across the boundary.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;
function client(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "[e2e-tauri/db] missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env"
    );
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

export async function getUserIdByEmail(email: string): Promise<string | null> {
  const { data } = await client().auth.admin.listUsers({ perPage: 1000 });
  return data?.users.find((u) => u.email === email)?.id ?? null;
}

export async function deleteUser(userId: string): Promise<void> {
  const { error } = await client().auth.admin.deleteUser(userId);
  if (error) throw new Error(`deleteUser: ${error.message}`);
}

export async function cleanupProjectsForUser(userId: string): Promise<void> {
  const { error } = await client()
    .from("projects")
    .delete()
    .eq("user_id", userId);
  if (error) throw new Error(`cleanupProjectsForUser: ${error.message}`);
}

export async function upsertSubscription(opts: {
  userId: string;
  plan?: "free" | "pro" | "max";
  status?: string;
}): Promise<void> {
  const { error } = await client()
    .from("subscriptions")
    .upsert(
      {
        user_id: opts.userId,
        plan: opts.plan ?? "free",
        status: opts.status ?? "active",
      },
      { onConflict: "user_id" }
    );
  if (error) throw new Error(`upsertSubscription: ${error.message}`);
}

export async function seedProject(opts: {
  userId: string;
  name?: string;
  ideaDescription?: string;
  targetProfile?: string;
}): Promise<string> {
  const { data, error } = await client()
    .from("projects")
    .insert({
      user_id: opts.userId,
      name: opts.name ?? "Tauri E2E Project",
      idea_description: opts.ideaDescription ?? "Tauri E2E test project.",
      target_profile: opts.targetProfile ?? "QA engineers",
    })
    .select("id")
    .single();
  if (error) throw new Error(`seedProject: ${error.message}`);
  return (data as { id: string }).id;
}

export interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  idea_description: string | null;
  target_profile: string | null;
  created_at: string;
}

export async function getProjectsForUser(userId: string): Promise<ProjectRow[]> {
  const { data, error } = await client()
    .from("projects")
    .select("id, user_id, name, idea_description, target_profile, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getProjectsForUser: ${error.message}`);
  return (data ?? []) as ProjectRow[];
}

export async function seedInterview(opts: {
  projectId: string;
  attendeeName?: string | null;
  source?: "desktop" | "cal" | "inperson" | "uploaded" | "meet-link";
  status?: "scheduled" | "live" | "completed";
}): Promise<string> {
  const { data, error } = await client()
    .from("interviews")
    .insert({
      project_id: opts.projectId,
      attendee_name: opts.attendeeName ?? null,
      attendee_company: null,
      source: opts.source ?? "inperson",
      scheduled_at: new Date().toISOString(),
      status: opts.status ?? "scheduled",
      transcript: [],
      suggested_questions: [],
    })
    .select("id")
    .single();
  if (error) throw new Error(`seedInterview: ${error.message}`);
  return (data as { id: string }).id;
}

export interface InterviewRow {
  id: string;
  project_id: string;
  created_at: string;
  attendee_name: string | null;
  source: string | null;
  status: string | null;
  meeting_link: string | null;
  recording_path: string | null;
  duration_seconds: number | null;
  upload_status: string | null;
  transcript: unknown[] | null;
}

export async function getInterviewsForProject(
  projectId: string
): Promise<InterviewRow[]> {
  const { data, error } = await client()
    .from("interviews")
    .select("id, project_id, created_at, attendee_name, source, status, meeting_link, recording_path, duration_seconds, upload_status, transcript")
    .eq("project_id", projectId);
  if (error) throw new Error(`getInterviewsForProject: ${error.message}`);
  return (data ?? []) as InterviewRow[];
}
