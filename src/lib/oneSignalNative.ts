/**
 * OneSignal em Capacitor Android/iOS (via onesignal-cordova-plugin).
 * Espera que `window.cordova.exec` esteja disponível na WebView depois do arranque.
 */
import type { OneSignalPlugin } from "onesignal-cordova-plugin";
import { Capacitor } from "@capacitor/core";

type CordovaWindow = Window & {
  cordova?: { exec?: (...args: unknown[]) => void };
};

async function cordovaBridgeReady(timeoutMs = 15000): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const hasBridge = (): boolean => !!(window as CordovaWindow).cordova?.exec;

  if (hasBridge()) return true;

  return new Promise<boolean>((resolve) => {
    const timer = window.setInterval(() => {
      if (hasBridge()) {
        window.clearInterval(timer);
        resolve(true);
      }
    }, 50);

    document.addEventListener(
      "deviceready",
      () => {
        window.clearInterval(timer);
        resolve(hasBridge());
      },
      { once: true },
    );

    window.setTimeout(() => {
      window.clearInterval(timer);
      resolve(hasBridge());
    }, timeoutMs);
  });
}

function nativeAppIdConfigured(): boolean {
  return !!import.meta.env.VITE_ONESIGNAL_APP_ID?.trim();
}

export function shouldInitializeOneSignalNative(): boolean {
  return Capacitor.isNativePlatform() && nativeAppIdConfigured();
}

/** LogLevel.Verbose para depuração. */
const OS_LOG_VERBOSE = 6;

let cached: OneSignalPlugin | null = null;

async function getPlugin(): Promise<OneSignalPlugin | null> {
  if (!shouldInitializeOneSignalNative()) return null;
  if (!(await cordovaBridgeReady())) {
    console.warn(
      "[OneSignal] Cordova bridge indisponível — push nativo pode não funcionar até a WebView estar pronta.",
    );
    return null;
  }
  if (cached) return cached;
  const mod = await import("onesignal-cordova-plugin");
  cached = mod.default;
  return cached;
}

let initDone = false;

export async function initOneSignalNative(): Promise<boolean> {
  const appId = import.meta.env.VITE_ONESIGNAL_APP_ID?.trim();
  if (!appId || !shouldInitializeOneSignalNative()) return false;

  const OneSignal = await getPlugin();
  if (!OneSignal) return false;

  if (!initDone) {
    if (import.meta.env.DEV) {
      OneSignal.Debug.setLogLevel(OS_LOG_VERBOSE);
    }
    OneSignal.initialize(appId);
    initDone = true;
  }
  return true;
}

export async function setOneSignalNativeExternalUser(userId: string | null): Promise<void> {
  if (!shouldInitializeOneSignalNative()) return;

  await initOneSignalNative();
  const OneSignal = await getPlugin();
  if (!OneSignal) return;

  try {
    if (userId) OneSignal.login(userId);
    else OneSignal.logout();
  } catch {
    /* noop */
  }
}

/** @returns false se o utilizador quis activar push mas a permissão foi recusada. */
export async function applyNativePushPreference(wantPush: boolean): Promise<boolean> {
  if (!shouldInitializeOneSignalNative()) return true;

  await initOneSignalNative();
  const OneSignal = await getPlugin();
  if (!OneSignal) return !wantPush;

  try {
    if (wantPush) {
      const granted = await OneSignal.Notifications.requestPermission(true);
      if (!granted) return false;
      OneSignal.User.pushSubscription.optIn();
      return true;
    }
    OneSignal.User.pushSubscription.optOut();
    return true;
  } catch {
    return false;
  }
}
