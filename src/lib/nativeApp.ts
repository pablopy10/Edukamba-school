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
 * Botão flutuante de adicionar na app nativa: canto inferior direito, fixo,
 * ligeiramente acima da bottom navigation (mesma base que o padding do main).
 * Estilo circular tipo FAB Material (rosa/magenta, ícone branco).
 */
export const NATIVE_MOBILE_FAB_BUTTON_CLASSNAME =
  "fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px)+0.75rem)] right-[max(1.25rem,env(safe-area-inset-right,0px))] z-[90] flex size-14 shrink-0 items-center justify-center rounded-full border-0 bg-fuchsia-500 text-white shadow-lg ring-2 ring-white/25 transition-[transform,box-shadow,background-color] hover:bg-fuchsia-600 hover:shadow-xl active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:size-6 [&_svg]:text-white";

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
