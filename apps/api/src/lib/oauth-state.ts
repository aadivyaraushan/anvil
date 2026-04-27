import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export type OAuthProvider = "google";

/**
 * Mint a fresh state nonce for an OAuth handshake. Inserts a row in
 * oauth_states associating the nonce with the user; returns just the
 * nonce string for use as the `state` query param. Expires in 10 min.
 *
 * Use the service-role client — anon/RLS is locked on this table.
 */
export async function mintOAuthState(
  serviceSupabase: SupabaseClient,
  userId: string,
  provider: OAuthProvider,
): Promise<string> {
  const nonce = randomUUID();
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS).toISOString();

  const { error } = await serviceSupabase.from("oauth_states").insert({
    user_id: userId,
    provider,
    nonce,
    expires_at: expiresAt,
  });

  if (error) {
    throw new Error(`Failed to mint OAuth state: ${error.message}`);
  }

  return nonce;
}

export type ConsumeResult =
  | { ok: true; userId: string; provider: OAuthProvider }
  | { ok: false; reason: "missing" | "expired" | "wrong_provider" };

/**
 * Look up an OAuth state by nonce, validate, and delete it (single-use).
 * Returns the user_id the nonce was minted for, so the callback can
 * write the upserted credentials to that account without trusting any
 * caller-supplied identity.
 *
 * Reasons for rejection:
 *   - missing — nonce wasn't issued (or already consumed)
 *   - expired — nonce was issued but more than NONCE_TTL_MS ago
 *   - wrong_provider — nonce exists but for a different provider (so
 *     a Google nonce can't be replayed at a hypothetical future
 *     /github/callback)
 */
export async function consumeOAuthState(
  serviceSupabase: SupabaseClient,
  nonce: string,
  expectedProvider: OAuthProvider,
): Promise<ConsumeResult> {
  const { data: row } = await serviceSupabase
    .from("oauth_states")
    .select("id, user_id, provider, expires_at")
    .eq("nonce", nonce)
    .maybeSingle();

  if (!row) return { ok: false, reason: "missing" };

  const typed = row as {
    id: string;
    user_id: string;
    provider: OAuthProvider;
    expires_at: string;
  };

  // Always delete the row regardless of validity, so a replay of a
  // valid-but-already-consumed nonce can't slip through.
  await serviceSupabase.from("oauth_states").delete().eq("id", typed.id);

  if (typed.provider !== expectedProvider) {
    return { ok: false, reason: "wrong_provider" };
  }
  if (new Date(typed.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, userId: typed.user_id, provider: typed.provider };
}
