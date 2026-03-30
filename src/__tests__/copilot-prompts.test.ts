import { describe, it, expect } from "vitest";
import { buildCopilotPrompt } from "@/lib/agents/copilot/prompts";

describe("buildCopilotPrompt", () => {
  const baseInput = {
    projectName: "Anvil",
    ideaDescription: "AI-powered reconciliation tool for fintech CFOs",
    targetProfile: "CFOs at fintech companies",
    contactName: "Sarah Chen",
    contactTitle: "CFO",
    contactCompany: "FinFlow",
    transcript: [
      { speaker: "interviewer", text: "Can you walk me through your current reconciliation process?", timestamp: 0 },
      { speaker: "interviewee", text: "We use a mix of spreadsheets and our ERP system. It takes 3 days every month.", timestamp: 5000 },
    ],
    priorInterviewCount: 2,
  };

  it("includes the product idea and target profile", () => {
    const prompt = buildCopilotPrompt(baseInput);
    expect(prompt).toContain("AI-powered reconciliation tool");
    expect(prompt).toContain("CFOs at fintech companies");
  });

  it("includes the contact name and company", () => {
    const prompt = buildCopilotPrompt(baseInput);
    expect(prompt).toContain("Sarah Chen");
    expect(prompt).toContain("FinFlow");
  });

  it("includes transcript text", () => {
    const prompt = buildCopilotPrompt(baseInput);
    expect(prompt).toContain("spreadsheets and our ERP");
  });

  it("asks for follow-up questions", () => {
    const prompt = buildCopilotPrompt(baseInput);
    expect(prompt).toContain("follow-up");
  });

  it("works with empty transcript", () => {
    const prompt = buildCopilotPrompt({ ...baseInput, transcript: [] });
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });
});
