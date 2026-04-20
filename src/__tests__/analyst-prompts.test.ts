import { describe, expect, it } from "vitest";
import {
  buildExtractorPrompt,
  buildSynthesizerPrompt,
} from "@/lib/agents/analyst/prompts";

const transcript = [
  { speaker: "Interviewer", text: "Tell me about your biggest pain point.", timestamp: 0 },
  { speaker: "Sarah", text: "We spend hours reconciling invoices every month.", timestamp: 5 },
  { speaker: "Interviewer", text: "How much time roughly?", timestamp: 10 },
  { speaker: "Sarah", text: "At least 20 hours per person. It's killing us.", timestamp: 15 },
];

const contact = { name: "Sarah Chen", title: "CFO", company: "FinFlow" };
const projectContext = {
  ideaDescription: "AI reconciliation tool for finance teams",
  targetProfile: "CFOs at fintech companies",
};

const extractions = [
  {
    interviewId: "int-1",
    contactId: "contact-1",
    personaId: "persona-1",
    contactName: "Sarah Chen",
    contactTitle: "CFO",
    company: "FinFlow",
    painPoints: [{ description: "Manual reconciliation", severity: "high", quote: "20 hours per person" }],
    topics: ["reconciliation", "time"],
    customerLanguage: ["killing us"],
    keyQuote: "At least 20 hours per person. It's killing us.",
  },
];

describe("buildExtractorPrompt", () => {
  it("includes interviewer and interviewee turns", () => {
    const prompt = buildExtractorPrompt(transcript, contact, projectContext);
    expect(prompt).toContain("Sarah");
    expect(prompt).toContain("reconciling invoices");
  });

  it("includes project context", () => {
    const prompt = buildExtractorPrompt(transcript, contact, projectContext);
    expect(prompt).toContain("AI reconciliation tool");
    expect(prompt).toContain("CFOs");
  });

  it("asks for JSON with painPoints, topics, customerLanguage, and keyQuote", () => {
    const prompt = buildExtractorPrompt(transcript, contact, projectContext);
    expect(prompt).toContain("painPoints");
    expect(prompt).toContain("topics");
    expect(prompt).toContain("customerLanguage");
    expect(prompt).toContain("keyQuote");
    expect(prompt).toContain("JSON");
  });
});

describe("buildSynthesizerPrompt", () => {
  it("includes extraction data from all interviews", () => {
    const prompt = buildSynthesizerPrompt(extractions, {
      ideaDescription: "AI reconciliation tool",
      targetProfile: "CFOs",
      projectName: "ReconAI",
    });
    expect(prompt).toContain("Sarah Chen");
    expect(prompt).toContain("Manual reconciliation");
  });

  it("asks for summary, customerLanguage, and key evidence fields", () => {
    const prompt = buildSynthesizerPrompt(
      extractions,
      {
        ideaDescription: "AI reconciliation tool",
        targetProfile: "CFOs",
        projectName: "ReconAI",
      },
      {
        name: "Finance leader",
      }
    );
    expect(prompt).toContain("summary");
    expect(prompt).toContain("painPoints");
    expect(prompt).toContain("patterns");
    expect(prompt).toContain("customerLanguage");
    expect(prompt).toContain("keyQuotes");
    expect(prompt).toContain("saturationScore");
    expect(prompt).toContain("JSON");
  });
});
