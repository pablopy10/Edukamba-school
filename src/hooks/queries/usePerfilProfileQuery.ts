import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { qk } from "./keys";

export type PerfilDbRow = {
  full_name: string | null;
  phone: string | null;
  language: string | null;
  role: string | null;
  school_id: string | null;
};

async function fetchPerfil(userId: string): Promise<PerfilDbRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, phone, language, role, school_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as PerfilDbRow | null;
}

export function usePerfilProfileQuery(userId: string | undefined) {
  return useQuery({
    queryKey: qk.perfilProfile(userId),
    queryFn: () => fetchPerfil(userId!),
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: "offlineFirst",
  });
}
