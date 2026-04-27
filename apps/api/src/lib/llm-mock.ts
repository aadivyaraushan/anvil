import type { LlmLike } from "./llm";

import extractorFixture from "./llm-mock-fixtures/extractor.json";
import synthesizerFixture from "./llm-mock-fixtures/synthesizer.json";
import proposeArchetypesFixture from "./llm-mock-fixtures/propose-archetypes.json";

const COPILOT_FIXTURE = [
  "1. You mentioned closing the books takes three days — walk me through what specifically eats that time.",
  "2. When the close runs long, who else gets blocked, and what do they end up doing instead?",
  "3. You said you check four different dashboards — which one would you give up last, and why?",
  "4. Have you tried any tool to consolidate this before? What made you stop using it?",
  "5. If a system shaved a day off your close, where would you reinvest that time first?",
].join("\n");

function pickFixture(prompt: string): string {
  if (
    prompt.startsWith(
      "You are helping a founder understand who they are talking to",
    )
  ) {
    return JSON.stringify(proposeArchetypesFixture);
  }
  if (prompt.startsWith("You are helping a founder map out their customer base")) {
    return JSON.stringify(proposeArchetypesFixture);
  }
  if (prompt.startsWith("You are analyzing a user research interview")) {
    return JSON.stringify(extractorFixture);
  }
  if (prompt.startsWith("You are synthesizing")) {
    return JSON.stringify(synthesizerFixture);
  }
  if (prompt.startsWith("You are an interview copilot")) {
    return COPILOT_FIXTURE;
  }
  return "{}";
}

export class MockLlm implements LlmLike {
  async invoke(prompt: string): Promise<{ content: unknown }> {
    return { content: pickFixture(prompt) };
  }

  async stream(prompt: string): Promise<AsyncIterable<{ content: unknown }>> {
    const fixture = pickFixture(prompt);
    return {
      async *[Symbol.asyncIterator]() {
        for (let i = 0; i < fixture.length; i += 16) {
          yield { content: fixture.slice(i, i + 16) };
        }
      },
    };
  }
}
