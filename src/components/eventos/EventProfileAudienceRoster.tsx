import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventRow } from "@/components/eventos/EventFormDialog";
import { parseEventAudience } from "@/lib/eventAudience";

export type ProfileRsvpResponse = "presente" | "ausente" | "unset";

export type ProfileRsvpRow = {
  profile_id: string;
  full_name: string | null;
  response: ProfileRsvpResponse;
};

function normalizeResponse(raw: unknown): ProfileRsvpResponse {
  if (raw === "presente" || raw === "ausente" || raw === "unset") return raw;
  return "unset";
}

type Props = {
  event: EventRow;
  rows: ProfileRsvpRow[];
  layout?: "card" | "compact";
};

export function EventProfileAudienceRoster({ event, rows, layout = "card" }: Props) {
  const [open, setOpen] = useState(false);
  const label = useMemo(() => {
    const m = parseEventAudience(event.audience).mode;
    if (m === "staff") return "Presença dos funcionários";
    if (m === "educators") return "Presença dos encarregados";
    return "Presença declarada (todos)";
  }, [event.audience]);

  const buckets = useMemo(() => {
    const presente: ProfileRsvpRow[] = [];
    const ausente: ProfileRsvpRow[] = [];
    const unset: ProfileRsvpRow[] = [];
    for (const r of rows) {
      const v = normalizeResponse(r.response);
      if (v === "presente") presente.push(r);
      else if (v === "ausente") ausente.push(r);
      else unset.push(r);
    }
    return { presente, ausente, unset, total: rows.length };
  }, [rows]);

  const summaryText = `${buckets.presente.length} presente · ${buckets.ausente.length} ausente · ${buckets.unset.length} sem resposta`;

  const listBlock = (title: string, tone: string, items: ProfileRsvpRow[]) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-1">
        <p className={cn("text-[11px] font-semibold", tone)}>
          {title} ({items.length})
        </p>
        <ul className="max-h-36 space-y-0.5 overflow-y-auto rounded-md border border-border/50 bg-muted/10 px-2 py-1.5 text-[11px] text-foreground">
          {items.map((r) => (
            <li key={r.profile_id} className="truncate py-0.5 leading-tight">
              <span className="font-medium">{r.full_name?.trim() || "Utilizador"}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  if (buckets.total === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border border-border/60 bg-muted/15 text-muted-foreground",
          layout === "compact" ? "px-2 py-1 text-[11px]" : "mt-2 p-3 text-xs",
        )}
      >
        Ainda não há presenças declaradas ao nível dos perfis neste público-alvo.
      </div>
    );
  }

  if (layout === "compact") {
    return (
      <div className="min-w-[160px] max-w-[240px]">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex w-full items-center gap-1 rounded-lg border border-border/60 bg-muted/15 px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-muted/25",
            open && "ring-1 ring-pastel-blue/35",
          )}
        >
          <ChevronDown
            className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
            strokeWidth={2}
          />
          <span className="font-medium leading-tight text-foreground">{summaryText}</span>
        </button>
        {open && (
          <div className="mt-2 space-y-2 rounded-lg border border-border/60 bg-card p-2 shadow-soft">
            <p className="text-[10px] font-semibold text-muted-foreground">{label}</p>
            {listBlock("Presente", "text-green-700 dark:text-green-400", buckets.presente)}
            {listBlock("Ausente", "text-amber-800 dark:text-amber-300", buckets.ausente)}
            {listBlock("Por definir", "text-muted-foreground", buckets.unset)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-2 text-left">
        <ChevronDown
          className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          strokeWidth={2}
        />
        <div>
          <p className="text-xs font-semibold text-foreground">{label}</p>
          <p className="text-[11px] text-muted-foreground">{summaryText}</p>
        </div>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border/50 pt-2">
          {listBlock("Presente", "text-green-700 dark:text-green-400", buckets.presente)}
          {listBlock("Ausente", "text-amber-800 dark:text-amber-300", buckets.ausente)}
          {listBlock("Por definir", "text-muted-foreground", buckets.unset)}
        </div>
      )}
    </div>
  );
}
