import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { get, set, del } from "idb-keyval";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";

const IDB_KEY = "anvil-react-query-cache";

const idbStorage = {
  getItem: (key: string): Promise<string | null> =>
    get<string>(key).then((v) => v ?? null),
  setItem: (key: string, value: string): Promise<void> => set(key, value),
  removeItem: (key: string): Promise<void> => del(key),
};

const persister: Persister = createAsyncStoragePersister({
  storage: idbStorage,
  key: IDB_KEY,
  throttleTime: 1000,
  serialize: (persistedClient: PersistedClient) =>
    JSON.stringify(persistedClient),
  deserialize: (cachedString: string) =>
    JSON.parse(cachedString) as PersistedClient,
});

export const persistOptions = {
  persister,
  maxAge: 1000 * 60 * 60 * 24, // 24 hours — matches gcTime
  buster: process.env.NEXT_PUBLIC_APP_VERSION ?? "v1",
  dehydrateOptions: {
    // Never persist the auth/session query. Auth state must be the
    // source-of-truth-at-this-moment; serving a stale `null` from
    // IndexedDB on a fresh page load (e.g. after a sign-out happened
    // in another tab) would make AuthGuard redirect to /login before
    // useSession's queryFn ever runs against Supabase. The hot path
    // for auth lives on AuthStateMirror + the queryFn; persisting
    // adds nothing useful and creates a nasty failure mode.
    shouldDehydrateQuery: (query: { queryKey: readonly unknown[] }) =>
      query.queryKey[0] !== "auth",
  },
};
