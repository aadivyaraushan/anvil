import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createLlm } from "@/lib/llm";
import { buildBriefPrompt } from "./prompts";
import type { BriefState } from "./state";
import type { InterviewBrief } from "@/lib/supabase/types";

let _llm: ReturnType<typeof createLlm> | null = null;

function getLlm() {
  if (!_llm) _llm = createLlm();
  return _llm;
}

function parseJson(text: string): unknown {
  const stripped = text
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON found in LLM response: ${text.slice(0, 200)}`);
  return JSON.parse(match[0]);
}

// ── Node 1: searchInterviewee ────────────────────────────────────────────────

export async function searchInterviewee(
  state: BriefState
): Promise<Partial<BriefState>> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn("[brief] TAVILY_API_KEY not set, skipping search");
    return { searchResults: [] };
  }

  const query = [state.intervieweeName, state.intervieweeEmail]
    .filter(Boolean)
    .join(" ");

  if (!query.trim()) return { searchResults: [] };

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: `${query} professional background role company`,
        max_results: 5,
        search_depth: "basic",
        include_answer: false,
      }),
    });

    if (!res.ok) {
      console.warn("[brief] Tavily search failed:", res.status);
      return { searchResults: [] };
    }

    const data = (await res.json()) as {
      results: Array<{ title: string; url: string; content: string }>;
    };

    return {
      searchResults: (data.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content.slice(0, 500),
      })),
    };
  } catch (err) {
    console.warn("[brief] Tavily search error:", String(err));
    return { searchResults: [] };
  }
}

// ── Node 2: synthesizeBrief ──────────────────────────────────────────────────

export async function synthesizeBrief(
  state: BriefState
): Promise<Partial<BriefState>> {
  const response = await getLlm().invoke(
    buildBriefPrompt({
      intervieweeName: state.intervieweeName,
      intervieweeEmail: state.intervieweeEmail,
      searchResults: state.searchResults,
      ideaDescription: state.ideaDescription,
      targetProfile: state.targetProfile,
    })
  );

  const text =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

  const brief = parseJson(text) as InterviewBrief;
  return { brief };
}

// ── Node 3: saveBrief ────────────────────────────────────────────────────────

export async function saveBrief(
  state: BriefState
): Promise<Partial<BriefState>> {
  const supabase = await createServerSupabaseClient();

  await supabase
    .from("interviews")
    .update({ brief: state.brief, brief_status: "complete" })
    .eq("id", state.interviewId);

  return {};
}
