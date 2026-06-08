import { Cloud, Loader2 } from "lucide-react";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

/** Estado resumido da fila REST offline (presenças, notas, etc.). */
export function OfflineSyncStatusBar({ className }: { className?: string }) {
  const { t } = useTranslation("common");
  const { pendingCount, syncing, isOnline } = useOfflineSync();

  const hasQueue = pendingCount > 0;

  // Só mostrar quando há fila pendente ou sincronização em curso — não ocupar espaço quando está tudo em dia.
  if (!hasQueue && !syncing) {
    return null;
  }

  const label = syncing
    ? t("sync.btn_syncing")
    : t("sync.status_pending", { count: pendingCount });

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium",
        hasQueue
          ? "border-amber-500/40 bg-amber-500/12 text-amber-900 dark:text-amber-100"
          : "border-border bg-muted/50 text-muted-foreground",
        !isOnline && hasQueue && "border-amber-500/55 bg-amber-500/[0.17]",
        className,
      )}
    >
      {syncing ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
      ) : (
        <Cloud className="h-3.5 w-3.5 shrink-0 fill-amber-400/85 text-amber-600 dark:fill-amber-500/50 dark:text-amber-300" aria-hidden />
      )}
      <span>{label}</span>
    </div>
  );
}
