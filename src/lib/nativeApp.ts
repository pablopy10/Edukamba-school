import { Capacitor } from "@capacitor/core";

/** App instalada (Capacitor shell iOS/Android), não browser web. */
export function isNativeMobileApp(): boolean {
  return Capacitor.isNativePlatform();
}
