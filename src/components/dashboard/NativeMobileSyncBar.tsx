import { CheckCircle2, CloudUpload, Loader2, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNativeMobileApp } from "@/lib/nativeApp";
import { useSyncManager } from "@/hooks/useOfflineSync";

/**
 * Barra global de estado de sincronização (só Capacitor iOS/Android).
 * Verde: atualizado · Amarelo + contagem: pendente · Vermelho: offline.
 */
export function NativeMobileSyncBar() {
  if (!isNativeMobileApp()) return null;

  const { syncUiState, pendingCount, syncing, isOnline } = useSyncManager();

  let icon = <CheckCircle2 className="h-4 w-4 shrink-0 text-pastel-green-foreground" strokeWidth={2} />;
  let title = "Tudo atualizado";
  let desc = "Dados sincronizados.";
  let barCls = "border-pastel-green/40 bg-pastel-green/15 text-foreground";

  if (!isOnline) {
    icon = <WifiOff className="h-4 w-4 shrink-0 text-destructive" strokeWidth={2} />;
    title = "Sem ligação";
    desc =
      pendingCount > 0
        ? `As alterações serão gravadas localmente (${pendingCount} ${pendingCount === 1 ? "pendente" : "pendentes"} na fila).`
        : "As alterações serão gravadas localmente e enviadas quando voltar o acesso.";
    barCls = "border-destructive/35 bg-destructive/10 text-foreground";
  } else if (pendingCount > 0) {
    icon = syncing ? (
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-pastel-yellow-foreground" />
    ) : (
      <CloudUpload className="h-4 w-4 shrink-0 text-pastel-yellow-foreground" strokeWidth={2} />
    );
    title =
      pendingCount === 1
        ? "1 alteração pendente para enviar"
        : `${pendingCount} alterações pendentes para enviar`;
    desc = syncing ? "A sincronizar com o servidor…" : "Liga-te à rede para concluir o envio.";
    barCls = "border-pastel-yellow/45 bg-pastel-yellow/20 text-foreground";
  }

  return (
    <div
      className={cn(
        "mb-4 flex gap-3 rounded-2xl border px-4 py-3 text-sm shadow-soft transition-[var(--transition-smooth)]",
        barCls,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2 font-semibold leading-tight">
          <span>{title}</span>
          {pendingCount > 0 && isOnline ? (
            <span className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full bg-pastel-yellow px-2 text-xs font-bold text-pastel-yellow-foreground">
              {pendingCount}
            </span>
          ) : null}
        </div>
        <p className="text-xs leading-snug text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}
