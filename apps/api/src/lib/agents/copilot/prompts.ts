type TranscriptChunk = {
  speaker: string;
  text: string;
  timestamp: number;
};

type CopilotPromptInput = {
  projectName: string;
  ideaDescription: string;
  targetProfile: string;
  contactName: string;
  contactTitle: string;
  contactCompany: string;
  transcript: TranscriptChunk[];
  priorInterviewCount: number;
};

function formatTranscript(chunks: TranscriptChunk[]): string {
  if (chunks.length === 0) return "(Interview just started — no transcript yet)";
  return chunks
    .map((c) => `[${c.speaker}]: ${c.text}`)
    .join("\n");
}

export function buildCopilotPrompt(input: CopilotPromptInput): string {
  return `You are an interview copilot helping conduct a customer discovery interview.

Product being researched: ${input.ideaDescription}
Target profile: ${input.targetProfile}
This is interview #${input.priorInterviewCount + 1} in this project.

Current interviewee:
- Name: ${input.contactName}
- Title: ${input.contactTitle} at ${input.contactCompany}

Live transcript so far:
${formatTranscript(input.transcript)}

Based on what has been said so far, suggest 3-5 sharp follow-up questions the interviewer should ask next.

Rules:
- Questions must dig deeper into pain points, not validate assumptions
- Each question should be open-ended (not yes/no)
- Avoid repeating topics already covered thoroughly
- Reference specific things the interviewee said to make questions feel natural
- Focus on uncovering the real problem, not evaluating the solution

Return a numbered list of questions only. No preamble or explanation.`;
}
