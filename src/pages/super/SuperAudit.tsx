import { useCallback, useEffect, useState } from "react";
import { ExternalLink, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type AuditRow = {
  id: string;
  created_at: string | null;
  user_full_name: string | null;
  user_id: string | null;
  school_id: string | null;
  table_name: string;
  action: string;
  record_id: string | null;
  old_data: Json | null;
  new_data: Json | null;
};

const formatJson = (v: Json | null) => {
  if (v == null) return "—";
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
};

const SuperAudit = () => {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const sentryIssuesUrl =
    typeof import.meta.env.VITE_SENTRY_ISSUES_URL === "string" && import.meta.env.VITE_SENTRY_ISSUES_URL.length > 4
      ? import.meta.env.VITE_SENTRY_ISSUES_URL
      : null;

  const load = useCallback(() => {
    void (async () => {
      setErr(null);
      const { data, error } = await supabase
        .from("audit_logs")
        .select(
          "id, created_at, user_full_name, user_id, school_id, table_name, action, record_id, old_data, new_data",
        )
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) {
        setErr(error.message);
        setRows([]);
        return;
      }
      setRows((data ?? []) as unknown as AuditRow[]);
    })();
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (err) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">{err}</div>
    );
  }

  if (!rows) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Logs de auditoria e estabilidade
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Registo de alterações escritas pela função{" "}
            <code className="rounded-md bg-muted px-1 py-0.5 text-[11px]">log_audit_event</code>: quem mexeu em que tabela{" "}
            e de que escola partiram as alterações. Para erros runtime no produto — use também o quadro externo{" "}
            <strong className="font-medium text-foreground">Sentry</strong>; o número de falhas não está na base Postgres.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => load()}>
            Actualizar
          </Button>
          {sentryIssuesUrl ? (
            <Button type="button" className="gap-2 rounded-full" asChild>
              <a href={sentryIssuesUrl} target="_blank" rel="noreferrer">
                <ShieldAlert className="h-4 w-4" />
                Abrir Sentry
                <ExternalLink className="h-3.5 w-3.5 opacity-80" />
              </a>
            </Button>
          ) : (
            <Button type="button" variant="secondary" className="gap-2 rounded-full" asChild>
              <a href="https://sentry.io/" target="_blank" rel="noreferrer">
                Sentry (configurar env)
                <ExternalLink className="h-3.5 w-3.5 opacity-80" />
              </a>
            </Button>
          )}
        </div>
      </div>

      <Card className="rounded-2xl border border-dashed border-border/80 bg-muted/15 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Como ligar o widget de erros</p>
        <p className="mt-1">
          Defina <code className="rounded bg-muted px-1 text-[11px]">VITE_SENTRY_ISSUES_URL</code> no build do front com o
          atalho directo para a vista de issues/projecto Edukamba (filtro últimas 24h pode ser configurado lá dentro).
        </p>
      </Card>

      <Card className="overflow-hidden rounded-2xl border-border/70 shadow-soft">
        <div className="max-h-[min(640px,70vh)] overflow-auto">
          <table className="w-full min-w-[860px] text-left text-xs sm:text-sm">
            <thead className="sticky top-0 z-[1] bg-muted/70 text-muted-foreground backdrop-blur-sm">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Quando</th>
                <th className="px-3 py-2.5 font-semibold">Quem</th>
                <th className="px-3 py-2.5 font-semibold">Tabela</th>
                <th className="px-3 py-2.5 font-semibold">Acção</th>
                <th className="px-3 py-2.5 font-semibold">Escola</th>
                <th className="px-3 py-2.5 font-semibold">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border/70 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {r.created_at ? new Date(r.created_at).toLocaleString("pt-PT") : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground">{r.user_full_name ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{r.user_id ?? ""}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px]">{r.table_name}</td>
                  <td className="px-3 py-2">{r.action}</td>
                  <td className="px-3 py-2 font-mono text-[11px]">{r.school_id ?? "—"}</td>
                  <td className="px-3 py-2">
                    <details className="rounded-lg border border-border/60 bg-muted/30 p-2">
                      <summary className="cursor-pointer text-[11px] font-semibold text-foreground">JSON</summary>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div>
                          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Antes</p>
                          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background p-2 text-[10px]">
                            {formatJson(r.old_data)}
                          </pre>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Depois</p>
                          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background p-2 text-[10px]">
                            {formatJson(r.new_data)}
                          </pre>
                        </div>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    Sem eventos de auditoria— as trigers ainda não geraram linhas ou o utilizador não tem permissões.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default SuperAudit;
