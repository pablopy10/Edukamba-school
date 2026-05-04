import { Capacitor } from "@capacitor/core";

/** App instalada (Capacitor shell iOS/Android), não browser web. */
export function isNativeMobileApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** Cartões de indicadores/KPI no topo das páginas — só na web; ocultos na app Capacitor (iOS/Android). */
export function showPageKpiCards(): boolean {
  return !Capacitor.isNativePlatform();
}

/**
 * Botão flutuante de adicionar na app nativa: canto inferior direito do ecrã,
 * acima da bottom navigation (alinhado ao padding do main).
 * Usar com `NativeMobileFabPortal` — o outlet animado usa `transform` e quebraria `fixed`.
 * Cores: tema (`Button` default / primary).
 */
export const NATIVE_MOBILE_FAB_BUTTON_CLASSNAME =
  "fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px)+0.75rem)] right-[max(1.25rem,env(safe-area-inset-right,0px))] z-[90] size-14 shrink-0 rounded-2xl bg-primary text-primary-foreground shadow-lg hover:bg-primary/90";

/** Rotas do dashboard não disponíveis na app Capacitor (menu + acesso directo). */
const NATIVE_BLOCKED_ROUTE_PREFIXES = [
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
