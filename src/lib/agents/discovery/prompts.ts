type ResearchBriefInput = {
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  companySearchResult: string;
  personSearchResult: string;
};

type FitScoreInput = {
  targetProfile: string;
  ideaDescription: string;
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
  researchBrief: Record<string, unknown>;
};

export function buildApolloParamsPrompt(targetProfile: string): string {
  return `You are helping build search parameters for the Apollo.io People Search API.

Target profile: ${targetProfile}

Return a JSON object with these exact keys:
- jobTitles: string[] — 3-6 relevant job titles
- seniorityLevels: string[] — from: ["c_suite", "vp", "director", "manager", "senior", "entry"]
- keywords: string[] — 3-5 industry or domain keywords

Return only valid JSON, no explanation.`;
}

export function buildResearchBriefPrompt(input: ResearchBriefInput): string {
  return `You are researching ${input.firstName} ${input.lastName}, ${input.title} at ${input.company}, for a sales outreach campaign.

Company search results:
${input.companySearchResult}

Person search results:
${input.personSearchResult}

Synthesize a research brief as JSON with these exact keys:
- company_summary: string — 2-3 sentences about what the company does and its current stage
- person_summary: string — 2-3 sentences about the person's background and role
- recent_news: string — most notable recent development (funding, product launch, hire, etc.) or "none found"
- talking_points: string[] — 2-3 specific, concrete facts that could make an outreach email feel personal and relevant

Return only valid JSON, no explanation.`;
}

export function buildFitScorePrompt(input: FitScoreInput): string {
  return `You are evaluating whether a contact is a good fit for outreach for a specific product idea.

Product idea: ${input.ideaDescription}
Target profile: ${input.targetProfile}

Contact:
- Name: ${input.firstName} ${input.lastName}
- Title: ${input.title}
- Company: ${input.company}
- Research: ${JSON.stringify(input.researchBrief)}

Score this contact 0-100 on overall fit. Consider:
1. Relevance (0-25): Does their domain/industry match the product idea?
2. Seniority (0-25): Are they a decision-maker or influencer?
3. Reachability (0-25): Is there shared context or a warm angle for outreach?
4. Achievement hook (0-25): Are there concrete facts that make personalization credible?

Return JSON with:
- score: number (0-100)
- rationale: string (one sentence explaining the score)

Return only valid JSON, no explanation.`;
}

export function buildEmailDraftPrompt(input: EmailDraftInput): string {
  return `You are writing a cold outreach email on behalf of ${input.senderName}.

Product being built: ${input.ideaDescription}

Recipient:
- Name: ${input.firstName}
- Company: ${input.company}
- Research: ${JSON.stringify(input.researchBrief)}

Write a short, personalized cold email. Rules:
- Under 150 words
- No generic openers ("I hope this finds you well", "My name is...")
- Open with a specific observation about the recipient or their company
- One sentence about what is being built
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
