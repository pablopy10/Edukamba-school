import { Capacitor } from "@capacitor/core";

/** App instalada (Capacitor shell iOS/Android), não browser web. */
export function isNativeMobileApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** Cartões de indicadores/KPI no topo das páginas — só na web; ocultos na app Capacitor (iOS/Android). */
export function showPageKpiCards(): boolean {
  return !Capacitor.isNativePlatform();
}
