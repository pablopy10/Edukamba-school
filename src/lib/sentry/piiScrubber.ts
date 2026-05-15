import type { Breadcrumb, ErrorEvent, TransactionEvent } from "@sentry/core";

/** Chaves comuns em payloads de alunos / encarregados / contas (RGPD). */
const SENSITIVE_KEY_FRAGMENTS = [
  "password",
  "senha",
  "token",
  "secret",
  "authorization",
  "cookie",
  "email",
  "mail",
  "telefone",
  "phone",
  "mobile",
  "nif",
  "bi",
  "documento",
  "iban",
  "student_id",
  "parent_id",
  "guardian",
  "encarregado",
  "full_name",
  "nome_completo",
  "address",
  "morada",
  "cpf",
  "cc",
  "cartao",
  "payment_proof",
  "comprovativ",
] as const;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PT_PHONE_RE = /(?:\+351|\+244|00\s*351|00\s*244)?\s*(?:9[1236]\d{7}|2\d{8}|\d{9,12})/g;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

function keyLooksSensitive(k: string): boolean {
  const lower = k.toLowerCase();
  return SENSITIVE_KEY_FRAGMENTS.some((frag) => lower.includes(frag));
}

function scrubString(s: string): string {
  return s
    .replace(EMAIL_RE, "[email]")
    .replace(PT_PHONE_RE, "[telefone]")
    .replace(UUID_RE, "[id]");
}

function scrubValue(key: string | undefined, value: unknown, depth: number): unknown {
  if (depth > 8) return "[profundidade-máxima]";
  if (value == null) return value;
  if (key && keyLooksSensitive(key)) return "[REDACTED]";
  if (typeof value === "string") return scrubString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((v, i) => scrubValue(String(i), v, depth + 1));
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      out[k] = scrubValue(k, v, depth + 1);
    }
    return out;
  }
  return value;
}

function scrubExtrasAndContexts<E extends ErrorEvent | TransactionEvent>(event: E): void {
  if (event.extra && typeof event.extra === "object") {
    event.extra = scrubValue(undefined, event.extra, 0) as ErrorEvent["extra"];
  }
  if (event.contexts && typeof event.contexts === "object") {
    event.contexts = scrubValue(undefined, event.contexts, 0) as ErrorEvent["contexts"];
  }
  if (event.request?.headers && typeof event.request.headers === "object") {
    const h = event.request.headers as Record<string, string>;
    const next: Record<string, string> = { ...h };
    for (const hk of Object.keys(next)) {
      if (/auth|cookie|token|authorization/i.test(hk)) next[hk] = "[REDACTED]";
    }
    event.request.headers = next;
  }
  if (event.request?.query_string && typeof event.request.query_string === "string") {
    event.request.query_string = scrubString(event.request.query_string);
  }
  if (event.request?.url) {
    try {
      const u = new URL(event.request.url, typeof window !== "undefined" ? window.location.origin : "https://local");
      for (const p of [...u.searchParams.keys()]) {
        if (keyLooksSensitive(p) || /id|email|token|student|parent|user/i.test(p)) {
          u.searchParams.set(p, "[REDACTED]");
        }
      }
      event.request.url = u.toString();
    } catch {
      event.request.url = scrubString(String(event.request.url));
    }
  }
}

/** Limpa PII antes de enviar erro ou transação ao Sentry. */
export function beforeSendHandler(event: ErrorEvent): ErrorEvent | null {
  if (event.user) {
    delete event.user.email;
    delete event.user.username;
    delete event.user.ip_address;
    if (event.user.id) event.user.id = scrubString(String(event.user.id)).slice(0, 120);
  }
  scrubExtrasAndContexts(event);
  if (event.breadcrumbs?.length) {
    event.breadcrumbs = event.breadcrumbs.map((b) => scrubBreadcrumb(b));
  }
  return event;
}

export function beforeSendTransactionHandler(event: TransactionEvent): TransactionEvent | null {
  if (event.transaction) event.transaction = scrubString(event.transaction);
  scrubExtrasAndContexts(event);
  return event;
}

function scrubBreadcrumb(b: Breadcrumb): Breadcrumb {
  const copy = { ...b };
  if (copy.message) copy.message = scrubString(copy.message);
  if (copy.data && typeof copy.data === "object") {
    copy.data = scrubValue(undefined, copy.data, 0) as Record<string, unknown>;
  }
  return copy;
}

export function beforeBreadcrumbHandler(crumb: Breadcrumb): Breadcrumb | null {
  return scrubBreadcrumb(crumb);
}
