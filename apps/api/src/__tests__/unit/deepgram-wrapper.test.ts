/**
 * Unit tests for the Deepgram client wrapper (apps/api/src/lib/deepgram.ts).
 *
 * Two surfaces:
 *   - getDeepgramClient(): returns an SDK client; should throw clearly
 *     if DEEPGRAM_API_KEY is missing.
 *   - createDeepgramBrowserToken(): mints a short-lived scoped key for
 *     client-side use; should throw if env vars are missing and otherwise
 *     proxy the SDK call with the right scopes/expiration.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createKey = vi.fn();

// `vi.fn().mockImplementation(...)` doesn't preserve a return value when
// invoked with `new` — JS treats the constructor's `this` as the result
// unless an explicit object is returned. Use a real class shape so
// `new DeepgramClient(...)` exposes manage.v1.projects.keys.create.
class FakeDeepgramClient {
  manage = {
    v1: {
      projects: {
        keys: { create: createKey },
      },
    },
  };
}

vi.mock("@deepgram/sdk", () => ({
  DeepgramClient: FakeDeepgramClient,
}));

beforeEach(() => {
  process.env.DEEPGRAM_API_KEY = "dg-test-key";
  process.env.DEEPGRAM_PROJECT_ID = "dg-proj-id";
  createKey.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function importDeepgram() {
  return await import("@/lib/deepgram");
}

describe("getDeepgramClient", () => {
  it("returns a DeepgramClient when DEEPGRAM_API_KEY is set", async () => {
    const { getDeepgramClient } = await importDeepgram();
    const client = getDeepgramClient();
    expect(client).toBeTruthy();
    expect(client.manage.v1.projects.keys.create).toBeDefined();
  });

  it("throws a clear error when DEEPGRAM_API_KEY is missing", async () => {
    delete process.env.DEEPGRAM_API_KEY;
    const { getDeepgramClient } = await importDeepgram();
    expect(() => getDeepgramClient()).toThrow(/DEEPGRAM_API_KEY/);
  });
});

describe("createDeepgramBrowserToken", () => {
  it("creates a scoped key with usage:write and ~1-hour expiration", async () => {
    createKey.mockResolvedValueOnce({ key: "minted-browser-token" });

    const { createDeepgramBrowserToken } = await importDeepgram();
    const before = Date.now();
    const token = await createDeepgramBrowserToken();
    const after = Date.now();

    expect(token).toBe("minted-browser-token");
    expect(createKey).toHaveBeenCalledTimes(1);

    const [projectId, opts] = createKey.mock.calls[0] as [
      string,
      { scopes: string[]; expiration_date: string; comment: string },
    ];
    expect(projectId).toBe("dg-proj-id");
    expect(opts.scopes).toEqual(["usage:write"]);
    expect(opts.comment).toMatch(/anvil/i);

    // Expiration must be ~1 hour in the future. Allow a wide window so
    // we don't flake on slow CI; the key contract is "ephemeral", not
    // "exactly 3600s".
    const exp = Date.parse(opts.expiration_date);
    expect(exp - before).toBeGreaterThanOrEqual(3590 * 1000);
    expect(exp - after).toBeLessThanOrEqual(3610 * 1000);
  });

  it("throws when DEEPGRAM_API_KEY is missing", async () => {
    delete process.env.DEEPGRAM_API_KEY;
    const { createDeepgramBrowserToken } = await importDeepgram();
    await expect(createDeepgramBrowserToken()).rejects.toThrow(
      /DEEPGRAM_API_KEY/,
    );
  });

  it("throws when DEEPGRAM_PROJECT_ID is missing", async () => {
    delete process.env.DEEPGRAM_PROJECT_ID;
    const { createDeepgramBrowserToken } = await importDeepgram();
    await expect(createDeepgramBrowserToken()).rejects.toThrow(
      /DEEPGRAM_PROJECT_ID/,
    );
  });

  it("throws a clear error when Deepgram returns no key", async () => {
    createKey.mockResolvedValueOnce({}); // no .key field

    const { createDeepgramBrowserToken } = await importDeepgram();
    await expect(createDeepgramBrowserToken()).rejects.toThrow(/no key/i);
  });

  it("propagates the Deepgram SDK error if the manage API rejects", async () => {
    createKey.mockRejectedValueOnce(new Error("deepgram quota exceeded"));

    const { createDeepgramBrowserToken } = await importDeepgram();
    await expect(createDeepgramBrowserToken()).rejects.toThrow(
      /quota exceeded/,
    );
  });
});
