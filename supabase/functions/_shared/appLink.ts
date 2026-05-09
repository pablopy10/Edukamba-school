/**
 * Gera um link de email que tenta abrir a app nativa (iOS/Android).
 * Fluxo: email link → https://www.edukamba.com/app-open?path=/pagamentos
 *   → tenta edukamba://pagamentos (app nativa)
 *   → fallback: https://www.edukamba.com/pagamentos (web)
 */

const WEB_BASE = "https://www.edukamba.com";

/**
 * Converte um path ou URL completo num link de email que abre a app.
 * Exemplos:
 *   appOpenLink("/pagamentos")  → https://www.edukamba.com/app-open?path=%2Fpagamentos
 *   appOpenLink("https://www.edukamba.com/presencas") → https://www.edukamba.com/app-open?path=%2Fpresencas
 */
export function appOpenLink(pathOrUrl: string): string {
  let path: string;

  if (pathOrUrl.startsWith("http")) {
    try {
      const u = new URL(pathOrUrl);
      path = u.pathname + (u.search ?? "");
    } catch {
      path = "/dashboard";
    }
  } else {
    path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  }

  return `${WEB_BASE}/app-open?path=${encodeURIComponent(path)}`;
}
