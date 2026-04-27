import { describe, expect, it } from "vitest";

import { MockLlm } from "@/lib/llm-mock";
import { createLlm } from "@/lib/llm";
import {
  buildExtractorPrompt,
  buildSynthesizerPrompt,
  buildProposeArchetypesPrompt,
  buildArchetypePrompt,
} from "@/lib/agents/analyst/prompts";
import { buildCopilotPrompt } from "@/lib/agents/copilot/prompts";

describe("MockLlm — fixture dispatch by prompt prefix", () => {
  const mock = new MockLlm();

  it("invoke() returns extractor JSON for the extractor prompt", async () => {
    const prompt = buildExtractorPrompt(
      [
        { speaker: "S0", text: "Tell me about your week.", timestamp: 0 },
        { speaker: "S1", text: "It was busy.", timestamp: 1000 },
      ],
      { name: "Alice", title: "PM", company: "Acme" },
      { ideaDescription: "x", targetProfile: "y" },
    );
    const res = await mock.invoke(prompt);
    expect(typeof res.content).toBe("string");
    const parsed = JSON.parse(res.content as string);
    expect(parsed).toHaveProperty("painPoints");
    expect(parsed).toHaveProperty("topics");
    expect(parsed).toHaveProperty("customerLanguage");
    expect(parsed).toHaveProperty("keyQuote");
  });

  it("invoke() returns synthesizer JSON for the synthesizer prompt", async () => {
    const prompt = buildSynthesizerPrompt(
      [
        {
          interviewId: "i1",
          contactId: "",
          personaId: null,
          contactName: "Alice",
          contactTitle: "PM",
          company: "Acme",
          painPoints: [],
          topics: [],
          customerLanguage: [],
          keyQuote: "",
        },
      ],
      { ideaDescription: "x", targetProfile: "y", projectName: "P" },
    );
    const res = await mock.invoke(prompt);
    const parsed = JSON.parse(res.content as string);
    expect(parsed).toHaveProperty("summary");
    expect(parsed).toHaveProperty("painPoints");
    expect(parsed).toHaveProperty("patterns");
    expect(parsed).toHaveProperty("keyQuotes");
    expect(parsed).toHaveProperty("recommendations");
    expect(typeof parsed.saturationScore).toBe("number");
  });

  it("invoke() returns archetype array for both archetype prompts", async () => {
    const proposePrompt = buildProposeArchetypesPrompt("idea", "profile", "summary");
    const archetypePrompt = buildArchetypePrompt("idea", "profile");

    for (const prompt of [proposePrompt, archetypePrompt]) {
      const res = await mock.invoke(prompt);
      const parsed = JSON.parse(res.content as string);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
      expect(parsed[0]).toHaveProperty("name");
      expect(parsed[0]).toHaveProperty("description");
      expect(parsed[0]).toHaveProperty("job_titles");
      expect(parsed[0]).toHaveProperty("pain_points");
    }
  });

  it("stream() yields the copilot fixture as numbered list chunks", async () => {
    const prompt = buildCopilotPrompt({
      projectName: "P",
      ideaDescription: "x",
      targetProfile: "y",
      contactName: "Alice",
      contactTitle: "PM",
      contactCompany: "Acme",
      transcript: [{ speaker: "S0", text: "Hi", timestamp: 0 }],
      priorInterviewCount: 0,
    });
    const stream = await mock.stream(prompt);
    let acc = "";
    for await (const chunk of stream) {
      expect(typeof chunk.content).toBe("string");
      acc += chunk.content as string;
    }
    // Must contain at least one numbered question
    expect(acc).toMatch(/^\d+\./m);
    const numbered = acc.split("\n").filter((l) => /^\d+\./.test(l.trim()));
    expect(numbered.length).toBeGreaterThanOrEqual(3);
  });
});

describe("createLlm() honors ANVIL_LLM_MODE=mock", () => {
  it("returns a MockLlm instance when ANVIL_LLM_MODE=mock", () => {
    const original = process.env.ANVIL_LLM_MODE;
    process.env.ANVIL_LLM_MODE = "mock";
    try {
      const llm = createLlm();
      expect(llm).toBeInstanceOf(MockLlm);
    } finally {
      if (original === undefined) {
        delete process.env.ANVIL_LLM_MODE;
      } else {
        process.env.ANVIL_LLM_MODE = original;
      }
    }
  });
});
