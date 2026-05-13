/** Base `/rest/v1` para pedidos HTTP compatíveis com PostgREST (offline sync). */
export function supabaseRestTable(table: string): string {
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  return `${url}/rest/v1/${table}`;
}
