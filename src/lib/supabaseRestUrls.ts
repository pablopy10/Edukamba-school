import { supabase } from "@/integrations/supabase/client";

/** Base `/rest/v1` para pedidos HTTP compatíveis com PostgREST (offline sync). */
export function supabaseRestTable(table: string): string {
  const url = supabase.supabaseUrl;
  return `${url}/rest/v1/${table}`;
}
