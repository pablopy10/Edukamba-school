import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventRow } from "@/components/eventos/EventFormDialog";
import { filterStudentsByAudience, parseEventAudience } from "@/lib/eventAudience";

export type StaffRosterRsvpResponse = "presente" | "ausente" | "unset";

export type StaffRosterStudent = {
  id: string;
  full_name: string | null;
  classroom_id: string | null;
};

const makeKey = (eventId: string, studentId: string) => `${eventId}::${studentId}`;

function eligibleStudentsForEvent(event: EventRow, schoolStudents: StaffRosterStudent[]): StaffRosterStudent[] {
  const p = parseEventAudience(event.audience);
  return filterStudentsByAudience(p, schoolStudents);
}

function normalizeResponse(raw: unknown): StaffRosterRsvpResponse {
  if (raw === "presente" || raw === "ausente" || raw === "unset") return raw;
  return "unset";
}

type Props = {
  event: EventRow;
  rosterStudents: StaffRosterStudent[];
  rsvpMap: Record<string, StaffRosterRsvpResponse>;
  classroomNames?: Record<string, string>;
  layout?: "card" | "compact";
};

export function EventStaffAttendanceRoster({
  event,
  rosterStudents,
  rsvpMap,
  classroomNames,
  layout = "card",
}: Props) {
  const [open, setOpen] = useState(false);

  const buckets = useMemo(() => {
    const elig = eligibleStudentsForEvent(event, rosterStudents).slice().sort((a, b) => {
      const an = (a.full_name ?? "").localeCompare(b.full_name ?? "", "pt");
      if (an !== 0) return an;
      return a.id.localeCompare(b.id);
    });
    const presente: StaffRosterStudent[] = [];
    const ausente: StaffRosterStudent[] = [];
    const unset: StaffRosterStudent[] = [];
    for (const s of elig) {
      const r = normalizeResponse(rsvpMap[makeKey(event.id, s.id)]);
      if (r === "presente") presente.push(s);
      else if (r === "ausente") ausente.push(s);
      else unset.push(s);
    }
    return {
      eligible: elig,
      presente,
      ausente,
      unset,
    };
  }, [event, rosterStudents, rsvpMap]);

  const { eligible, presente, ausente, unset } = buckets;

  const roomLabel = (classroomId: string | null) => {
    if (!classroomId) return "";
    const n = classroomNames?.[classroomId];
    return n ? ` · ${n}` : "";
  };

  const listBlock = (title: string, tone: string, items: StaffRosterStudent[]) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-1">
        <p className={cn("text-[11px] font-semibold", tone)}>
          {title} ({items.length})
        </p>
        <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-border/50 bg-muted/10 px-2 py-1.5 text-[11px] text-foreground">
          {items.map((s) => (
            <li key={s.id} className="truncate py-0.5 leading-tight">
              <span className="font-medium">{s.full_name ?? "Aluno"}</span>
              <span className="text-muted-foreground">{roomLabel(s.classroom_id)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  if (eligible.length === 0) {
    const staffOnly = parseEventAudience(event.audience).mode === "staff";
    return (
      <div
        className={cn(
          "rounded-lg border border-border/60 bg-muted/15 text-muted-foreground",
          layout === "compact" ? "px-2 py-1 text-[11px]" : "mt-2 p-3 text-xs",
        )}
      >
        {staffOnly
          ? "Evento apenas para funcionários — sem lista de presença de alunos."
          : "Sem alunos abrangidos por este público."}
      </div>
    );
  }

  const summaryText = `${presente.length} presente · ${ausente.length} ausente · ${unset.length} sem resposta`;

  if (layout === "compact") {
    return (
      <div className="min-w-[160px] max-w-[220px]">
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
            {listBlock("Vai estar presente", "text-green-700 dark:text-green-400", presente)}
            {listBlock("Não vai", "text-amber-800 dark:text-amber-300", ausente)}
            {listBlock("Por definir (encarregado)", "text-muted-foreground", unset)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-2 text-left"
      >
        <ChevronDown
          className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          strokeWidth={2}
        />
        <div>
          <p className="text-xs font-semibold text-foreground">Presença dos alunos</p>
          <p className="text-[11px] text-muted-foreground">{summaryText}</p>
        </div>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border/50 pt-2">
          {listBlock("Vai estar presente", "text-green-700 dark:text-green-400", presente)}
          {listBlock("Não vai", "text-amber-800 dark:text-amber-300", ausente)}
          {listBlock("Por definir pelo encarregado", "text-muted-foreground", unset)}
        </div>
      )}
    </div>
  );
}
