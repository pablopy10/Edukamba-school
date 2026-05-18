import type { AppLocale } from "@/i18n/constants";
import { supabase } from "@/integrations/supabase/client";

/**
 * Actualização só do idioma via RPC (`public.set_my_language`).
 * Use quando não precisa do modo offline PATCH em `profiles`; caso contrário mantenha `.update()` em Perfil.
 */
export async function rpcSetMyLanguage(locale: AppLocale) {
  return supabase.rpc("set_my_language", { p_language: locale });
}
