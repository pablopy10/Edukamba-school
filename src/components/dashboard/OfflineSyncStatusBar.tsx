import { CheckCircle2, Cloud, Loader2 } from "lucide-react";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { cn } from "@/lib/utils";

/** Estado resumido da fila REST offline (presenças, notas, etc.). */
export function OfflineSyncStatusBar({ className }: { className?: string }) {
  const { pendingCount, syncing, isOnline } = useOfflineSync();

  const hasQueue = pendingCount > 0;
  const label = hasQueue
    ? `${pendingCount} alteração(ões) por sincronizar no telemóvel`
    : syncing
      ? "A sincronizar com o servidor…"
      : "Sincronizado com o servidor";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium",
        hasQueue
          ? "border-amber-500/40 bg-amber-500/12 text-amber-900 dark:text-amber-100"
          : "border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
        !isOnline &&
          hasQueue &&
          "border-amber-500/55 bg-amber-500/[0.17]",
        className,
      )}
    >
      {syncing ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
      ) : hasQueue ? (
        <Cloud className="h-3.5 w-3.5 shrink-0 fill-amber-400/85 text-amber-600 dark:fill-amber-500/50 dark:text-amber-300" aria-hidden />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
      )}
      <span>{label}</span>
    </div>
  );
}
