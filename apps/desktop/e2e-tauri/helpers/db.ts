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
  analystStatus?: "idle" | "generating" | "complete" | "failed";
  analystRunCount?: number;
}): Promise<string> {
  const { data, error } = await client()
    .from("projects")
    .insert({
      user_id: opts.userId,
      name: opts.name ?? "Tauri E2E Project",
      idea_description: opts.ideaDescription ?? "Tauri E2E test project.",
      target_profile: opts.targetProfile ?? "QA engineers",
      ...(opts.analystStatus ? { analyst_status: opts.analystStatus } : {}),
      ...(typeof opts.analystRunCount === "number"
        ? { analyst_run_count: opts.analystRunCount }
        : {}),
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
  uploadStatus?: "none" | "queued" | "uploading" | "done" | "failed" | null;
  transcript?: Array<{ speaker: string; text: string; timestamp: number }>;
  suggestedQuestions?: string[];
  recordingPath?: string | null;
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
      upload_status: opts.uploadStatus ?? "none",
      transcript: opts.transcript ?? [],
      suggested_questions: opts.suggestedQuestions ?? [],
      recording_path: opts.recordingPath ?? null,
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

export async function updateInterviewTranscript(opts: {
  interviewId: string;
  status?: "scheduled" | "live" | "completed";
  uploadStatus?: "none" | "queued" | "uploading" | "done" | "failed";
  transcript: Array<{ speaker: string; text: string; timestamp: number }>;
}): Promise<void> {
  const { error } = await client()
    .from("interviews")
    .update({
      transcript: opts.transcript,
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.uploadStatus ? { upload_status: opts.uploadStatus } : {}),
    })
    .eq("id", opts.interviewId);
  if (error) throw new Error(`updateInterviewTranscript: ${error.message}`);
}

export interface PersonaRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  job_titles: string[] | null;
  pain_points: string[] | null;
  status: string | null;
}

export async function seedPersona(opts: {
  projectId: string;
  name?: string;
  description?: string;
  jobTitles?: string[];
  painPoints?: string[];
  status?: "suggested" | "confirmed";
}): Promise<string> {
  const { data, error } = await client()
    .from("personas")
    .insert({
      project_id: opts.projectId,
      name: opts.name ?? "Built Finance Lead",
      description: opts.description ?? "Owns monthly reporting and finance workflows.",
      job_titles: opts.jobTitles ?? ["Head of Finance"],
      pain_points: opts.painPoints ?? ["Manual reporting"],
      status: opts.status ?? "suggested",
    })
    .select("id")
    .single();
  if (error) throw new Error(`seedPersona: ${error.message}`);
  return (data as { id: string }).id;
}

export async function getPersonasForProject(projectId: string): Promise<PersonaRow[]> {
  const { data, error } = await client()
    .from("personas")
    .select("id, project_id, name, description, job_titles, pain_points, status")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getPersonasForProject: ${error.message}`);
  return (data ?? []) as PersonaRow[];
}

export interface AnalystDocumentRow {
  project_id: string;
  content: Record<string, unknown> | null;
  pain_points: unknown[] | null;
  patterns: unknown[] | null;
  key_quotes: unknown[] | null;
  customer_language: string[] | null;
  saturation_score: number | null;
  interview_count: number | null;
  unique_pattern_count: number | null;
}

export async function seedAnalystDocument(opts: {
  projectId: string;
  content?: Record<string, unknown>;
  painPoints?: Array<Record<string, unknown>>;
  patterns?: Array<Record<string, unknown>>;
  keyQuotes?: Array<Record<string, unknown>>;
  customerLanguage?: string[];
  saturationScore?: number;
  interviewCount?: number;
  uniquePatternCount?: number;
}): Promise<void> {
  const { error } = await client()
    .from("analyst_documents")
    .upsert(
      {
        project_id: opts.projectId,
        content: opts.content ?? {},
        pain_points: opts.painPoints ?? [],
        patterns: opts.patterns ?? [],
        key_quotes: opts.keyQuotes ?? [],
        customer_language: opts.customerLanguage ?? [],
        saturation_score: opts.saturationScore ?? 0,
        interview_count: opts.interviewCount ?? 0,
        unique_pattern_count: opts.uniquePatternCount ?? 0,
      },
      { onConflict: "project_id" }
    );
  if (error) throw new Error(`seedAnalystDocument: ${error.message}`);
}

export async function getAnalystDocument(
  projectId: string
): Promise<AnalystDocumentRow | null> {
  const { data, error } = await client()
    .from("analyst_documents")
    .select("project_id, content, pain_points, patterns, key_quotes, customer_language, saturation_score, interview_count, unique_pattern_count")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(`getAnalystDocument: ${error.message}`);
  return (data as AnalystDocumentRow | null) ?? null;
}

export async function getProjectAnalysisState(projectId: string): Promise<{
  analyst_status: string | null;
  analyst_run_count: number | null;
} | null> {
  const { data, error } = await client()
    .from("projects")
    .select("analyst_status, analyst_run_count")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(`getProjectAnalysisState: ${error.message}`);
  return data as { analyst_status: string | null; analyst_run_count: number | null } | null;
}
