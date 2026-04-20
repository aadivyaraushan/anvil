import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createLlm } from "@/lib/llm";
import {
  buildExtractorPrompt,
  buildSynthesizerPrompt,
  type ExtractionInput,
} from "./prompts";
import type {
  AnalystState,
  CompletedInterview,
  ContactMap,
  AnalystResult,
  PersonaSnapshot,
  AnalystPersonaInsight,
} from "./state";

let _llm: ReturnType<typeof createLlm> | null = null;

function getLlm() {
  if (!_llm) {
    _llm = createLlm();
  }
  return _llm;
}

function parseJson(text: string): unknown {
  const stripped = text
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
  const match = stripped.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match)
    throw new Error(`No JSON found in LLM response: ${text.slice(0, 200)}`);
  return JSON.parse(match[0]);
}

// ── Node 1: fetchData ────────────────────────────────────────────────────────

export async function fetchData(
  state: AnalystState
): Promise<Partial<AnalystState>> {
  const supabase = await createServerSupabaseClient();

  const { data: interviewRows, error: iErr } = await supabase
    .from("interviews")
    .select("id, contact_id, persona_id, transcript")
    .eq("project_id", state.projectId)
    .eq("status", "completed");

  if (iErr) throw new Error(`Failed to fetch interviews: ${iErr.message}`);

  const interviews = (interviewRows ?? []) as CompletedInterview[];

  if (interviews.length === 0) {
    throw new Error(
      "No completed interviews found. Complete at least one interview before running the analyst."
    );
  }

  const contacts: ContactMap = {};
  const { data: contactRows } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, title, company, persona_id")
    .eq("project_id", state.projectId);

  for (const c of contactRows ?? []) {
    const row = c as {
      id: string;
      first_name: string;
      last_name: string;
      title: string;
      company: string;
      persona_id: string | null;
    };
    contacts[row.id] = {
      name: `${row.first_name} ${row.last_name}`.trim(),
      title: row.title,
      company: row.company,
      personaId: row.persona_id,
    };
  }

  const { data: personaRows } = await supabase
    .from("personas")
    .select("*")
    .eq("project_id", state.projectId)
    .order("created_at", { ascending: true });

  const personas = ((personaRows ?? []) as Array<{
    id: string;
    name: string;
    description: string;
    pain_points: string[];
  }>).map((persona) => ({
    ...persona,
    prospectCount: Object.values(contacts).filter(
      (contact) => contact.personaId === persona.id
    ).length,
  })) as PersonaSnapshot[];

  return { interviews, contacts, personas };
}

// ── Node 2: extractAll ───────────────────────────────────────────────────────

export async function extractAll(
  state: AnalystState
): Promise<Partial<AnalystState>> {
  const extractionPromises = state.interviews.map(async (interview) => {
    const contact = state.contacts[interview.contact_id ?? ""] ?? {
      name: "Participant",
      title: "Unknown",
      company: "Unknown",
      personaId: null,
    };

    const response = await getLlm().invoke(
      buildExtractorPrompt(interview.transcript, contact, {
        ideaDescription: state.ideaDescription,
        targetProfile: state.targetProfile,
      })
    );

    const text =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    const extracted = parseJson(text) as {
      painPoints: Array<{ description: string; severity: string; quote: string }>;
      topics: string[];
      customerLanguage: string[];
      keyQuote: string;
    };

    const result: ExtractionInput = {
      interviewId: interview.id,
      contactId: interview.contact_id ?? "",
      personaId: interview.persona_id ?? contact.personaId,
      contactName: contact.name,
      contactTitle: contact.title,
      company: contact.company,
      painPoints: extracted.painPoints ?? [],
      topics: extracted.topics ?? [],
      customerLanguage: extracted.customerLanguage ?? [],
      keyQuote: extracted.keyQuote ?? "",
    };

    return result;
  });

  const extractedData = await Promise.all(extractionPromises);
  return { extractedData };
}

// ── Node 3: synthesize ───────────────────────────────────────────────────────

export async function synthesize(
  state: AnalystState
): Promise<Partial<AnalystState>> {
  const response = await getLlm().invoke(
    buildSynthesizerPrompt(state.extractedData, {
      ideaDescription: state.ideaDescription,
      targetProfile: state.targetProfile,
      projectName: state.projectName,
    })
  );

  const text =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

  const overall = parseJson(text) as Omit<AnalystResult, "personas">;

  const personas = await Promise.all(
    state.personas.map(async (persona) => {
      const personaExtractions = state.extractedData.filter(
        (extraction) => extraction.personaId === persona.id
      );

      if (personaExtractions.length === 0) {
        return {
          personaId: persona.id,
          personaName: persona.name,
          summary: "No completed interviews are tagged to this archetype yet.",
          painPoints: [],
          customerLanguage: [],
          keyQuotes: [],
          saturationScore: 0,
          interviewCount: 0,
          prospectCount: persona.prospectCount,
          recommendations: [
            "Run interviews with this archetype to build evidence-backed insight.",
          ],
        } satisfies AnalystPersonaInsight;
      }

      const personaResponse = await getLlm().invoke(
        buildSynthesizerPrompt(
          personaExtractions,
          {
            ideaDescription: state.ideaDescription,
            targetProfile: state.targetProfile,
            projectName: state.projectName,
          },
          {
            name: persona.name,
            description: persona.description,
          }
        )
      );

      const personaText =
        typeof personaResponse.content === "string"
          ? personaResponse.content
          : JSON.stringify(personaResponse.content);

      const personaResult = parseJson(personaText) as Omit<
        AnalystResult,
        "personas"
      >;

      return {
        personaId: persona.id,
        personaName: persona.name,
        summary: personaResult.summary,
        painPoints: personaResult.painPoints,
        customerLanguage: personaResult.customerLanguage ?? [],
        keyQuotes: personaResult.keyQuotes,
        saturationScore: personaResult.saturationScore,
        interviewCount: personaExtractions.length,
        prospectCount: persona.prospectCount,
        recommendations: personaResult.recommendations,
      } satisfies AnalystPersonaInsight;
    })
  );

  return {
    analystResult: {
      ...overall,
      personas,
      customerLanguage: overall.customerLanguage ?? [],
    },
  };
}

// ── Node 4: saveAnalyst ────────────────────────────────────────────────────

export async function saveAnalyst(
  state: AnalystState
): Promise<Partial<AnalystState>> {
  const result = state.analystResult!;
  const supabase = await createServerSupabaseClient();

  const { error: docErr } = await supabase
    .from("analyst_documents")
    .update({
      content: {
        summary: result.summary,
        recommendations: result.recommendations,
        customerLanguage: result.customerLanguage,
        personas: result.personas,
      },
      pain_points: result.painPoints,
      patterns: result.patterns,
      key_quotes: result.keyQuotes,
      saturation_score: result.saturationScore,
      interview_count: state.interviews.length,
      unique_pattern_count: result.uniquePatternCount,
    })
    .eq("project_id", state.projectId);

  if (docErr) {
    console.error("[analyst] saveAnalyst doc update failed:", docErr.message);
  }

  const { error: projErr } = await supabase
    .from("projects")
    .update({ analyst_status: "complete" })
    .eq("id", state.projectId);

  if (projErr) {
    console.error("[analyst] analyst_status update failed:", projErr.message);
  }

  return {};
}
