import { buildInSandbox } from "@/lib/sandbox";
import { createGitHubRepo, pushFilesToGitHub } from "@/lib/github";
import { updatePrototypeProject } from "@/lib/prototype-status";
import { deployFilesToVercel } from "@/lib/vercel";
import { createLlm } from "@/lib/llm";
import {
  buildArchitectPrompt,
  buildUxDesignerPrompt,
  buildDeveloperPrompt,
  buildReviewerPrompt,
} from "./prompts";
import type { PrototypeState } from "./state";

let _llm: ReturnType<typeof createLlm> | null = null;

function getLlm() {
  if (!_llm) {
    _llm = createLlm();
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
  try {
    await updatePrototypeProject(projectId, { prototype_phase: phase });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
        ? error
        : "Unknown error";
    console.error(`[prototype] setPhase(${phase}) failed:`, message);
  }
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

  if (state.buildErrors) {
    throw new Error(`Prototype still has build errors:\n${state.buildErrors}`);
  }

  if (state.reviewFeedback) {
    throw new Error(
      `Prototype still has unresolved review feedback:\n${state.reviewFeedback}`
    );
  }

  // Create GitHub repo and push code
  const repoName = `anvil-prototype-${state.projectName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40)}`;

  const { repoUrl, owner } = await createGitHubRepo(repoName);
  await pushFilesToGitHub(owner, repoName, state.codeFiles!);
  const { deploymentUrl } = await deployFilesToVercel(repoName, state.codeFiles!);

  // Mark project as deployed in Supabase
  await updatePrototypeProject(state.projectId, {
    prototype_status: "deployed",
    prototype_repo_url: repoUrl,
    prototype_url: deploymentUrl,
    prototype_phase: "deployed",
  });

  return {
    githubRepoUrl: repoUrl,
    prototypeUrl: deploymentUrl,
  };
}

export async function failBuild(state: PrototypeState): Promise<never> {
  const message =
    state.buildErrors ??
    "Prototype generation exhausted its retries without producing a successful build.";
  await setPhase(state.projectId, `Error: ${message.slice(0, 180)}`);
  throw new Error(message);
}

export async function failReview(state: PrototypeState): Promise<never> {
  const message =
    state.reviewFeedback ??
    "Prototype generation exhausted its retries without satisfying the review step.";
  await setPhase(state.projectId, `Error: ${message.slice(0, 180)}`);
  throw new Error(message);
}
