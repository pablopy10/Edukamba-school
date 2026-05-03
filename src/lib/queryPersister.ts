import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

export const QUERY_CACHE_STORAGE_KEY = "tanstack-query-edukamba-v2";

/** Invalida caches persistidos antigos quando a estrutura dos dados muda. */
export const QUERY_CACHE_BUSTER = "offline-first-v1";

const memoryLocalStorage: Storage = (() => {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (key: string) => m.get(key) ?? null,
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    removeItem: (key: string) => {
      m.delete(key);
    },
    setItem: (key: string, value: string) => {
      m.set(key, value);
    },
  };
})();

export function createAppQueryPersister() {
  if (Capacitor.isNativePlatform()) {
    const storage = {
      getItem: (key: string) =>
        Preferences.get({ key }).then(({ value }) => value ?? null),
      setItem: (key: string, value: string) => Preferences.set({ key, value }),
      removeItem: (key: string) => Preferences.remove({ key }),
    };
    return createAsyncStoragePersister({
      storage,
      key: QUERY_CACHE_STORAGE_KEY,
      throttleTime: 750,
    });
  }

  const windowStorage =
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
      ? window.localStorage
      : memoryLocalStorage;

  return createSyncStoragePersister({
    storage: windowStorage,
    key: QUERY_CACHE_STORAGE_KEY,
    throttleTime: 750,
  });
}

/** Instância partilhada pela app (auth clear, provider). */
export const queryPersister = createAppQueryPersister();
