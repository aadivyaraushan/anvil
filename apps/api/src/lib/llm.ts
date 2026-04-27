import { ChatOpenAI } from "@langchain/openai";

import { MockLlm } from "./llm-mock";

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

export interface LlmLike {
  invoke(prompt: string): Promise<{ content: unknown }>;
  stream(prompt: string): Promise<AsyncIterable<{ content: unknown }>>;
}

export function createLlm(): LlmLike {
  if (process.env.ANVIL_LLM_MODE === "mock") {
    return new MockLlm();
  }
  return new ChatOpenAI({
    model: process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
    apiKey: process.env.OPENAI_API_KEY,
  }) as unknown as LlmLike;
}
