import { describe, expect, it } from "vitest";

import { mintOAuthState, consumeOAuthState } from "@/lib/oauth-state";

/**
 * Unit tests for the OAuth state nonce helpers. Stubs the supabase
 * client surface used by the helpers:
 *   .from("oauth_states").insert(row)
 *   .from("oauth_states").select(cols).eq("nonce", n).maybeSingle()
 *   .from("oauth_states").delete().eq("id", id)
 */

type Row = {
  id: string;
  user_id: string;
  provider: string;
  nonce: string;
  expires_at: string;
};

function makeStubStore() {
  const rows: Row[] = [];
  let nextId = 1;
  return {
    rows,
    client: {
      from(table: string) {
        if (table !== "oauth_states") {
          throw new Error(`unexpected table ${table}`);
        }
        return {
          insert(payload: Omit<Row, "id">) {
            rows.push({ id: String(nextId++), ...payload });
            return Promise.resolve({ error: null });
          },
          select() {
            return {
              eq(col: string, val: string) {
                return {
                  maybeSingle: async () => ({
                    data: rows.find((r) => (r as Record<string, unknown>)[col] === val) ?? null,
                  }),
                };
              },
            };
          },
          delete() {
            return {
              eq(col: string, val: string) {
                const idx = rows.findIndex(
                  (r) => (r as Record<string, unknown>)[col] === val,
                );
                if (idx >= 0) rows.splice(idx, 1);
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      },
    },
  };
}

describe("mintOAuthState + consumeOAuthState", () => {
  it("mint inserts a row; consume returns the user_id and deletes the row", async () => {
    const store = makeStubStore();
    const nonce = await mintOAuthState(
      store.client as never,
      "user-1",
      "google",
    );
    expect(typeof nonce).toBe("string");
    expect(store.rows.length).toBe(1);
    expect(store.rows[0].user_id).toBe("user-1");

    const result = await consumeOAuthState(store.client as never, nonce, "google");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.userId).toBe("user-1");

    // Single-use — row deleted.
    expect(store.rows.length).toBe(0);
  });

  it("consume rejects unknown nonces with reason='missing'", async () => {
    const store = makeStubStore();
    const result = await consumeOAuthState(
      store.client as never,
      "never-issued",
      "google",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing");
  });

  it("consume rejects an expired nonce with reason='expired' AND deletes the row", async () => {
    const store = makeStubStore();
    // Manually insert an expired row.
    store.rows.push({
      id: "exp-1",
      user_id: "user-2",
      provider: "google",
      nonce: "expired-nonce",
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });

    const result = await consumeOAuthState(
      store.client as never,
      "expired-nonce",
      "google",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
    expect(store.rows.length).toBe(0);
  });

  it("consume rejects replay (second call with same nonce → missing)", async () => {
    const store = makeStubStore();
    const nonce = await mintOAuthState(
      store.client as never,
      "user-3",
      "google",
    );
    const first = await consumeOAuthState(
      store.client as never,
      nonce,
      "google",
    );
    expect(first.ok).toBe(true);

    const second = await consumeOAuthState(
      store.client as never,
      nonce,
      "google",
    );
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("missing");
  });

  it("consume rejects wrong-provider replays", async () => {
    const store = makeStubStore();
    const nonce = await mintOAuthState(
      store.client as never,
      "user-4",
      "google",
    );

    // Caller passes a different provider than the nonce was minted for.
    // (This guards against a future /github/callback being abused with
    // a /google nonce.)
    const result = await consumeOAuthState(
      store.client as never,
      nonce,
      // @ts-expect-error — intentionally pass an invalid provider for the test
      "github",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("wrong_provider");
    // Still deleted — single use even when rejected.
    expect(store.rows.length).toBe(0);
  });
});
