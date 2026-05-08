import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { shouldInitializeOneSignalNative, setOneSignalNativeExternalUser } from "@/lib/oneSignalNative";
import { setOneSignalExternalUser, shouldInitializeOneSignalWeb } from "@/lib/oneSignalWeb";
import { initNativePush, isNativePlatform } from "@/lib/nativePush";

/**
 * Liga o External ID OneSignal (= user id Supabase) à sessão (web react-onesignal e/ou Cordova nativo).
 * Subscrição: Perfil › Preferências › Notificações push (guardar).
 */
export function OneSignalWebBridge() {
  const lastUserRef = useRef<string | undefined>(undefined);
  const navigate = useNavigate();
  const listenersAttached = useRef(false);

  useEffect(() => {
    const attachListeners = async () => {
      if (listenersAttached.current) return;
      listenersAttached.current = true;

      const handleClick = (event: any) => {
        const data = event?.notification?.additionalData;
        if (data && typeof data.link === "string") {
          navigate(data.link);
        }
      };

      if (shouldInitializeOneSignalWeb()) {
        const { default: OneSignal } = await import("react-onesignal");
        OneSignal.Notifications.addEventListener("click", handleClick);
      }

      if (shouldInitializeOneSignalNative()) {
        try {
          const mod = await import("onesignal-cordova-plugin");
          const OneSignal = mod.default;
          if (OneSignal?.Notifications?.addEventListener) {
            OneSignal.Notifications.addEventListener("click", handleClick);
          }
        } catch (e) {
          console.warn("Failed to attach native onesignal listener", e);
        }
      }
    };

    const run = async (userId: string | undefined) => {
      if (userId === lastUserRef.current) return;
      lastUserRef.current = userId;

      if (shouldInitializeOneSignalWeb()) {
        await setOneSignalExternalUser(userId ?? null);
        if (userId) {
          const { applyWebPushPreference } = await import("@/lib/oneSignalWeb");
          await applyWebPushPreference(true);
        }
      }
      if (shouldInitializeOneSignalNative()) {
        await setOneSignalNativeExternalUser(userId ?? null);
        if (userId) {
          const { applyNativePushPreference } = await import("@/lib/oneSignalNative");
          await applyNativePushPreference(true);
        }
      }

      // iOS/Android: pedir permissão de push nativo e registar token no OneSignal
      if (userId && isNativePlatform()) {
        void initNativePush();
      }

      void attachListeners();
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
  }, [navigate]);

  return null;
}
