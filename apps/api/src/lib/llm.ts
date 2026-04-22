import { ChatOpenAI } from "@langchain/openai";

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

export function createLlm() {
  return new ChatOpenAI({
    model: process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
    apiKey: process.env.OPENAI_API_KEY,
  });
}
