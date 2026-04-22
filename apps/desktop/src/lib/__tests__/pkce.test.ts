import { describe, it, expect } from "vitest";
import { generateCodeVerifier, generateCodeChallenge, generateState } from "@/lib/pkce";

describe("generateCodeVerifier", () => {
  it("returns a string of at least 43 characters (RFC 7636 minimum)", () => {
    const verifier = generateCodeVerifier();
    expect(typeof verifier).toBe("string");
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });

  it("only contains base64url-safe characters", () => {
    const verifier = generateCodeVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it("returns distinct values on consecutive calls", () => {
    const a = generateCodeVerifier();
    const b = generateCodeVerifier();
    expect(a).not.toBe(b);
  });
});

describe("generateCodeChallenge", () => {
  it("returns a non-empty base64url string", async () => {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    expect(typeof challenge).toBe("string");
    expect(challenge.length).toBeGreaterThan(0);
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it("is deterministic for the same verifier", async () => {
    const verifier = generateCodeVerifier();
    const [c1, c2] = await Promise.all([
      generateCodeChallenge(verifier),
      generateCodeChallenge(verifier),
    ]);
    expect(c1).toBe(c2);
  });

  it("produces different challenges for different verifiers", async () => {
    const [c1, c2] = await Promise.all([
      generateCodeChallenge(generateCodeVerifier()),
      generateCodeChallenge(generateCodeVerifier()),
    ]);
    expect(c1).not.toBe(c2);
  });

  it("returns a 43-character SHA-256 base64url string", async () => {
    // SHA-256 = 32 bytes → 43 base64url chars (no padding)
    const challenge = await generateCodeChallenge(generateCodeVerifier());
    expect(challenge.length).toBe(43);
  });
});

describe("generateState", () => {
  it("returns a non-empty string", () => {
    const state = generateState();
    expect(typeof state).toBe("string");
    expect(state.length).toBeGreaterThan(0);
  });

  it("only contains base64url-safe characters", () => {
    expect(generateState()).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it("returns distinct values on each call", () => {
    const values = Array.from({ length: 10 }, generateState);
    const unique = new Set(values);
    expect(unique.size).toBe(10);
  });
});
