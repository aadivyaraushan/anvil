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
  contactName: string;
  contactTitle: string;
  company: string;
  painPoints: Array<{ description: string; severity: string; quote: string }>;
  topics: string[];
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
  "keyQuote": "single most impactful verbatim quote from this interview"
}

Rules:
- Only include pain points actually stated in the transcript — do not infer
- Quotes must be exact words from the transcript
- Maximum 5 pain points, 8 topic keywords
- If the transcript is empty or too short, return {"painPoints":[],"topics":[],"keyQuote":""}`;
}

export function buildSynthesizerPrompt(
  extractions: ExtractionInput[],
  projectContext: { ideaDescription: string; targetProfile: string; projectName: string }
): string {
  const extractionText = extractions
    .map(
      (e, i) =>
        `### Interview ${i + 1}: ${e.contactName} (${e.contactTitle}, ${e.company})
interviewId: ${e.interviewId}
contactId: ${e.contactId}
painPoints: ${JSON.stringify(e.painPoints)}
topics: ${e.topics.join(", ")}
keyQuote: "${e.keyQuote}"`
    )
    .join("\n\n");

  return `You are synthesizing ${extractions.length} user research interview(s) for a startup.

## Project: ${projectContext.projectName}
Idea: ${projectContext.ideaDescription}
Target users: ${projectContext.targetProfile}

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
  "saturationScore": <0-100>,
  "uniquePatternCount": <number>,
  "recommendations": ["specific actionable recommendation"]
}

Rules:
- Maximum 8 pain points (consolidate similar ones)
- Maximum 6 patterns
- Maximum 5 key quotes (most impactful)
- saturationScore: 100 = same themes heard repeatedly across all interviews, 0 = completely new themes in each interview
- Recommendations must be specific product or research actions`;
}
