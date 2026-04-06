import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
const buildInSandboxMock = vi.fn();
const createGitHubRepoMock = vi.fn();
const pushFilesToGitHubMock = vi.fn();
const deployFilesToVercelMock = vi.fn();
const supabaseEqMock = vi.fn();
const supabaseUpdateMock = vi.fn();
const supabaseFromMock = vi.fn();

vi.mock("@/lib/llm", () => ({
  createLlm: vi.fn().mockReturnValue({
    invoke: invokeMock,
  }),
}));

vi.mock("@/lib/sandbox", () => ({
  buildInSandbox: buildInSandboxMock,
}));

vi.mock("@/lib/github", () => ({
  createGitHubRepo: createGitHubRepoMock,
  pushFilesToGitHub: pushFilesToGitHubMock,
}));

vi.mock("@/lib/vercel", () => ({
  deployFilesToVercel: deployFilesToVercelMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockImplementation(async () => ({
    from: supabaseFromMock,
  })),
}));

const initialState = {
  projectId: "proj-workflow",
  ideaDescription: "Create a lightweight AI prototype workspace",
  targetProfile: "Startup founders",
  projectName: "ProtoFlow",
  architectSpec: null,
  designBrief: null,
  codeFiles: null,
  buildErrors: null,
  reviewFeedback: null,
  reviewRounds: 0,
  githubRepoUrl: null,
  prototypeUrl: null,
};

describe("prototype workflow graph", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    supabaseEqMock.mockResolvedValue({ error: null });
    supabaseUpdateMock.mockReturnValue({ eq: supabaseEqMock });
    supabaseFromMock.mockReturnValue({ update: supabaseUpdateMock });

    createGitHubRepoMock.mockResolvedValue({
      repoUrl: "https://github.com/test/protoflow",
      cloneUrl: "https://github.com/test/protoflow.git",
      owner: "test",
    });
    pushFilesToGitHubMock.mockResolvedValue(undefined);
    deployFilesToVercelMock.mockResolvedValue({
      deploymentId: "dpl_protoflow",
      deploymentUrl: "https://protoflow.vercel.app",
    });
  });

  it("retries after build and review failures, then deploys a live prototype", async () => {
    invokeMock
      .mockResolvedValueOnce({
        content:
          '{"appName":"ProtoFlow","tagline":"AI workspace","pages":[{"name":"Home","route":"/","purpose":"landing","components":["Hero"]}],"features":["dashboard"],"mockData":{"description":"mock data","example":{"name":"Acme"}},"colorScheme":"light","techNotes":"Use App Router"}',
      })
      .mockResolvedValueOnce({
        content:
          "Use slate backgrounds, bold headings, and card-based layout with clear CTAs.",
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          files: [
            {
              path: "package.json",
              content: '{"name":"prototype","version":"0.1.0"}',
            },
            {
              path: "src/app/page.tsx",
              content: "export default function Page(){return <div>broken</div>}",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          files: [
            {
              path: "package.json",
              content: '{"name":"prototype","version":"0.1.0"}',
            },
            {
              path: "src/app/page.tsx",
              content: "export default function Page(){return <main>fixed build</main>}",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        content: "1. src/app/page.tsx should include a stronger hero and clearer metrics.",
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          files: [
            {
              path: "package.json",
              content: '{"name":"prototype","version":"0.1.0"}',
            },
            {
              path: "src/app/page.tsx",
              content:
                "export default function Page(){return <main><section>clear hero</section><section>metrics</section></main>}",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        content: "APPROVED",
      });

    buildInSandboxMock
      .mockResolvedValueOnce({
        success: false,
        errors: "next build failed:\nType error in src/app/page.tsx",
      })
      .mockResolvedValueOnce({
        success: true,
      })
      .mockResolvedValueOnce({
        success: true,
      });

    const { buildPrototypeGraph } = await import("@/lib/agents/prototype/graph");

    const result = await buildPrototypeGraph().invoke(initialState);

    expect(buildInSandboxMock).toHaveBeenCalledTimes(3);
    expect(invokeMock).toHaveBeenCalledTimes(7);
    expect(createGitHubRepoMock).toHaveBeenCalledOnce();
    expect(pushFilesToGitHubMock).toHaveBeenCalledOnce();
    expect(deployFilesToVercelMock).toHaveBeenCalledOnce();
    expect(result.buildErrors).toBeNull();
    expect(result.reviewFeedback).toBeNull();
    expect(result.reviewRounds).toBe(3);
    expect(result.githubRepoUrl).toBe("https://github.com/test/protoflow");
    expect(result.prototypeUrl).toBe("https://protoflow.vercel.app");
  });

  it("stops and never deploys after exhausting build retries", async () => {
    invokeMock
      .mockResolvedValueOnce({
        content:
          '{"appName":"ProtoFlow","tagline":"AI workspace","pages":[{"name":"Home","route":"/","purpose":"landing","components":["Hero"]}],"features":["dashboard"],"mockData":{"description":"mock data","example":{"name":"Acme"}},"colorScheme":"light","techNotes":"Use App Router"}',
      })
      .mockResolvedValueOnce({
        content: "Minimal clean UI brief.",
      })
      .mockResolvedValue({
        content: JSON.stringify({
          files: [
            {
              path: "package.json",
              content: '{"name":"prototype","version":"0.1.0"}',
            },
            {
              path: "src/app/page.tsx",
              content: "export default function Page(){return <div>still broken</div>}",
            },
          ],
        }),
      });

    buildInSandboxMock.mockResolvedValue({
      success: false,
      errors: "next build failed:\nCannot find module './missing'",
    });

    const { buildPrototypeGraph } = await import("@/lib/agents/prototype/graph");

    await expect(buildPrototypeGraph().invoke(initialState)).rejects.toThrow(
      "Cannot find module './missing'"
    );

    expect(buildInSandboxMock).toHaveBeenCalledTimes(3);
    expect(createGitHubRepoMock).not.toHaveBeenCalled();
    expect(pushFilesToGitHubMock).not.toHaveBeenCalled();
    expect(deployFilesToVercelMock).not.toHaveBeenCalled();
  });
});
