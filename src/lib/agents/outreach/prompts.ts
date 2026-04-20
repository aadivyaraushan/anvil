type ResearchBriefInput = {
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  sourcePayload: Record<string, unknown>;
};

type FitScoreInput = {
  targetProfile: string;
  ideaDescription: string;
  personas: Array<{
    name: string;
    description: string;
    pain_points: string[];
  }>;
  firstName: string;
  lastName: string;
  title: string;
  company: string;
  researchBrief: Record<string, unknown>;
};

type EmailDraftInput = {
  senderName: string;
  ideaDescription: string;
  firstName: string;
  company: string;
  personaName: string | null;
  researchBrief: Record<string, unknown>;
};

export function buildResearchBriefPrompt(input: ResearchBriefInput): string {
  return `You are turning an imported social profile into a clean outreach brief for ${input.firstName} ${input.lastName}, ${input.title} at ${input.company}.

Imported profile payload:
${JSON.stringify(input.sourcePayload, null, 2).slice(0, 5000)}

Return valid JSON with these exact keys:
- profile_summary: string — 2-3 sentences describing the person, their role, and company context using only the imported data
- relevant_signals: string[] — 2-4 concrete facts or clues from the profile that are useful for fit scoring
- talking_points: string[] — 2-3 specific observations that could make an outreach email feel grounded and human
- confidence_note: string — one sentence describing how complete or sparse the imported profile is

Return only valid JSON, no explanation.`;
}

export function buildFitScorePrompt(input: FitScoreInput): string {
  return `You are evaluating whether a contact is a good fit for outreach for a specific product idea and which customer archetype they most resemble.

Product idea: ${input.ideaDescription}
Target profile: ${input.targetProfile}
Archetypes:
${input.personas
  .map(
    (persona, index) =>
      `${index + 1}. ${persona.name}
Description: ${persona.description}
Pain points: ${persona.pain_points.join("; ")}`
  )
  .join("\n\n")}

Contact:
- Name: ${input.firstName} ${input.lastName}
- Title: ${input.title}
- Company: ${input.company}
- Research: ${JSON.stringify(input.researchBrief)}

Score this contact 0-100 on overall fit. Consider product relevance, decision-making proximity, evidence quality in the imported profile, and whether they clearly align to one of the archetypes.

Return JSON with:
- score: number (0-100)
- rationale: string (one sentence explaining the score)
- bestArchetype: string | null (exact archetype name if one fits, otherwise null)
- archetypeReason: string (one sentence explaining the archetype choice)

Return only valid JSON, no explanation.`;
}

export function buildEmailDraftPrompt(input: EmailDraftInput): string {
  return `You are writing a cold outreach email on behalf of ${input.senderName}.

Product being built: ${input.ideaDescription}

Recipient:
- Name: ${input.firstName}
- Company: ${input.company}
- Best-fit archetype: ${input.personaName ?? "No clear archetype yet"}
- Research: ${JSON.stringify(input.researchBrief)}

Write a short, personalized cold email. Rules:
- Under 150 words
- No generic openers ("I hope this finds you well", "My name is...")
- Open with a specific observation about the recipient or their company
- One sentence about what is being built
- Tie the message to the recipient's likely situation or pain point when possible
- One sentence asking for a 20-minute call
- Sign off as ${input.senderName}
- Must reference at least one specific fact from the research

Return only the email text, no subject line, no explanation.`;
}

export function buildQualityCheckPrompt(draft: string): string {
  return `Review this cold outreach email for quality. Fix any issues and return the improved version.

Email:
${draft}

Check for:
1. Not salesy or pushy (no urgency language, no "limited time", no excessive enthusiasm)
2. References real, specific facts (not generic praise)
3. Under 150 words
4. Clear ask (a call or meeting)
5. Professional but human tone

If the email passes all checks, return it unchanged.
If it fails any check, rewrite it to fix the issues while keeping the personalization.

Return only the final email text, no explanation.`;
}
