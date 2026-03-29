import { ChatAnthropic } from "@langchain/anthropic";
import { searchApollo } from "@/lib/apollo";
import { searchTavily } from "@/lib/tavily";
import { sendEmail } from "@/lib/resend";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  buildApolloParamsPrompt,
  buildResearchBriefPrompt,
  buildFitScorePrompt,
  buildEmailDraftPrompt,
  buildQualityCheckPrompt,
} from "./prompts";
import type { DiscoveryState } from "./state";
import type { Contact } from "@/lib/supabase/types";

let _llm: ChatAnthropic | null = null;

function getLlm(): ChatAnthropic {
  if (!_llm) {
    _llm = new ChatAnthropic({
      model: "claude-sonnet-4-6",
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return _llm;
}

function parseJson(text: string): Record<string, unknown> {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON found in LLM response: ${text}`);
  return JSON.parse(match[0]);
}

// ── Node 1: sourceContacts ──────────────────────────────────────────────────

export async function sourceContacts(
  state: DiscoveryState
): Promise<Partial<DiscoveryState>> {
  const supabase = await createServerSupabaseClient();

  const paramsResponse = await getLlm().invoke(
    buildApolloParamsPrompt(state.targetProfile)
  );
  const params = parseJson(paramsResponse.content as string) as {
    jobTitles: string[];
    seniorityLevels: string[];
    keywords: string[];
  };

  let apolloContacts;
  try {
    apolloContacts = await searchApollo({
      jobTitles: params.jobTitles,
      seniorityLevels: params.seniorityLevels,
      keywords: params.keywords,
      perPage: 50,
    });
  } catch (err) {
    await supabase
      .from("projects")
      .update({ discovery_status: "idle" })
      .eq("id", state.projectId);
    return { errors: [`Apollo sourcing failed: ${String(err)}`] };
  }

  if (apolloContacts.length === 0) {
    await supabase
      .from("projects")
      .update({ discovery_status: "complete" })
      .eq("id", state.projectId);
    return { contacts: [], errors: ["No contacts found from Apollo"] };
  }

  const inserts = apolloContacts.map((c) => ({
    project_id: state.projectId,
    source: "apollo" as const,
    first_name: c.first_name,
    last_name: c.last_name,
    email: c.email,
    title: c.title,
    company: c.company,
    company_website: c.company_website,
    linkedin_url: c.linkedin_url,
    industry: c.industry,
    location: c.location,
    apollo_data: c.raw,
    outreach_status: "pending" as const,
    research_brief: null,
    fit_score: null,
    fit_status: null,
    email_draft: null,
    email_sent_at: null,
  }));

  const { data, error } = await supabase
    .from("contacts")
    .insert(inserts)
    .select();

  if (error) throw new Error(`Failed to insert contacts: ${error.message}`);

  await supabase
    .from("projects")
    .update({ discovery_status: "running", discovery_progress: 0 })
    .eq("id", state.projectId);

  return { contacts: data as Contact[], currentIndex: 0 };
}

// ── Node 2: researchContact ─────────────────────────────────────────────────

export async function researchContact(
  state: DiscoveryState
): Promise<Partial<DiscoveryState>> {
  const contact = state.contacts[state.currentIndex];
  const supabase = await createServerSupabaseClient();

  const [companyResult, personResult] = await Promise.allSettled([
    searchTavily(`${contact.company} company overview funding news`),
    searchTavily(`${contact.first_name} ${contact.last_name} ${contact.company} ${contact.title}`),
  ]);

  const companyText =
    companyResult.status === "fulfilled"
      ? companyResult.value
      : `No company info found for ${contact.company}`;
  const personText =
    personResult.status === "fulfilled"
      ? personResult.value
      : `No person info found for ${contact.first_name} ${contact.last_name}`;

  let researchBrief: Record<string, unknown>;
  try {
    const response = await getLlm().invoke(
      buildResearchBriefPrompt({
        firstName: contact.first_name,
        lastName: contact.last_name,
        company: contact.company,
        title: contact.title,
        companySearchResult: companyText,
        personSearchResult: personText,
      })
    );
    researchBrief = parseJson(response.content as string);
  } catch {
    researchBrief = {
      company_summary: companyText.slice(0, 500),
      person_summary: personText.slice(0, 500),
      recent_news: "none found",
      talking_points: [],
    };
  }

  await supabase
    .from("contacts")
    .update({ research_brief: researchBrief })
    .eq("id", contact.id);

  const updatedContacts = [...state.contacts];
  updatedContacts[state.currentIndex] = {
    ...contact,
    research_brief: researchBrief,
  };

  return { contacts: updatedContacts };
}

// ── Node 3: scoreContact ────────────────────────────────────────────────────

export async function scoreContact(
  state: DiscoveryState
): Promise<Partial<DiscoveryState>> {
  const contact = state.contacts[state.currentIndex];
  const supabase = await createServerSupabaseClient();

  let score = 0;
  let fitStatus: "passed" | "skipped" = "skipped";

  try {
    const response = await getLlm().invoke(
      buildFitScorePrompt({
        targetProfile: state.targetProfile,
        ideaDescription: state.ideaDescription,
        firstName: contact.first_name,
        lastName: contact.last_name,
        title: contact.title,
        company: contact.company,
        researchBrief: contact.research_brief ?? {},
      })
    );
    const result = parseJson(response.content as string) as {
      score: number;
      rationale: string;
    };
    score = Math.max(0, Math.min(100, result.score));
    fitStatus = score >= 60 ? "passed" : "skipped";
  } catch (err) {
    await supabase
      .from("contacts")
      .update({ fit_score: 0, fit_status: "skipped" })
      .eq("id", contact.id);

    const updatedContacts = [...state.contacts];
    updatedContacts[state.currentIndex] = {
      ...contact,
      fit_score: 0,
      fit_status: "skipped",
    };
    return {
      contacts: updatedContacts,
      errors: [`Score failed for ${contact.first_name} ${contact.last_name}: ${String(err)}`],
    };
  }

  await supabase
    .from("contacts")
    .update({ fit_score: score, fit_status: fitStatus })
    .eq("id", contact.id);

  const updatedContacts = [...state.contacts];
  updatedContacts[state.currentIndex] = {
    ...contact,
    fit_score: score,
    fit_status: fitStatus,
  };

  return { contacts: updatedContacts };
}

// ── Node 4: draftEmail ──────────────────────────────────────────────────────

export async function draftEmail(
  state: DiscoveryState
): Promise<Partial<DiscoveryState>> {
  const contact = state.contacts[state.currentIndex];
  const supabase = await createServerSupabaseClient();

  let draft = "";
  try {
    const response = await getLlm().invoke(
      buildEmailDraftPrompt({
        senderName: state.senderName,
        ideaDescription: state.ideaDescription,
        firstName: contact.first_name,
        company: contact.company,
        researchBrief: contact.research_brief ?? {},
      })
    );
    draft = (response.content as string).trim();
  } catch (err) {
    await supabase
      .from("contacts")
      .update({ fit_status: "skipped" })
      .eq("id", contact.id);
    const updatedContacts = [...state.contacts];
    updatedContacts[state.currentIndex] = { ...contact, fit_status: "skipped" };
    return {
      contacts: updatedContacts,
      errors: [`Draft failed for ${contact.first_name}: ${String(err)}`],
    };
  }

  await supabase
    .from("contacts")
    .update({ email_draft: draft, outreach_status: "drafted" })
    .eq("id", contact.id);

  const updatedContacts = [...state.contacts];
  updatedContacts[state.currentIndex] = {
    ...contact,
    email_draft: draft,
    outreach_status: "drafted",
  };

  return { contacts: updatedContacts };
}

// ── Node 5: qualityCheck ────────────────────────────────────────────────────

export async function qualityCheck(
  state: DiscoveryState
): Promise<Partial<DiscoveryState>> {
  const contact = state.contacts[state.currentIndex];
  const supabase = await createServerSupabaseClient();

  if (!contact.email_draft) return {};

  let finalDraft = contact.email_draft;
  try {
    const response = await getLlm().invoke(
      buildQualityCheckPrompt(contact.email_draft)
    );
    finalDraft = (response.content as string).trim();
  } catch {
    // On failure, keep the existing draft
  }

  await supabase
    .from("contacts")
    .update({ email_draft: finalDraft })
    .eq("id", contact.id);

  const updatedContacts = [...state.contacts];
  updatedContacts[state.currentIndex] = {
    ...contact,
    email_draft: finalDraft,
  };

  return { contacts: updatedContacts };
}

// ── Node 6: sendOrQueue ─────────────────────────────────────────────────────

export async function sendOrQueue(
  state: DiscoveryState
): Promise<Partial<DiscoveryState>> {
  const contact = state.contacts[state.currentIndex];
  const supabase = await createServerSupabaseClient();

  if (!contact.email_draft) return {};

  let newStatus: Contact["outreach_status"] = "drafted";
  let emailSentAt: string | null = null;

  if (state.autoSendEnabled && contact.email && state.senderEmail && state.senderName) {
    try {
      const subject = `Quick question about ${contact.company}`;
      const from = `${state.senderName} <${state.senderEmail}>`;
      await sendEmail({ to: contact.email, from, subject, text: contact.email_draft });
      newStatus = "sent";
      emailSentAt = new Date().toISOString();
    } catch {
      newStatus = "drafted";
    }
  }

  await supabase
    .from("contacts")
    .update({ outreach_status: newStatus, email_sent_at: emailSentAt })
    .eq("id", contact.id);

  const newProgress = (state.currentIndex ?? 0) + 1;
  await supabase
    .from("projects")
    .update({ discovery_progress: newProgress })
    .eq("id", state.projectId);

  const updatedContacts = [...state.contacts];
  updatedContacts[state.currentIndex] = {
    ...contact,
    outreach_status: newStatus,
    email_sent_at: emailSentAt,
  };

  return { contacts: updatedContacts };
}

// ── Node 7: routeNext ───────────────────────────────────────────────────────

export async function routeNext(
  state: DiscoveryState
): Promise<Partial<DiscoveryState>> {
  const nextIndex = state.currentIndex + 1;

  if (nextIndex >= state.contacts.length) {
    const supabase = await createServerSupabaseClient();
    await supabase
      .from("projects")
      .update({ discovery_status: "complete" })
      .eq("id", state.projectId);
    return { currentIndex: nextIndex };
  }

  return { currentIndex: nextIndex };
}
