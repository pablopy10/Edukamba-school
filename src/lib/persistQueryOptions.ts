import { queryPersister, QUERY_CACHE_BUSTER } from "@/lib/queryPersister";

/** Roots persistidos: professor offline (alunos/turmas/notas/presenças). */
const PERSIST_QUERY_ROOTS = new Set(["presencas", "teacherPrefetch", "alunos", "turmas", "notas"]);

export const persistQueryOptions = {
  persister: queryPersister,
  buster: QUERY_CACHE_BUSTER,
  maxAge: 1000 * 60 * 60 * 24 * 14,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { queryKey: readonly unknown[] }) => {
      const root = query.queryKey[0];
      return typeof root === "string" && PERSIST_QUERY_ROOTS.has(root);
    },
  },
};
