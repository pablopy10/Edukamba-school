import { Loader2 } from "lucide-react";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { cn } from "@/lib/utils";

/** Estado resumido da fila REST offline (presenças, notas, etc.). */
export function OfflineSyncStatusBar({ className }: { className?: string }) {
  const { pendingCount, syncing } = useOfflineSync();

  const label =
    pendingCount > 0
      ? `Modo offline — ${pendingCount} alterações pendentes`
      : syncing
        ? "A sincronizar…"
        : "Sincronizado";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      {syncing ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden /> : null}
      <span>{label}</span>
    </div>
  );
}
