import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { shouldInitializeOneSignalNative, setOneSignalNativeExternalUser } from "@/lib/oneSignalNative";
import { setOneSignalExternalUser, shouldInitializeOneSignalWeb } from "@/lib/oneSignalWeb";

/**
 * Liga o External ID OneSignal (= user id Supabase) à sessão (web react-onesignal e/ou Cordova nativo).
 * Subscrição: Perfil › Preferências › Notificações push (guardar).
 */
export function OneSignalWebBridge() {
  const lastUserRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const run = async (userId: string | undefined) => {
      if (userId === lastUserRef.current) return;
      lastUserRef.current = userId;

      if (shouldInitializeOneSignalWeb()) {
        await setOneSignalExternalUser(userId ?? null);
      }
      if (shouldInitializeOneSignalNative()) {
        await setOneSignalNativeExternalUser(userId ?? null);
      }
    };

    if (!shouldInitializeOneSignalWeb() && !shouldInitializeOneSignalNative()) return;

    void supabase.auth.getSession().then(({ data }) => {
      void run(data.session?.user?.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      void run(session?.user?.id ?? undefined);
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
