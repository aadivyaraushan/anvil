import { DeepgramClient } from "@deepgram/sdk";

export async function createDeepgramBrowserToken(): Promise<string> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  const projectId = process.env.DEEPGRAM_PROJECT_ID;
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY is not set");
  if (!projectId) throw new Error("DEEPGRAM_PROJECT_ID is not set");

  const deepgram = new DeepgramClient({ apiKey });
  const result = await deepgram.manage.v1.projects.keys.create(projectId, {
    comment: "Anvil interview transcription",
    scopes: ["usage:write"],
    expiration_date: new Date(Date.now() + 3600 * 1000).toISOString(),
  });

  if (!result?.key) throw new Error("Deepgram returned no key");
  return result.key;
}
