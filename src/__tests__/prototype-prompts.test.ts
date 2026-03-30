import { describe, it, expect } from "vitest";
import {
  buildArchitectPrompt,
  buildUxDesignerPrompt,
  buildDeveloperPrompt,
  buildReviewerPrompt,
} from "@/lib/agents/prototype/prompts";

const idea = "AI-powered reconciliation tool for fintech CFOs";
const target = "CFOs at fintech companies";
const spec = JSON.stringify({
  appName: "ReconAI",
  pages: [{ name: "Landing", purpose: "hero + CTA" }],
  features: ["monthly reconciliation dashboard", "AI suggestions"],
});
const design = "Dark theme, zinc palette, Inter font, card-based dashboard.";

describe("buildArchitectPrompt", () => {
  it("includes the idea description", () => {
    const p = buildArchitectPrompt(idea, target);
    expect(p).toContain(idea);
    expect(p).toContain(target);
  });

  it("asks for JSON output with pages and features", () => {
    const p = buildArchitectPrompt(idea, target);
    expect(p).toContain("JSON");
    expect(p).toContain("pages");
    expect(p).toContain("features");
  });
});

describe("buildUxDesignerPrompt", () => {
  it("includes the architect spec", () => {
    const p = buildUxDesignerPrompt(spec);
    expect(p).toContain("ReconAI");
  });

  it("asks for design guidance", () => {
    const p = buildUxDesignerPrompt(spec);
    expect(p.toLowerCase()).toMatch(/color|theme|palette/);
  });
});

describe("buildDeveloperPrompt", () => {
  it("includes spec and design brief", () => {
    const p = buildDeveloperPrompt(spec, design, null);
    expect(p).toContain("ReconAI");
    expect(p).toContain("Dark theme");
  });

  it("includes error feedback when provided", () => {
    const p = buildDeveloperPrompt(spec, design, "Module not found: xyz");
    expect(p).toContain("Module not found");
  });

  it("asks for JSON files output", () => {
    const p = buildDeveloperPrompt(spec, design, null);
    expect(p).toContain("files");
    expect(p).toContain("path");
    expect(p).toContain("content");
  });
});

describe("buildReviewerPrompt", () => {
  it("includes spec and design brief", () => {
    const p = buildReviewerPrompt(spec, design, '{"files":[]}');
    expect(p).toContain("ReconAI");
    expect(p).toContain("Dark theme");
  });

  it("asks to review and return null if approved", () => {
    const p = buildReviewerPrompt(spec, design, '{"files":[]}');
    expect(p.toLowerCase()).toMatch(/review|approve|feedback/);
  });
});
