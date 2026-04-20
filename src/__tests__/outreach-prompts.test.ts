import { describe, expect, it } from "vitest";
import {
  buildResearchBriefPrompt,
  buildFitScorePrompt,
  buildEmailDraftPrompt,
  buildQualityCheckPrompt,
} from "@/lib/agents/outreach/prompts";

describe("buildResearchBriefPrompt", () => {
  it("includes contact name, company, and imported payload", () => {
    const prompt = buildResearchBriefPrompt({
      firstName: "Sarah",
      lastName: "Chen",
      company: "FinFlow",
      title: "CFO",
      sourcePayload: {
        headline: "CFO at FinFlow",
        bio: "Previously led finance at Stripe.",
      },
    });
    expect(prompt).toContain("Sarah Chen");
    expect(prompt).toContain("FinFlow");
    expect(prompt).toContain("Previously led finance at Stripe");
    expect(prompt).toContain("profile_summary");
    expect(prompt).toContain("talking_points");
  });
});

describe("buildFitScorePrompt", () => {
  it("includes target profile, archetypes, and research brief", () => {
    const prompt = buildFitScorePrompt({
      targetProfile: "CFOs at fintech companies",
      ideaDescription: "AI-powered reconciliation tool",
      personas: [
        {
          name: "Finance leader",
          description: "Owns close and reporting",
          pain_points: ["Manual reconciliation"],
        },
      ],
      firstName: "Sarah",
      lastName: "Chen",
      title: "CFO",
      company: "FinFlow",
      researchBrief: {
        profile_summary: "Fintech lender",
        relevant_signals: ["Finance leader"],
      },
    });
    expect(prompt).toContain("CFOs at fintech companies");
    expect(prompt).toContain("AI-powered reconciliation tool");
    expect(prompt).toContain("Finance leader");
    expect(prompt).toContain("bestArchetype");
  });
});

describe("buildEmailDraftPrompt", () => {
  it("includes sender name and persona context", () => {
    const prompt = buildEmailDraftPrompt({
      senderName: "Alice",
      ideaDescription: "AI reconciliation tool for fintech",
      firstName: "Sarah",
      company: "FinFlow",
      personaName: "Finance leader",
      researchBrief: {
        profile_summary: "SMB lending",
        talking_points: ["Manual reconciliation pain", "Series A growth"],
      },
    });
    expect(prompt).toContain("Alice");
    expect(prompt).toContain("Sarah");
    expect(prompt).toContain("FinFlow");
    expect(prompt).toContain("Finance leader");
    expect(prompt).toContain("150 words");
  });
});

describe("buildQualityCheckPrompt", () => {
  it("includes the email draft and criteria", () => {
    const prompt = buildQualityCheckPrompt("Hi Sarah, I noticed...");
    expect(prompt).toContain("Hi Sarah, I noticed...");
    expect(prompt).toContain("salesy");
    expect(prompt).toContain("150 words");
  });
});
