import { Capacitor } from "@capacitor/core";

/** App instalada (Capacitor shell iOS/Android), não browser web. */
export function isNativeMobileApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** Cartões de indicadores/KPI no topo das páginas — só na web; ocultos na app Capacitor (iOS/Android). */
export function showPageKpiCards(): boolean {
  return !Capacitor.isNativePlatform();
}

/** Rotas do dashboard não disponíveis na app Capacitor (menu + acesso directo). */
const NATIVE_BLOCKED_ROUTE_PREFIXES = [
  "/pagamentos",
  "/relatorios",
  "/timesheet",
  "/modulos",
  "/definicoes",
] as const;

/** Bloqueia pathname na app nativa (exact ou sub-rota). Na web nunca bloqueia. */
export function isDashboardRouteBlockedOnNative(pathname: string): boolean {
  if (!Capacitor.isNativePlatform()) return false;
  const path = (pathname.split("?")[0] ?? pathname).trim();
  return NATIVE_BLOCKED_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
