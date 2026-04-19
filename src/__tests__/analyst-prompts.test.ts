import { describe, it, expect } from "vitest";
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
    contactName: "Sarah Chen",
    contactTitle: "CFO",
    company: "FinFlow",
    painPoints: [{ description: "Manual reconciliation", severity: "high", quote: "20 hours per person" }],
    topics: ["reconciliation", "time"],
    keyQuote: "At least 20 hours per person. It's killing us.",
  },
];

describe("buildExtractorPrompt", () => {
  it("includes interviewer and interviewee turns", () => {
    const p = buildExtractorPrompt(transcript, contact, projectContext);
    expect(p).toContain("Sarah");
    expect(p).toContain("reconciling invoices");
  });

  it("includes project context", () => {
    const p = buildExtractorPrompt(transcript, contact, projectContext);
    expect(p).toContain("AI reconciliation tool");
    expect(p).toContain("CFOs");
  });

  it("asks for JSON with painPoints, topics, keyQuote", () => {
    const p = buildExtractorPrompt(transcript, contact, projectContext);
    expect(p).toContain("painPoints");
    expect(p).toContain("topics");
    expect(p).toContain("keyQuote");
    expect(p).toContain("JSON");
  });
});

describe("buildSynthesizerPrompt", () => {
  it("includes extraction data from all interviews", () => {
    const p = buildSynthesizerPrompt(extractions, {
      ideaDescription: "AI reconciliation tool",
      targetProfile: "CFOs",
      projectName: "ReconAI",
    });
    expect(p).toContain("Sarah Chen");
    expect(p).toContain("Manual reconciliation");
  });

  it("asks for summary, painPoints, patterns, keyQuotes, saturationScore", () => {
    const p = buildSynthesizerPrompt(extractions, {
      ideaDescription: "AI reconciliation tool",
      targetProfile: "CFOs",
      projectName: "ReconAI",
    });
    expect(p).toContain("summary");
    expect(p).toContain("painPoints");
    expect(p).toContain("patterns");
    expect(p).toContain("keyQuotes");
    expect(p).toContain("saturationScore");
    expect(p).toContain("JSON");
  });

  it("includes interview count in context", () => {
    const p = buildSynthesizerPrompt(extractions, {
      ideaDescription: "AI reconciliation tool",
      targetProfile: "CFOs",
      projectName: "ReconAI",
    });
    expect(p).toContain("1");
  });
});
