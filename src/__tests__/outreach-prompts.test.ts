import { describe, it, expect } from "vitest";
import {
  buildApolloParamsPrompt,
  buildResearchBriefPrompt,
  buildFitScorePrompt,
  buildEmailDraftPrompt,
  buildQualityCheckPrompt,
} from "@/lib/agents/outreach/prompts";

describe("buildApolloParamsPrompt", () => {
  it("includes target profile in the prompt", () => {
    const prompt = buildApolloParamsPrompt("CTOs at B2B SaaS companies");
    expect(prompt).toContain("CTOs at B2B SaaS companies");
    expect(prompt).toContain("jobTitles");
    expect(prompt).toContain("seniorityLevels");
    expect(prompt).toContain("keywords");
  });
});

describe("buildResearchBriefPrompt", () => {
  it("includes contact name, company, and search results", () => {
    const prompt = buildResearchBriefPrompt({
      firstName: "Sarah",
      lastName: "Chen",
      company: "FinFlow",
      title: "CFO",
      companySearchResult: "FinFlow raised $10M Series A.",
      personSearchResult: "Sarah Chen previously led finance at Stripe.",
    });
    expect(prompt).toContain("Sarah Chen");
    expect(prompt).toContain("FinFlow");
    expect(prompt).toContain("FinFlow raised $10M");
    expect(prompt).toContain("Sarah Chen previously led finance");
    expect(prompt).toContain("company_summary");
    expect(prompt).toContain("talking_points");
  });
});

describe("buildFitScorePrompt", () => {
  it("includes target profile and research brief", () => {
    const prompt = buildFitScorePrompt({
      targetProfile: "CFOs at fintech companies",
      ideaDescription: "AI-powered reconciliation tool",
      firstName: "Sarah",
      lastName: "Chen",
      title: "CFO",
      company: "FinFlow",
      researchBrief: { company_summary: "Fintech lender", person_summary: "Finance leader" },
    });
    expect(prompt).toContain("CFOs at fintech companies");
    expect(prompt).toContain("AI-powered reconciliation tool");
    expect(prompt).toContain("score");
  });
});

describe("buildEmailDraftPrompt", () => {
  it("includes sender name and talking points", () => {
    const prompt = buildEmailDraftPrompt({
      senderName: "Alice",
      ideaDescription: "AI reconciliation tool for fintech",
      firstName: "Sarah",
      company: "FinFlow",
      researchBrief: {
        company_summary: "SMB lending",
        person_summary: "Former Stripe finance lead",
        recent_news: "Raised $10M",
        talking_points: ["Manual reconciliation pain", "Series A growth"],
      },
    });
    expect(prompt).toContain("Alice");
    expect(prompt).toContain("Sarah");
    expect(prompt).toContain("FinFlow");
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
