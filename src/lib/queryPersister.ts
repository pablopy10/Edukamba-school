import { hydrate } from "@tanstack/query-core";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { PersistedClient } from "@tanstack/query-persist-client-core";
import type { QueryClient } from "@tanstack/react-query";

/** Chave própria evita misturar com `REACT_QUERY_OFFLINE_CACHE` de outras builds. */
export const QUERY_CACHE_STORAGE_KEY = "edukamba-react-query-v3";

export const QUERY_CACHE_BUSTER = "edukamba-v3-offline-sync";

/** TTL do ficheiro persistido (TanStack Compara contra `persisted.timestamp`). */
export const QUERY_PERSIST_MAX_AGE_MS = 1000 * 60 * 60 * 24;

/**
 * Purga heurística: remove entradas cujo último `dataUpdatedAt` (ou `dehydratedAt`)
 * é mais antigo que 7 dias. Não mede visitas ao ecrã — só atualizações de dados em cache.
 */
const PURGE_STALE_AFTER_MS = 1000 * 60 * 60 * 24 * 7;

function pruneClientState(client: PersistedClient): PersistedClient {
  const queries = client.clientState?.queries;
  if (!Array.isArray(queries)) return client;

  const cutoff = Date.now() - PURGE_STALE_AFTER_MS;
  const filtered = queries.filter((q) => {
    if (q.state?.data === undefined) return false;
    const ref = Math.max(q.state.dataUpdatedAt ?? 0, q.dehydratedAt ?? 0);
    return ref >= cutoff;
  });

  return {
    ...client,
    clientState: {
      ...client.clientState,
      queries: filtered,
      mutations: [],
    },
  };
}

/**
 * Persistência síncrona (localStorage) + limpeza na serialização/deserialização.
 */
export function createEdukambaSyncPersister() {
  const storage = typeof window !== "undefined" ? window.localStorage : undefined;

  return createSyncStoragePersister({
    storage,
    key: QUERY_CACHE_STORAGE_KEY,
    throttleTime: 900,
    serialize: (client: unknown) =>
      JSON.stringify(pruneClientState(client as PersistedClient)),
    deserialize: (serialized) =>
      pruneClientState(JSON.parse(serialized) as PersistedClient),
  });
}

export const edukambaQueryPersister = createEdukambaSyncPersister();

/** Hidratar antes da primeira pintura React (elimina flicker ao mudar de rota offline). */
export function tryHydrateQueryClientFromStorage(client: QueryClient) {
  if (typeof window === "undefined") return;

  try {
    const raw = window.localStorage.getItem(QUERY_CACHE_STORAGE_KEY);
    if (!raw) return;

    const persisted = JSON.parse(raw) as PersistedClient;
    if (!persisted.timestamp) return;
    if (Date.now() - persisted.timestamp > QUERY_PERSIST_MAX_AGE_MS) return;
    if (persisted.buster !== QUERY_CACHE_BUSTER) return;

    hydrate(client, pruneClientState(persisted).clientState);
  } catch {
    // Cache inválido: ignorar; o provider pode remover ao falhar restore.
  }
}

export function clearPersistedQueryCache(client: QueryClient) {
  client.clear();
  edukambaQueryPersister.removeClient();
}
