/**
 * PKCE (Proof Key for Code Exchange) helpers.
 * All crypto uses the Web Crypto API — no external dependencies.
 */

const VERIFIER_KEY = "anvil_pkce_verifier";
const STATE_KEY = "anvil_pkce_state";

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

function base64urlEncode(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Returns a 128-byte random code verifier, base64url-encoded (≥ 43 chars per RFC 7636). */
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(128);
  crypto.getRandomValues(bytes);
  return base64urlEncode(bytes);
}

/** Returns the SHA-256 code challenge for a given verifier, base64url-encoded. */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64urlEncode(new Uint8Array(digest));
}

/** Returns a 32-byte random state value, base64url-encoded. */
export function generateState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64urlEncode(bytes);
}

// ---------------------------------------------------------------------------
// sessionStorage persistence
// ---------------------------------------------------------------------------

/** Stores verifier + state in sessionStorage and returns them. */
export function storePkceParams(): { verifier: string; state: string } {
  const verifier = generateCodeVerifier();
  const state = generateState();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  return { verifier, state };
}

/** Reads and clears verifier + state from sessionStorage. */
export function consumePkceParams(): { verifier: string | null; state: string | null } {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const state = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  return { verifier, state };
}

/** Reads state without clearing — used for validation before consumption. */
export function getPkceState(): string | null {
  return sessionStorage.getItem(STATE_KEY);
}
