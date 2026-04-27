export async function GET() {
  return Response.json({
    ok: true,
    ts: Date.now(),
    llmMode: process.env.ANVIL_LLM_MODE ?? "live",
  });
}
