import { describe, it, expect, vi, beforeEach } from "vitest";

describe("createGitHubRepo", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.GITHUB_TOKEN = "test-token";
  });

  it("returns repoUrl, cloneUrl, owner on success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        html_url: "https://github.com/testuser/test-repo",
        clone_url: "https://github.com/testuser/test-repo.git",
        owner: { login: "testuser" },
      }),
    } as Response);

    const { createGitHubRepo } = await import("@/lib/github");
    const result = await createGitHubRepo("test-repo");
    expect(result.repoUrl).toBe("https://github.com/testuser/test-repo");
    expect(result.owner).toBe("testuser");
  });

  it("retries with timestamp suffix on 422", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: false, status: 422, text: async () => "already exists" } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          html_url: "https://github.com/testuser/test-repo-123",
          clone_url: "https://github.com/testuser/test-repo-123.git",
          owner: { login: "testuser" },
        }),
      } as Response);

    const { createGitHubRepo } = await import("@/lib/github");
    const result = await createGitHubRepo("test-repo");
    expect(result.repoUrl).toContain("test-repo");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("throws on non-422 errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    } as Response);

    const { createGitHubRepo } = await import("@/lib/github");
    await expect(createGitHubRepo("test-repo")).rejects.toThrow("GitHub createRepo failed");
  });
});

describe("pushFilesToGitHub", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.GITHUB_TOKEN = "test-token";
  });

  it("calls blobs, trees, commits, and refs endpoints in order", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sha: "blob-sha-1" }) } as Response) // blob 1
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sha: "blob-sha-2" }) } as Response) // blob 2
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sha: "tree-sha" }) } as Response)   // tree
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sha: "commit-sha" }) } as Response) // commit
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ref: "refs/heads/main" }) } as Response); // ref

    const { pushFilesToGitHub } = await import("@/lib/github");
    await pushFilesToGitHub("testuser", "test-repo", {
      "src/index.ts": "export default {}",
      "package.json": "{}",
    });

    const urls = vi.mocked(fetch).mock.calls.map((c) => (c[0] as string).toString());
    expect(urls.some((u) => u.includes("/git/blobs"))).toBe(true);
    expect(urls.some((u) => u.includes("/git/trees"))).toBe(true);
    expect(urls.some((u) => u.includes("/git/commits"))).toBe(true);
    expect(urls.some((u) => u.includes("/git/refs"))).toBe(true);
  });
});
