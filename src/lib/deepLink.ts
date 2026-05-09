/**
 * Deep link handler para Capacitor iOS/Android.
 *
 * Suporta dois formatos:
 *  - Universal Links / App Links: https://www.edukamba.com/pagamentos
 *  - Custom URL scheme:          edukamba://pagamentos
 *
 * Chame `initDeepLinkHandler(navigate)` uma única vez após o app estar montado.
 */
import { Capacitor } from "@capacitor/core";

type NavigateFn = (path: string) => void;

function parsePath(url: string): string | null {
  try {
    const u = new URL(url);
    // Custom scheme: edukamba://pagamentos → /pagamentos
    if (u.protocol === "edukamba:") {
      const path = "/" + (u.host + u.pathname).replace(/^\/+/, "");
      return path || "/dashboard";
    }
    // Universal Link / App Link: https://www.edukamba.com/pagamentos → /pagamentos
    if (u.hostname.includes("edukamba")) {
      return u.pathname || "/dashboard";
    }
    return null;
  } catch {
    return null;
  }
}

export async function initDeepLinkHandler(navigate: NavigateFn): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { App } = await import("@capacitor/app");

    App.addListener("appUrlOpen", (event) => {
      const path = parsePath(event.url);
      if (path) {
        console.log("[deepLink] open:", event.url, "→", path);
        navigate(path);
      }
    });
  } catch (e) {
    console.warn("[deepLink] @capacitor/app não disponível:", e);
  }
}
