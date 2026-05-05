/**
 * Push web via OneSignal (browser). Ignorado em Capacitor: use `onesignal-cordova-plugin` no nativo.
 * Defina no .env: VITE_ONESIGNAL_APP_ID=<uuid do dashboard>
 * Opcional: VITE_ONESIGNAL_SAFARI_WEB_ID (Safari/iOS push web)
 */
import { Capacitor } from "@capacitor/core";

const SW_PATH = "push/onesignal/OneSignalSDKWorker.js";
const SW_SCOPE = "/push/onesignal/";

export function onesignalWebAppIdConfigured(): boolean {
  return !!import.meta.env.VITE_ONESIGNAL_APP_ID?.trim();
}

export function shouldInitializeOneSignalWeb(): boolean {
  if (typeof window === "undefined") return false;
  if (Capacitor.isNativePlatform()) return false;
  return onesignalWebAppIdConfigured();
}

let initPromise: Promise<void> | null = null;

export function initOneSignalWeb(): Promise<void> {
  if (!shouldInitializeOneSignalWeb()) return Promise.resolve();

  if (initPromise) return initPromise;

  const p = (async () => {
    const [{ default: OneSignal }] = await Promise.all([import("react-onesignal")]);

    await OneSignal.init({
      appId: import.meta.env.VITE_ONESIGNAL_APP_ID as string,
      allowLocalhostAsSecureOrigin: import.meta.env.DEV,
      autoRegister: false,
      serviceWorkerPath: SW_PATH,
      serviceWorkerParam: { scope: SW_SCOPE },
      ...(import.meta.env.VITE_ONESIGNAL_SAFARI_WEB_ID
        ? { safari_web_id: import.meta.env.VITE_ONESIGNAL_SAFARI_WEB_ID as string }
        : {}),
    });
  })();

  initPromise = p;
  return p;
}

/** Liga/desliga o utilizador autenticado ao OneSignal External ID (= auth user id). */
export async function setOneSignalExternalUser(authUserId: string | null): Promise<void> {
  if (!shouldInitializeOneSignalWeb()) return;

  await initOneSignalWeb();
  const OneSignal = (await import("react-onesignal")).default;
  try {
    if (authUserId) {
      await OneSignal.login(authUserId);
    } else {
      await OneSignal.logout();
    }
  } catch {
    // Evitar quebrar a app se o dashboard / domínio ainda não estiverem configurados
  }
}

/** @returns false se o utilizador quis activar push mas não foi possível (permissão/SW). */
export async function applyWebPushPreference(wantPush: boolean): Promise<boolean> {
  if (!shouldInitializeOneSignalWeb()) return true;

  await initOneSignalWeb();
  const OneSignal = (await import("react-onesignal")).default;
  try {
    if (!OneSignal.Notifications.isPushSupported()) return !wantPush;

    if (wantPush) {
      const granted = await OneSignal.Notifications.requestPermission();
      if (!granted) return false;
      await OneSignal.User.PushSubscription.optIn();
      return true;
    }
    await OneSignal.User.PushSubscription.optOut();
    return true;
  } catch {
    return false;
  }
}

/** Regista o email do utilizador no OneSignal para o canal de email. */
export async function addOneSignalEmailAddress(email: string): Promise<void> {
  if (!shouldInitializeOneSignalWeb()) return;
  if (!email?.trim()) return;

  await initOneSignalWeb();
  const OneSignal = (await import("react-onesignal")).default;
  try {
    await OneSignal.User.addEmail(email.trim());
  } catch {
    // Não bloquear a app se o canal de email não estiver configurado no dashboard
  }
}
