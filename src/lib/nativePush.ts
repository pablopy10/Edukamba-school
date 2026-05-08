/**
 * nativePush — Gere push notifications nativas via @capacitor/push-notifications.
 * Funciona em iOS e Android. No browser não faz nada.
 *
 * Fluxo iOS:
 *  1. requestPermissions() → mostra o diálogo de permissão iOS
 *  2. register() → regista para APNs
 *  3. Evento "registration" → recebe token APNs
 *  4. Chama edge function register-push-token para associar o token ao utilizador no OneSignal
 */

import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Solicita permissão de push notifications no iOS (mostra o diálogo nativo).
 * Retorna true se a permissão foi concedida.
 */
export async function requestNativePushPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    const permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === "prompt" || permStatus.receive === "prompt-with-rationale") {
      const result = await PushNotifications.requestPermissions();
      return result.receive === "granted";
    }

    return permStatus.receive === "granted";
  } catch (e) {
    console.warn("nativePush: requestPermission failed", e);
    return false;
  }
}

/**
 * Regista o dispositivo para push notifications nativas e envia o token ao OneSignal.
 * Deve ser chamado após o utilizador dar permissão.
 */
export async function registerNativePushToken(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const platform = Capacitor.getPlatform() as "ios" | "android";

    // Remover listeners anteriores para evitar duplicados
    await PushNotifications.removeAllListeners();

    // Listener para o token de registo
    await PushNotifications.addListener("registration", async (tokenData) => {
      const token = tokenData.value;
      if (!token) return;

      console.log("nativePush: token recebido", platform, token.substring(0, 12) + "...");

      try {
        const { error } = await supabase.functions.invoke("register-push-token", {
          body: { token, platform },
        });
        if (error) {
          console.warn("nativePush: falha ao registar token no servidor", error);
        } else {
          console.log("nativePush: token registado com sucesso");
        }
      } catch (e) {
        console.warn("nativePush: exceção ao registar token", e);
      }
    });

    // Listener para erros de registo
    await PushNotifications.addListener("registrationError", (err) => {
      console.warn("nativePush: registrationError", err);
    });

    // Iniciar registo (pedido de token APNs/FCM)
    await PushNotifications.register();
  } catch (e) {
    console.warn("nativePush: registerNativePushToken failed", e);
  }
}

/**
 * Ponto de entrada principal: solicita permissão e, se concedida, regista o token.
 * Deve ser chamado após o login do utilizador.
 */
export async function initNativePush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const granted = await requestNativePushPermission();
  if (granted) {
    await registerNativePushToken();
  }
}
