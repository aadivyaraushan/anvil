export function buildBriefPrompt(params: {
  intervieweeName: string;
  intervieweeEmail: string;
  searchResults: Array<{ title: string; url: string; content: string }>;
  ideaDescription: string;
  targetProfile: string;
}): string {
  const resultsText = params.searchResults
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content}`)
    .join("\n\n");

  const emailDomain = params.intervieweeEmail
    ? params.intervieweeEmail.split("@")[1] ?? ""
    : "";

  return `You are preparing a research brief for an upcoming customer discovery interview.

## Interviewee
Name: ${params.intervieweeName || "Unknown"}
Email: ${params.intervieweeEmail || "Unknown"}${emailDomain ? `\nCompany domain: ${emailDomain}` : ""}

## Startup Context
Idea: ${params.ideaDescription}
Target users: ${params.targetProfile}

## Online Research Results
${resultsText || "No search results found."}

Generate a concise pre-interview brief. Output ONLY valid JSON (no markdown):
{
  "name": "Full name",
  "role": "Current job title",
  "company": "Company name",
  "industry": "Industry or sector",
  "summary": "2-3 sentence summary of who this person is and their professional context",
  "background": "Relevant professional background in 1-2 sentences",
  "relevance": "Why this person is relevant to the startup idea in 1 sentence",
  "suggested_topics": ["specific topic to explore based on their background", "another topic"],
  "online_sources": [{"title": "page title", "url": "url"}]
}

Rules:
- Only include what you can verify from search results or email domain
- If name/role/company are unknown, use empty string
- suggested_topics should be specific to this person's context
- Maximum 5 suggested_topics
- Maximum 3 online_sources (most relevant only)
- Do not hallucinate facts`;
}
