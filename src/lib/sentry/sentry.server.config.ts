/**
 * Configuração de servidor Sentry (Next.js: `sentry.server.config.ts`).
 *
 * Este repositório é uma **SPA com Vite** — não existe runtime Node para as páginas da app.
 * Erros de API Supabase e lógica no browser são capturados por `sentry.client.config.ts`.
 *
 * Se migrar para **Next.js App Router**, copie o output do wizard (`npx @sentry/wizard -i nextjs`)
 * e inicialize aqui com `Sentry.init` para que **Route Handlers** (`app/api/.../route.ts`) e
 * **Server Actions** (`"use server"`) usem o mesmo DSN e `beforeSend` de PII.
 *
 * Exemplo (Next.js):
 * ```ts
 * import * as Sentry from "@sentry/nextjs";
 * Sentry.init({ dsn: process.env.SENTRY_DSN, ... });
 * ```
 */
export {};
