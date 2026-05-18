import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePerfilProfileQuery } from "@/hooks/queries/usePerfilProfileQuery";
import { syncAppLocale } from "@/lib/syncAppLocale";

/**
 * Keeps `i18next`, Capacitor Preferences, localStorage and OneSignal tags aligned with `profiles.language`.
 * Equivalent à sincronização Server/App Router — aqui é SPA + Capacitor.
 */
export function LanguageSyncBridge() {
  const { user } = useAuth();
  const { data: perfil } = usePerfilProfileQuery(user?.id);

  useEffect(() => {
    if (!user?.id || !perfil) return;
    void syncAppLocale(perfil.language);
  }, [user?.id, perfil?.language]);

  return null;
}
