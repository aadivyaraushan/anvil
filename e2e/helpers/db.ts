import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _adminClient: SupabaseClient | null = null;

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
    })
    .select("id")
    .single();
  if (error) throw new Error(`seedProject failed: ${error.message}`);
  return (data as { id: string }).id;
}

export async function seedContact(opts: {
  projectId: string;
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
      source: "apollo",
      first_name: opts.firstName ?? "Test",
      last_name: opts.lastName ?? "Contact",
      email: opts.email ?? `contact-${Date.now()}@example.com`,
      title: opts.title ?? "Engineer",
      company: opts.company ?? "Acme Inc",
      linkedin_url: "",
      company_website: "",
      industry: "Software",
      location: "Remote",
      outreach_status: "pending",
    })
    .select("id")
    .single();
  if (error) throw new Error(`seedContact failed: ${error.message}`);
  return (data as { id: string }).id;
}

export async function seedInterview(opts: {
  projectId: string;
  contactId?: string;
  status?: "scheduled" | "live" | "completed";
}): Promise<string> {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("interviews")
    .insert({
      project_id: opts.projectId,
      contact_id: opts.contactId ?? null,
      meeting_platform: "zoom",
      meeting_link: "https://zoom.us/j/test",
      scheduled_at: new Date().toISOString(),
      status: opts.status ?? "scheduled",
      transcript: [],
      suggested_questions: [],
    })
    .select("id")
    .single();
  if (error) throw new Error(`seedInterview failed: ${error.message}`);
  return (data as { id: string }).id;
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
