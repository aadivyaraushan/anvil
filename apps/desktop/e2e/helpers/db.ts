import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _adminClient: SupabaseClient | null = null;
let _supportsRedesignSchema: boolean | null = null;

function adminClient(): SupabaseClient {
  if (_adminClient) return _adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  _adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  return _adminClient;
}

export async function getUserIdByEmail(email: string): Promise<string | null> {
  const supabase = adminClient();
  const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  return data?.users.find((u) => u.email === email)?.id ?? null;
}

export async function supportsRedesignSchema(): Promise<boolean> {
  if (_supportsRedesignSchema !== null) return _supportsRedesignSchema;

  const supabase = adminClient();
  // Migration 010: interviews.source column must exist
  const interviewProbe = await supabase
    .from("interviews")
    .select("id, source")
    .limit(1);
  // Migration 009: personas.status column must exist
  const personaProbe = await supabase
    .from("personas")
    .select("id, status")
    .limit(1);
  // Migration 009: calendar_connections table must exist
  const calProbe = await supabase
    .from("calendar_connections")
    .select("id")
    .limit(1);

  _supportsRedesignSchema =
    !interviewProbe.error && !personaProbe.error && !calProbe.error;

  return _supportsRedesignSchema;
}

export async function deleteUser(userId: string): Promise<void> {
  const supabase = adminClient();
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw new Error(`deleteUser failed: ${error.message}`);
}

export async function cleanupProjectsForUser(userId: string): Promise<void> {
  const supabase = adminClient();
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("user_id", userId);
  if (error)
    throw new Error(`cleanupProjectsForUser failed: ${error.message}`);
}

export async function seedProject(opts: {
  userId: string;
  name?: string;
  ideaDescription?: string;
  targetProfile?: string;
  analystStatus?: "idle" | "generating" | "complete" | "failed";
  archetypesVerified?: boolean;
}): Promise<string> {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: opts.userId,
      name: opts.name ?? "E2E Test Project",
      idea_description:
        opts.ideaDescription ?? "A test idea for E2E testing.",
      target_profile: opts.targetProfile ?? "QA engineers",
      ...(opts.analystStatus ? { analyst_status: opts.analystStatus } : {}),
      ...(typeof opts.archetypesVerified === "boolean"
        ? { archetypes_verified: opts.archetypesVerified }
        : {}),
    })
    .select("id")
    .single();
  if (error) throw new Error(`seedProject failed: ${error.message}`);
  return (data as { id: string }).id;
}

export async function seedPersona(opts: {
  projectId: string;
  name?: string;
  description?: string;
  jobTitles?: string[];
  painPoints?: string[];
}): Promise<string> {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("personas")
    .insert({
      project_id: opts.projectId,
      name: opts.name ?? "Finance leader",
      description:
        opts.description ?? "Leads customer research and buying decisions.",
      job_titles: opts.jobTitles ?? ["Head of Finance"],
      pain_points: opts.painPoints ?? ["Manual reporting takes too long"],
    })
    .select("id")
    .single();
  if (error) throw new Error(`seedPersona failed: ${error.message}`);

  const { error: projectError } = await supabase
    .from("projects")
    .update({ archetypes_verified: true })
    .eq("id", opts.projectId);
  if (projectError) {
    throw new Error(`seedPersona(project update) failed: ${projectError.message}`);
  }

  return (data as { id: string }).id;
}

export async function seedContact(opts: {
  projectId: string;
  personaId?: string | null;
  source?: "apollo" | "csv" | "json";
  sourcePayload?: Record<string, unknown> | null;
  fitScore?: number | null;
  fitStatus?: "passed" | "skipped" | null;
  outreachStatus?: "pending" | "drafted" | "approved" | "sent" | "replied";
  emailDraft?: string | null;
  researchBrief?: Record<string, unknown> | null;
  firstName?: string;
  lastName?: string;
  email?: string;
  title?: string;
  company?: string;
}): Promise<string> {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("contacts")
    .insert({
      project_id: opts.projectId,
      persona_id: opts.personaId ?? null,
      source: opts.source ?? "csv",
      first_name: opts.firstName ?? "Test",
      last_name: opts.lastName ?? "Contact",
      email: opts.email ?? `contact-${Date.now()}@example.com`,
      title: opts.title ?? "Engineer",
      company: opts.company ?? "Acme Inc",
      linkedin_url: "",
      company_website: "",
      industry: "Software",
      location: "Remote",
      research_brief: opts.researchBrief ?? null,
      fit_score: opts.fitScore ?? null,
      fit_status: opts.fitStatus ?? null,
      outreach_status: opts.outreachStatus ?? "pending",
      email_draft: opts.emailDraft ?? null,
      source_payload: opts.sourcePayload ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`seedContact failed: ${error.message}`);
  return (data as { id: string }).id;
}

export async function seedInterview(opts: {
  projectId: string;
  /** @deprecated — contact_id removed in migration 009 */
  contactId?: string;
  personaId?: string | null;
  source?: "desktop" | "cal" | "inperson" | "uploaded" | "meet-link";
  attendeeName?: string | null;
  attendeeCompany?: string | null;
  status?: "scheduled" | "in-progress" | "completed";
  transcript?: Array<{ speaker: string; text: string; timestamp: number }>;
  suggestedQuestions?: string[];
}): Promise<string> {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("interviews")
    .insert({
      project_id: opts.projectId,
      source: opts.source ?? "desktop",
      attendee_name: opts.attendeeName ?? null,
      attendee_company: opts.attendeeCompany ?? null,
      scheduled_at: new Date().toISOString(),
      status: opts.status ?? "scheduled",
      transcript: opts.transcript ?? [],
      suggested_questions: opts.suggestedQuestions ?? [],
    })
    .select("id")
    .single();
  if (error) throw new Error(`seedInterview failed: ${error.message}`);
  return (data as { id: string }).id;
}

export async function seedAnalystDocument(opts: {
  projectId: string;
  content?: Record<string, unknown>;
  painPoints?: Array<Record<string, unknown>>;
  patterns?: Array<Record<string, unknown>>;
  keyQuotes?: Array<Record<string, unknown>>;
  saturationScore?: number;
  interviewCount?: number;
  uniquePatternCount?: number;
}): Promise<void> {
  const supabase = adminClient();
  const { error } = await supabase
    .from("analyst_documents")
    .update({
      content: opts.content ?? {},
      pain_points: opts.painPoints ?? [],
      patterns: opts.patterns ?? [],
      key_quotes: opts.keyQuotes ?? [],
      saturation_score: opts.saturationScore ?? 0,
      interview_count: opts.interviewCount ?? 0,
      unique_pattern_count: opts.uniquePatternCount ?? 0,
    })
    .eq("project_id", opts.projectId);
  if (error) throw new Error(`seedAnalystDocument failed: ${error.message}`);
}

export async function upsertSubscription(opts: {
  userId: string;
  plan?: "free" | "pro" | "max";
  stripeCustomerId?: string;
}): Promise<void> {
  const supabase = adminClient();
  const { error } = await supabase
    .from("subscriptions")
    .upsert(
      {
        user_id: opts.userId,
        plan: opts.plan ?? "free",
        status: "active",
        stripe_customer_id: opts.stripeCustomerId ?? null,
      },
      { onConflict: "user_id" }
    );
  if (error) throw new Error(`upsertSubscription failed: ${error.message}`);
}
