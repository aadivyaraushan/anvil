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
};
