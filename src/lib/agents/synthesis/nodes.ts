import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createLlm } from "@/lib/llm";
import {
  buildExtractorPrompt,
  buildSynthesizerPrompt,
  type ExtractionInput,
} from "./prompts";
import type {
  SynthesisState,
  CompletedInterview,
  ContactMap,
  SynthesisResult,
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
  state: SynthesisState
): Promise<Partial<SynthesisState>> {
  const supabase = await createServerSupabaseClient();

  const { data: interviewRows, error: iErr } = await supabase
    .from("interviews")
    .select("id, contact_id, transcript")
    .eq("project_id", state.projectId)
    .eq("status", "completed");

  if (iErr) throw new Error(`Failed to fetch interviews: ${iErr.message}`);

  const interviews = (interviewRows ?? []) as CompletedInterview[];

  if (interviews.length === 0) {
    throw new Error(
      "No completed interviews found. Complete at least one interview before running synthesis."
    );
  }

  const contactIds = [
    ...new Set(
      interviews.map((i) => i.contact_id).filter((id): id is string => !!id)
    ),
  ];

  const contacts: ContactMap = {};
  if (contactIds.length > 0) {
    const { data: contactRows } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, title, company")
      .in("id", contactIds);

    for (const c of contactRows ?? []) {
      const row = c as {
        id: string;
        first_name: string;
        last_name: string;
        title: string;
        company: string;
      };
      contacts[row.id] = {
        name: `${row.first_name} ${row.last_name}`.trim(),
        title: row.title,
        company: row.company,
      };
    }
  }

  return { interviews, contacts };
}

// ── Node 2: extractAll ───────────────────────────────────────────────────────

export async function extractAll(
  state: SynthesisState
): Promise<Partial<SynthesisState>> {
  const extractionPromises = state.interviews.map(async (interview) => {
    const contact = state.contacts[interview.contact_id ?? ""] ?? {
      name: "Participant",
      title: "Unknown",
      company: "Unknown",
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
      keyQuote: string;
    };

    const result: ExtractionInput = {
      interviewId: interview.id,
      contactId: interview.contact_id ?? "",
      contactName: contact.name,
      contactTitle: contact.title,
      company: contact.company,
      painPoints: extracted.painPoints ?? [],
      topics: extracted.topics ?? [],
      keyQuote: extracted.keyQuote ?? "",
    };

    return result;
  });

  const extractedData = await Promise.all(extractionPromises);
  return { extractedData };
}

// ── Node 3: synthesize ───────────────────────────────────────────────────────

export async function synthesize(
  state: SynthesisState
): Promise<Partial<SynthesisState>> {
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

  const result = parseJson(text) as SynthesisResult;
  return { synthesisResult: result };
}

// ── Node 4: saveSynthesis ────────────────────────────────────────────────────

export async function saveSynthesis(
  state: SynthesisState
): Promise<Partial<SynthesisState>> {
  const result = state.synthesisResult!;
  const supabase = await createServerSupabaseClient();

  const { error: docErr } = await supabase
    .from("synthesis_documents")
    .update({
      content: {
        summary: result.summary,
        recommendations: result.recommendations,
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
    console.error("[synthesis] saveSynthesis doc update failed:", docErr.message);
  }

  const { error: projErr } = await supabase
    .from("projects")
    .update({ synthesis_status: "complete" })
    .eq("id", state.projectId);

  if (projErr) {
    console.error("[synthesis] synthesis_status update failed:", projErr.message);
  }

  return {};
}
