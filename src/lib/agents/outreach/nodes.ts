import { sendEmail } from "@/lib/resend";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createLlm } from "@/lib/llm";
import {
  buildResearchBriefPrompt,
  buildFitScorePrompt,
  buildEmailDraftPrompt,
  buildQualityCheckPrompt,
} from "./prompts";
import type { OutreachState } from "./state";
import type { Contact, Persona } from "@/lib/supabase/types";

let _llm: ReturnType<typeof createLlm> | null = null;

function getLlm() {
  if (!_llm) {
    _llm = createLlm();
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
  state: OutreachState
): Promise<Partial<OutreachState>> {
  const supabase = await createServerSupabaseClient();

  const { data: personas } = await supabase
    .from("personas")
    .select("*")
    .eq("project_id", state.projectId)
    .order("created_at", { ascending: true });

  if (!personas || personas.length === 0) {
    await supabase
      .from("projects")
      .update({ outreach_status: "idle" })
      .eq("id", state.projectId);
    return {
      errors: ["Confirm your archetypes before running outreach."],
      personas: [],
    };
  }

  if (state.contacts.length === 0) {
    await supabase
      .from("projects")
      .update({ outreach_status: "idle" })
      .eq("id", state.projectId);
    return {
      errors: ["Import CSV or JSON exports before running outreach."],
      personas: personas as Persona[],
    };
  }

  return {
    contacts: state.contacts,
    personas: personas as Persona[],
    currentIndex: 0,
  };
}

// ── Node 2: researchContact ─────────────────────────────────────────────────

export async function researchContact(
  state: OutreachState
): Promise<Partial<OutreachState>> {
  const contact = state.contacts[state.currentIndex];
  const supabase = await createServerSupabaseClient();

  let researchBrief: Record<string, unknown>;
  try {
    const response = await getLlm().invoke(
      buildResearchBriefPrompt({
        firstName: contact.first_name,
        lastName: contact.last_name,
        company: contact.company,
        title: contact.title,
        sourcePayload: contact.source_payload ?? {},
      })
    );
    researchBrief = parseJson(response.content as string);
  } catch {
    researchBrief = {
      profile_summary: `${contact.first_name} ${contact.last_name} ${contact.title} ${contact.company}`.trim(),
      relevant_signals: [contact.title, contact.company, contact.industry].filter(
        Boolean
      ),
      talking_points: [contact.location, contact.company_website].filter(Boolean),
      confidence_note: "Imported profile was sparse, so this brief uses only basic fields.",
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
  state: OutreachState
): Promise<Partial<OutreachState>> {
  const contact = state.contacts[state.currentIndex];
  const supabase = await createServerSupabaseClient();

  let score = 0;
  let fitStatus: "passed" | "skipped" = "skipped";
  let matchedPersonaId: string | null = null;
  let matchedPersonaName: string | null = null;
  let rationale = "";

  try {
    const response = await getLlm().invoke(
      buildFitScorePrompt({
        targetProfile: state.targetProfile,
        ideaDescription: state.ideaDescription,
        personas: state.personas.map((persona) => ({
          name: persona.name,
          description: persona.description,
          pain_points: persona.pain_points,
        })),
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
      bestArchetype: string | null;
      archetypeReason: string;
    };
    score = Math.max(0, Math.min(100, result.score));
    fitStatus = score >= 60 ? "passed" : "skipped";
    rationale = result.rationale;
    matchedPersonaName = result.bestArchetype ?? null;
    matchedPersonaId =
      state.personas.find(
        (persona) =>
          persona.name.trim().toLowerCase() ===
          (result.bestArchetype ?? "").trim().toLowerCase()
      )?.id ?? null;

    await supabase
      .from("contacts")
      .update({
        fit_score: score,
        fit_status: fitStatus,
        persona_id: matchedPersonaId,
        research_brief: {
          ...(contact.research_brief ?? {}),
          fit_rationale: result.rationale,
          matched_archetype: matchedPersonaName,
          archetype_reason: result.archetypeReason,
        },
      })
      .eq("id", contact.id);
  } catch (err) {
    await supabase
      .from("contacts")
      .update({ fit_score: 0, fit_status: "skipped", persona_id: null })
      .eq("id", contact.id);

    const updatedContacts = [...state.contacts];
    updatedContacts[state.currentIndex] = {
      ...contact,
      fit_score: 0,
      fit_status: "skipped",
      persona_id: null,
    };
    return {
      contacts: updatedContacts,
      errors: [`Score failed for ${contact.first_name} ${contact.last_name}: ${String(err)}`],
    };
  }

  const updatedContacts = [...state.contacts];
  updatedContacts[state.currentIndex] = {
    ...contact,
    fit_score: score,
    fit_status: fitStatus,
    persona_id: matchedPersonaId,
    research_brief: {
      ...(contact.research_brief ?? {}),
      fit_rationale: rationale,
      matched_archetype: matchedPersonaName,
    },
  };

  return { contacts: updatedContacts };
}

// ── Node 4: draftEmail ──────────────────────────────────────────────────────

export async function draftEmail(
  state: OutreachState
): Promise<Partial<OutreachState>> {
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
        personaName:
          state.personas.find((persona) => persona.id === contact.persona_id)?.name ??
          null,
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
  state: OutreachState
): Promise<Partial<OutreachState>> {
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
  state: OutreachState
): Promise<Partial<OutreachState>> {
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
    .update({ outreach_progress: newProgress })
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
  state: OutreachState
): Promise<Partial<OutreachState>> {
  const nextIndex = state.currentIndex + 1;

  if (nextIndex >= state.contacts.length) {
    const supabase = await createServerSupabaseClient();
    await supabase
      .from("projects")
      .update({
        outreach_status: "complete",
        outreach_progress: state.contacts.length,
      })
      .eq("id", state.projectId);
    return { currentIndex: nextIndex };
  }

  return { currentIndex: nextIndex };
}
