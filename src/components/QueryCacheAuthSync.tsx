import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { clearPersistedQueryCache } from "@/lib/queryPersister";

/** Limpa memória + localStorage ao terminar sessão (evita leakage entre utilizadores). */
export function QueryCacheAuthSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") clearPersistedQueryCache(queryClient);
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  return null;
}
