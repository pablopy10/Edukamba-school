import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { queryClient } from "@/lib/queryClient";
import { queryPersister } from "@/lib/queryPersister";

/** Remove o cache TanStack persistido e repõe o cliente quando a sessão termina. */
export function QueryPersistenceAuthSync() {
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        void queryPersister.removeClient();
        queryClient.clear();
      }
    });
    return () => subscription.unsubscribe();
  }, []);
  return null;
}
