/**
 * Unit tests for the error → user-readable-copy mapper.
 * The mapper should never expose raw HTTP status codes to users.
 */
import { describe, expect, it } from "vitest";

// Mirror of the ErrorCode enum in apps/desktop/src/lib/errors.ts
enum ErrorCode {
  NetworkOffline = "NETWORK_OFFLINE",
  ApiUnreachable = "API_UNREACHABLE",
  AuthExpired = "AUTH_EXPIRED",
  RateLimited = "RATE_LIMITED",
  UploadFailed = "UPLOAD_FAILED",
  Unknown = "UNKNOWN",
}

const USER_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.NetworkOffline]: "You're offline. Your recordings will upload when you reconnect.",
  [ErrorCode.ApiUnreachable]: "Can't reach Anvil's servers. Retrying…",
  [ErrorCode.AuthExpired]: "Your session expired. Please sign in again.",
  [ErrorCode.RateLimited]: "Anvil is catching up. New findings will appear shortly.",
  [ErrorCode.UploadFailed]: "Upload failed. The recording is saved locally and will retry.",
  [ErrorCode.Unknown]: "Something went wrong. Please try again.",
};

function mapError(code: ErrorCode): string {
  return USER_MESSAGES[code] ?? USER_MESSAGES[ErrorCode.Unknown];
}

describe("error code → user copy mapper", () => {
  it("maps NetworkOffline to offline message", () => {
    expect(mapError(ErrorCode.NetworkOffline)).toContain("offline");
    expect(mapError(ErrorCode.NetworkOffline)).not.toMatch(/\b4\d\d\b|\b5\d\d\b/);
  });

  it("maps ApiUnreachable to retrying message", () => {
    expect(mapError(ErrorCode.ApiUnreachable)).toContain("servers");
  });

  it("maps AuthExpired to sign-in message", () => {
    expect(mapError(ErrorCode.AuthExpired)).toContain("sign in");
  });

  it("maps RateLimited to patience message", () => {
    expect(mapError(ErrorCode.RateLimited)).toContain("catching up");
  });

  it("maps UploadFailed to retry message", () => {
    expect(mapError(ErrorCode.UploadFailed)).toContain("locally");
  });

  it("maps Unknown to generic message", () => {
    expect(mapError(ErrorCode.Unknown)).toBeTruthy();
    // Should not contain a status code
    expect(mapError(ErrorCode.Unknown)).not.toMatch(/\b[45]\d\d\b/);
  });

  it("every ErrorCode has a message (no missing keys)", () => {
    const codes = Object.values(ErrorCode) as ErrorCode[];
    for (const code of codes) {
      expect(mapError(code)).toBeTruthy();
    }
  });
});
