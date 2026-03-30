import { after } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ChatAnthropic } from "@langchain/anthropic";
import { buildCopilotPrompt } from "@/lib/agents/copilot/prompts";
import type { Interview, Project } from "@/lib/supabase/types";

function getLlm() {
  return new ChatAnthropic({
    model: "claude-haiku-4-5-20251001",
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; interviewId: string }> }
) {
  const { id, interviewId } = await ctx.params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch interview + project in parallel
  const [interviewResult, projectResult] = await Promise.all([
    supabase.from("interviews").select("*").eq("id", interviewId).single(),
    supabase.from("projects").select("*").eq("id", id).single(),
  ]);

  const interview = interviewResult.data as Interview | null;
  const project = projectResult.data as Project | null;

  if (!interview || !project) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Count prior completed interviews for context
  const { count: priorCount } = await supabase
    .from("interviews")
    .select("id", { count: "exact", head: true })
    .eq("project_id", id)
    .eq("status", "completed");

  const prompt = buildCopilotPrompt({
    projectName: project.name,
    ideaDescription: project.idea_description,
    targetProfile: project.target_profile,
    contactName: "the interviewee",
    contactTitle: "",
    contactCompany: "",
    transcript: interview.transcript as Array<{
      speaker: string;
      text: string;
      timestamp: number;
    }>,
    priorInterviewCount: priorCount ?? 0,
  });

  // Collect full response for DB save
  const suggestionLines: string[] = [];

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await getLlm().stream(prompt);
        for await (const chunk of response) {
          const text = typeof chunk.content === "string" ? chunk.content : "";
          if (text) {
            suggestionLines.push(text);
            controller.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({ text })}\n\n`
              )
            );
          }
        }
        controller.enqueue(
          new TextEncoder().encode("data: [DONE]\n\n")
        );
        controller.close();
      } catch (err) {
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ error: String(err) })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  // Save suggestions to DB after streaming completes
  after(async () => {
    const fullText = suggestionLines.join("");
    const questions = fullText
      .split("\n")
      .filter((line) => /^\d+\./.test(line.trim()))
      .map((line) => line.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean);

    if (questions.length > 0) {
      const supabaseInner = await createServerSupabaseClient();
      await supabaseInner
        .from("interviews")
        .update({ suggested_questions: questions })
        .eq("id", interviewId);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
