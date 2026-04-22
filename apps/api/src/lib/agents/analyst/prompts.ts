// ── Soft-archetype proposal prompt ─────────────────────────────────────────
// Used by the analyst to auto-propose archetypes after ≥2 completed
// interviews when no confirmed personas exist yet.
export function buildProposeArchetypesPrompt(
  ideaDescription: string,
  targetProfile: string,
  interviewsSummary: string
): string {
  return `You are helping a founder understand who they are talking to, based on evidence from real interviews.

Startup idea:
${ideaDescription}

Target profile (founder's initial hypothesis):
${targetProfile}

Evidence from ${interviewsSummary.split("\n").length} completed interviews:
${interviewsSummary}

Based only on what you see in the interview evidence above, propose 2–3 customer archetypes.
Each archetype should reflect a meaningfully different type of person visible in the data.
Do not invent archetypes that aren't supported by the evidence.
Keep names short and memorable (3–5 words max).

Respond with ONLY valid JSON, no markdown:
[
  {
    "name": "archetype name",
    "description": "2-3 sentences: who they are and why the product matters to them",
    "job_titles": ["job title"],
    "pain_points": ["pain point visible in interviews"]
  }
]`;
}

export function buildArchetypePrompt(
  ideaDescription: string,
  targetProfile: string
): string {
  return `You are helping a founder map out their customer base before running interviews.

Startup idea:
${ideaDescription}

Target profile described by founder:
${targetProfile}

Generate distinct customer archetypes for this product. Each archetype is a meaningfully different type of person who would approach this product with different needs, context, or behaviors.

Return the smallest set of archetypes that still captures the real differences in this market. Typically this should be 2-3 archetypes, occasionally 4 if the segments are clearly distinct.

Do not split hairs. If two archetypes would have the same buyer context, goals, pains, or buying behavior with only minor title/company variations, merge them into one broader archetype instead of listing both.

Only include an archetype when it is meaningfully different from the others. Do not invent archetypes that do not follow naturally from the idea and target profile, and do not pad the list for completeness.

Respond with ONLY a valid JSON array, no markdown, no explanation:
[
  {
    "name": "short memorable archetype name, e.g. 'The Overwhelmed CFO'",
    "description": "2-3 sentences: who they are, their situation, and why this product matters to them",
    "job_titles": ["typical job title", "another typical job title"],
    "pain_points": ["specific pain point for this archetype", "another pain point"]
  }
]`;
}

export type TranscriptTurn = {
  speaker: string;
  text: string;
  timestamp: number;
};

export type ContactInfo = {
  name: string;
  title: string;
  company: string;
};

export type ProjectContext = {
  ideaDescription: string;
  targetProfile: string;
};

export type ExtractionInput = {
  interviewId: string;
  contactId: string;
  personaId: string | null;
  contactName: string;
  contactTitle: string;
  company: string;
  painPoints: Array<{ description: string; severity: string; quote: string }>;
  topics: string[];
  customerLanguage: string[];
  keyQuote: string;
};

export function buildExtractorPrompt(
  transcript: TranscriptTurn[],
  contact: ContactInfo,
  projectContext: ProjectContext
): string {
  const turns = transcript
    .slice(-40)
    .map((t) => `${t.speaker}: ${t.text}`)
    .join("\n");

  return `You are analyzing a user research interview to extract insights for a startup.

## Project Context
Idea: ${projectContext.ideaDescription}
Target users: ${projectContext.targetProfile}

## Interviewee
${contact.name}, ${contact.title} at ${contact.company}

## Interview Transcript
${turns}

Extract insights from this interview. Output ONLY valid JSON (no markdown, no explanation):
{
  "painPoints": [
    { "description": "specific pain point in one sentence", "severity": "high" | "medium" | "low", "quote": "verbatim quote from transcript" }
  ],
  "topics": ["topic keyword"],
  "customerLanguage": ["short verbatim phrase from the transcript"],
  "keyQuote": "single most impactful verbatim quote from this interview"
}

Rules:
- Only include pain points actually stated in the transcript — do not infer
- Quotes must be exact words from the transcript
- customerLanguage phrases should be 2-8 words and verbatim
- Maximum 5 pain points, 8 topic keywords, 5 customerLanguage phrases
- If the transcript is empty or too short, return {"painPoints":[],"topics":[],"customerLanguage":[],"keyQuote":""}`;
}

export function buildSynthesizerPrompt(
  extractions: ExtractionInput[],
  projectContext: { ideaDescription: string; targetProfile: string; projectName: string },
  segmentContext?: { name: string; description?: string }
): string {
  const extractionText = extractions
    .map(
      (e, i) =>
        `### Interview ${i + 1}: ${e.contactName} (${e.contactTitle}, ${e.company})
interviewId: ${e.interviewId}
contactId: ${e.contactId}
painPoints: ${JSON.stringify(e.painPoints)}
topics: ${e.topics.join(", ")}
customerLanguage: ${JSON.stringify(e.customerLanguage)}
keyQuote: "${e.keyQuote}"`
    )
    .join("\n\n");

  return `You are synthesizing ${extractions.length} user research interview(s) for a startup.

## Project: ${projectContext.projectName}
Idea: ${projectContext.ideaDescription}
Target users: ${projectContext.targetProfile}
${segmentContext ? `Segment: ${segmentContext.name}\nSegment description: ${segmentContext.description ?? "n/a"}` : ""}

## Interview Extractions
${extractionText}

Synthesize these interviews into consolidated insights. Output ONLY valid JSON (no markdown, no explanation):
{
  "summary": "2-3 sentence executive summary of the main findings",
  "painPoints": [
    {
      "description": "consolidated pain point",
      "severity": "high" | "medium" | "low",
      "frequency": <number of interviews mentioning this>,
      "quotes": [{ "text": "verbatim quote", "contact_id": "...", "interview_id": "..." }]
    }
  ],
  "patterns": [
    {
      "name": "pattern name (3-5 words)",
      "description": "what this means for the product",
      "interviewIds": ["id1", "id2"]
    }
  ],
  "keyQuotes": [
    { "quote": "verbatim quote", "contact_id": "...", "interview_id": "..." }
  ],
  "customerLanguage": ["recurring verbatim phrase"],
  "saturationScore": <0-100>,
  "uniquePatternCount": <number>,
  "recommendations": ["specific actionable recommendation"]
}

Rules:
- Maximum 8 pain points (consolidate similar ones)
- Maximum 6 patterns
- Maximum 5 key quotes (most impactful)
- Maximum 8 customerLanguage phrases
- saturationScore: 100 = same themes heard repeatedly across all interviews, 0 = completely new themes in each interview
- Recommendations must be specific product or research actions`;
}
