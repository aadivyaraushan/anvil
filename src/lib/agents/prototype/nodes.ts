import { ChatAnthropic } from "@langchain/anthropic";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildInSandbox } from "@/lib/sandbox";
import { createGitHubRepo, pushFilesToGitHub } from "@/lib/github";
import {
  buildArchitectPrompt,
  buildUxDesignerPrompt,
  buildDeveloperPrompt,
  buildReviewerPrompt,
} from "./prompts";
import type { PrototypeState } from "./state";

let _llm: ChatAnthropic | null = null;

function getLlm(): ChatAnthropic {
  if (!_llm) {
    _llm = new ChatAnthropic({
      model: "claude-sonnet-4-6",
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return _llm;
}

function parseJson(text: string): unknown {
  // Strip markdown code fences if present
  const stripped = text
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
  const match = stripped.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match)
    throw new Error(`No JSON found in LLM response: ${text.slice(0, 200)}`);
  return JSON.parse(match[0]);
}

async function setPhase(projectId: string, phase: string): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase
    .from("projects")
    .update({ prototype_phase: phase })
    .eq("id", projectId);
}

// ── Node 1: architect ────────────────────────────────────────────────────────

export async function architect(
  state: PrototypeState
): Promise<Partial<PrototypeState>> {
  await setPhase(state.projectId, "architect");

  const response = await getLlm().invoke(
    buildArchitectPrompt(state.ideaDescription, state.targetProfile)
  );

  // Response should be JSON — store as string for portability
  const text =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);
  // Validate it's parseable JSON
  parseJson(text);

  return { architectSpec: text };
}

// ── Node 2: uxDesigner ───────────────────────────────────────────────────────

export async function uxDesigner(
  state: PrototypeState
): Promise<Partial<PrototypeState>> {
  await setPhase(state.projectId, "ux-designer");

  const response = await getLlm().invoke(
    buildUxDesignerPrompt(state.architectSpec!)
  );

  const text =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);
  return { designBrief: text };
}

// ── Node 3: developer ────────────────────────────────────────────────────────

export async function developer(
  state: PrototypeState
): Promise<Partial<PrototypeState>> {
  await setPhase(state.projectId, "developer");

  const feedbackToInclude = state.buildErrors ?? state.reviewFeedback;

  const response = await getLlm().invoke(
    buildDeveloperPrompt(
      state.architectSpec!,
      state.designBrief!,
      feedbackToInclude
    )
  );

  const text =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);
  const parsed = parseJson(text) as {
    files: Array<{ path: string; content: string }>;
  };

  const codeFiles: Record<string, string> = {};
  for (const { path, content } of parsed.files) {
    codeFiles[path] = content;
  }

  return {
    codeFiles,
    buildErrors: null, // clear previous errors
    reviewRounds: state.reviewRounds + 1,
  };
}

// ── Node 4: buildAndVerify ───────────────────────────────────────────────────

export async function buildAndVerify(
  state: PrototypeState
): Promise<Partial<PrototypeState>> {
  await setPhase(state.projectId, "building");

  const result = await buildInSandbox(state.codeFiles!);

  if (!result.success) {
    return { buildErrors: result.errors };
  }

  return { buildErrors: null };
}

// ── Node 5: reviewer ────────────────────────────────────────────────────────

export async function reviewer(
  state: PrototypeState
): Promise<Partial<PrototypeState>> {
  await setPhase(state.projectId, "reviewer");

  const codeFilesStr = JSON.stringify(
    Object.entries(state.codeFiles!).map(([path, content]) => ({
      path,
      content: content.slice(0, 500), // summarize for reviewer
    }))
  );

  const response = await getLlm().invoke(
    buildReviewerPrompt(state.architectSpec!, state.designBrief!, codeFilesStr)
  );

  const text = (
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content)
  ).trim();
  const feedback = text === "APPROVED" ? null : text;

  return { reviewFeedback: feedback };
}

// ── Node 6: deploy ───────────────────────────────────────────────────────────

export async function deploy(
  state: PrototypeState
): Promise<Partial<PrototypeState>> {
  await setPhase(state.projectId, "deploying");

  // Create GitHub repo and push code
  const repoName = `anvil-prototype-${state.projectName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40)}`;

  const { repoUrl, owner } = await createGitHubRepo(repoName);
  await pushFilesToGitHub(owner, repoName, state.codeFiles!);

  // Mark project as deployed in Supabase
  const supabase = await createServerSupabaseClient();
  await supabase
    .from("projects")
    .update({
      prototype_status: "deployed",
      prototype_repo_url: repoUrl,
      prototype_url: repoUrl, // GitHub URL as the prototype URL (Vercel deploy is separate)
      prototype_phase: "deployed",
    })
    .eq("id", state.projectId);

  return {
    githubRepoUrl: repoUrl,
    prototypeUrl: repoUrl,
  };
}
