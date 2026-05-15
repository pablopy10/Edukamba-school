/**
 * Configuração do cliente Sentry (browser) — equivalente a `sentry.client.config.ts` no Next.js.
 * Importe este ficheiro em `main.tsx` antes de `createRoot(...).render(...)` para activar a captura.
 *
 * Variáveis: `VITE_SENTRY_DSN`, opcionalmente `VITE_SENTRY_ENVIRONMENT`, `VITE_SENTRY_TRACES_SAMPLE_RATE`.
 */
import * as Sentry from "@sentry/react";
import {
  beforeBreadcrumbHandler,
  beforeSendHandler,
  beforeSendTransactionHandler,
} from "@/lib/sentry/piiScrubber";

const dsn = import.meta.env.VITE_SENTRY_DSN;
const environment = import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE;
const tracesSampleRate = Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? "0.1");

export function initSentryClient(): void {
  if (!dsn) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[Sentry] VITE_SENTRY_DSN não definido — monitorização desactivada.");
    }
    return;
  }

  Sentry.init({
    dsn,
    environment,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? Math.min(1, Math.max(0, tracesSampleRate)) : 0.1,
    sendDefaultPii: false,
    beforeSend: beforeSendHandler,
    beforeSendTransaction: beforeSendTransactionHandler,
    beforeBreadcrumb: beforeBreadcrumbHandler,
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "Non-Error promise rejection captured",
      /Failed to fetch dynamically imported module/i,
    ],
  });
}

initSentryClient();
