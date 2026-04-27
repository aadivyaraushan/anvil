import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { createLlm } from "@/lib/llm";
import {
  buildExtractorPrompt,
  buildSynthesizerPrompt,
  buildProposeArchetypesPrompt,
  type ExtractionInput,
} from "./prompts";
import {
  shouldProposeArchetypes,
  type ProposalPersona,
} from "./proposal";
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
  const supabase = createServiceSupabaseClient();

  const { data: interviewRows, error: iErr } = await supabase
    .from("interviews")
    .select("id, persona_id, transcript")
    .eq("project_id", state.projectId)
    .eq("status", "completed");

  if (iErr) throw new Error(`Failed to fetch interviews: ${iErr.message}`);

  const interviews = (interviewRows ?? []).map((row) => ({
    ...row,
    contact_id: null,
  })) as CompletedInterview[];

  if (interviews.length === 0) {
    throw new Error(
      "No completed interviews found. Complete at least one interview before running the analyst."
    );
  }

  const contacts: ContactMap = {};

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
    prospectCount: 0,
  })) as PersonaSnapshot[];

  return { interviews, contacts, personas };
}

// ── Node 2: extractAll ───────────────────────────────────────────────────────

export async function extractAll(
  state: AnalystState
): Promise<Partial<AnalystState>> {
  const extractionPromises = state.interviews.map(async (interview) => {
    const contact = {
      name: "Participant",
      title: "Unknown",
      company: "Unknown",
      personaId: interview.persona_id,
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
      contactId: "",
      personaId: interview.persona_id,
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
  const supabase = createServiceSupabaseClient();

  // Upsert (not update) so a missing analyst_documents row lands instead
  // of being silently dropped. Same pattern that hid the recording
  // transcript-save bug — `.update().eq()` returns error: null when zero
  // rows match, so a missing pre-seeded row meant the analyst pipeline
  // would log an empty error and the row would never be written.
  // `.select("project_id")` forces a 0-row result to surface as an error
  // we can act on.
  const docPayload = {
    project_id: state.projectId,
    content: {
      summary: result.summary,
      recommendations: result.recommendations,
      customerLanguage: result.customerLanguage,
      personas: result.personas,
    },
    pain_points: result.painPoints.map((p) => ({
      title: p.description,
      severity: (["high", "medium", "low"].includes(p.severity)
        ? p.severity
        : "medium") as "high" | "medium" | "low",
      count: p.frequency,
      example_quote: p.quotes[0]?.text,
      example_source: p.quotes[0]?.interview_id,
    })),
    patterns: result.patterns,
    key_quotes: result.keyQuotes.map((q) => ({
      quote: q.quote,
      speaker: "",
      interview_id: q.interview_id,
      tags: [],
    })),
    customer_language: result.customerLanguage,
    saturation_score: result.saturationScore,
    interview_count: state.interviews.length,
    unique_pattern_count: result.uniquePatternCount,
  };
  const { error: docErr, data: docRows } = await supabase
    .from("analyst_documents")
    .upsert(docPayload, { onConflict: "project_id" })
    .select("project_id");

  if (docErr) {
    console.error("[analyst] saveAnalyst doc upsert failed:", docErr.message);
  } else if (!docRows || docRows.length === 0) {
    console.error("[analyst] saveAnalyst doc upsert affected 0 rows");
  }

  const { error: projErr } = await supabase
    .from("projects")
    .update({ analyst_status: "complete" })
    .eq("id", state.projectId);

  if (projErr) {
    console.error("[analyst] analyst_status update failed:", projErr.message);
  }

  // ── Soft archetype proposal ──────────────────────────────────────────────
  {
    const { data: existingPersonas } = await supabase
      .from("personas")
      .select("id, status")
      .eq("project_id", state.projectId);

    const decision = shouldProposeArchetypes({
      completedInterviewCount: state.interviews.length,
      existingPersonas: (existingPersonas ?? []) as ProposalPersona[],
    });

    if (decision) {
      try {
        const interviewsSummary = state.extractedData
          .map(
            (e, i) =>
              `Interview ${i + 1}: pain points = ${e.painPoints.map((p) => p.description).join(", ")}; language = ${e.customerLanguage.join(", ")}`
          )
          .join("\n");

        const proposeResponse = await getLlm().invoke(
          buildProposeArchetypesPrompt(
            state.ideaDescription,
            state.targetProfile,
            interviewsSummary
          )
        );

        const proposeText =
          typeof proposeResponse.content === "string"
            ? proposeResponse.content
            : JSON.stringify(proposeResponse.content);

        const proposed = parseJson(proposeText) as Array<{
          name: string;
          description: string;
          job_titles: string[];
          pain_points: string[];
        }>;

        if (Array.isArray(proposed) && proposed.length > 0) {
          await supabase.from("personas").insert(
            proposed.map((p) => ({
              project_id: state.projectId,
              name: p.name,
              description: p.description,
              job_titles: p.job_titles ?? [],
              pain_points: p.pain_points ?? [],
              status: "suggested" as const,
            }))
          );
        }
      } catch (proposeErr) {
        // Non-fatal — analyst output still saved; archetypes can be proposed manually
        console.error("[analyst] archetype proposal failed:", proposeErr);
      }
    }
  }

  return {};
}
