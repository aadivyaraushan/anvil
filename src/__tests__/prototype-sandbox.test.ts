import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @vercel/sandbox before importing sandbox.ts
const mockStop = vi.fn().mockResolvedValue(undefined);
const mockOutput = vi.fn().mockResolvedValue("build output");
const mockRunCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: mockOutput });
const mockWriteFiles = vi.fn().mockResolvedValue(undefined);
const mockCreate = vi.fn().mockResolvedValue({
  writeFiles: mockWriteFiles,
  runCommand: mockRunCommand,
  stop: mockStop,
});

vi.mock("@vercel/sandbox", () => ({
  Sandbox: { create: mockCreate },
}));

describe("buildInSandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunCommand.mockResolvedValue({ exitCode: 0, output: mockOutput });
  });

  it("returns success when both npm install and next build succeed", async () => {
    const { buildInSandbox } = await import("@/lib/sandbox");
    const result = await buildInSandbox({ "package.json": '{"name":"test"}' });
    expect(result.success).toBe(true);
  });

  it("returns failure with errors when npm install fails", async () => {
    mockRunCommand.mockResolvedValueOnce({ exitCode: 1, output: vi.fn().mockResolvedValue("ERESOLVE") });
    const { buildInSandbox } = await import("@/lib/sandbox");
    const result = await buildInSandbox({ "package.json": '{"name":"test"}' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors).toContain("npm install failed");
  });

  it("returns failure with errors when next build fails", async () => {
    mockRunCommand
      .mockResolvedValueOnce({ exitCode: 0, output: mockOutput }) // npm install ok
      .mockResolvedValueOnce({ exitCode: 1, output: vi.fn().mockResolvedValue("Type error") }); // build fails
    const { buildInSandbox } = await import("@/lib/sandbox");
    const result = await buildInSandbox({ "package.json": '{"name":"test"}' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors).toContain("next build failed");
  });

  it("always calls sandbox.stop() even when build fails", async () => {
    mockRunCommand.mockResolvedValueOnce({ exitCode: 1, output: vi.fn().mockResolvedValue("error") });
    const { buildInSandbox } = await import("@/lib/sandbox");
    await buildInSandbox({ "package.json": '{"name":"test"}' });
    expect(mockStop).toHaveBeenCalledOnce();
  });

  it("writes files to sandbox before running commands", async () => {
    const { buildInSandbox } = await import("@/lib/sandbox");
    const files = { "package.json": '{"name":"test"}', "src/app/page.tsx": "export default () => <div/>" };
    await buildInSandbox(files);
    expect(mockWriteFiles).toHaveBeenCalledOnce();
    const writtenFiles = mockWriteFiles.mock.calls[0][0] as Array<{ path: string; content: Buffer }>;
    expect(writtenFiles).toHaveLength(2);
    expect(writtenFiles.map((f) => f.path)).toContain("package.json");
  });
});
