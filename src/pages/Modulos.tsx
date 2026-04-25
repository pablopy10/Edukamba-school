import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Search, Package, Eye, EyeOff, RotateCcw, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useModules, moduleMeta, ModuleKey } from "@/context/ModulesContext";

const Modulos = () => {
  const { modules, setModule, setAll, resetDefaults } = useModules();
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(null);

  const showToast = (kind: "success" | "error", msg: string) => {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 2200);
  };

  const list = useMemo(
    () =>
      (Object.keys(moduleMeta) as ModuleKey[])
        .map((k) => ({ key: k, ...moduleMeta[k], enabled: modules[k] }))
        .filter((m) => m.label.toLowerCase().includes(search.toLowerCase()) || m.description.toLowerCase().includes(search.toLowerCase())),
    [modules, search],
  );

  const total = (Object.keys(moduleMeta) as ModuleKey[]).length;
  const enabledCount = (Object.values(modules) as boolean[]).filter(Boolean).length;

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-pastel-blue/40",
        checked ? "bg-pastel-blue" : "bg-muted",
      )}
      aria-pressed={checked}
    >
      <span
        className={cn(
          "absolute left-0 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full border border-border bg-card shadow-soft transition-transform",
          checked ? "translate-x-[20px]" : "-translate-x-[4px]",
        )}
      />
    </button>
  );

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Módulos</h1>
            <p className="text-sm text-muted-foreground">Active ou desactive módulos da plataforma. Os módulos desactivados ficam ocultos no menu lateral.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                type="text"
                placeholder="Pesquisar módulo..."
                className="h-11 w-64 rounded-full border border-border bg-card pl-11 pr-4 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button
              onClick={() => { resetDefaults(); showToast("success", "Módulos repostos."); }}
              className="flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-accent"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={1.75} /> Repor
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl bg-card p-5 shadow-card">
            <span className="inline-block rounded-full bg-pastel-blue px-3 py-1 text-xs font-medium text-pastel-blue-foreground">Total de Módulos</span>
            <p className="mt-3 text-3xl font-bold text-foreground">{total}</p>
          </div>
          <div className="rounded-2xl bg-card p-5 shadow-card">
            <span className="inline-block rounded-full bg-pastel-green px-3 py-1 text-xs font-medium text-pastel-green-foreground">Activos</span>
            <p className="mt-3 text-3xl font-bold text-foreground">{enabledCount}</p>
          </div>
          <div className="rounded-2xl bg-card p-5 shadow-card">
            <span className="inline-block rounded-full bg-pastel-pink px-3 py-1 text-xs font-medium text-pastel-pink-foreground">Inactivos</span>
            <p className="mt-3 text-3xl font-bold text-foreground">{total - enabledCount}</p>
          </div>
          <div className="rounded-2xl bg-card p-5 shadow-card">
            <span className="inline-block rounded-full bg-pastel-yellow px-3 py-1 text-xs font-medium text-pastel-yellow-foreground">Ocupação</span>
            <p className="mt-3 text-3xl font-bold text-foreground">{Math.round((enabledCount / total) * 100)}%</p>
          </div>
        </div>

        {/* Bulk actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Package className="h-4 w-4" strokeWidth={1.75} />
            A mostrar {list.length} de {total} módulos
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setAll(true); showToast("success", "Todos os módulos activados."); }} className="flex h-10 items-center gap-2 rounded-full bg-pastel-green/60 px-4 text-sm font-medium text-pastel-green-foreground transition-colors hover:opacity-90">
              <Eye className="h-4 w-4" strokeWidth={1.75} /> Activar todos
            </button>
            <button onClick={() => { setAll(false); showToast("success", "Todos os módulos desactivados."); }} className="flex h-10 items-center gap-2 rounded-full bg-pastel-pink/60 px-4 text-sm font-medium text-pastel-pink-foreground transition-colors hover:opacity-90">
              <EyeOff className="h-4 w-4" strokeWidth={1.75} /> Desactivar todos
            </button>
          </div>
        </div>

        {/* List */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((m) => (
            <div key={m.key} className={cn(
              "flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-card transition-colors",
              m.enabled ? "border-border" : "border-border opacity-70",
            )}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", m.enabled ? "bg-pastel-blue text-pastel-blue-foreground" : "bg-muted text-muted-foreground")}>
                      <Package className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                    <h3 className="font-semibold text-foreground">{m.label}</h3>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{m.description}</p>
                  <p className="mt-2 text-[11px] font-mono text-muted-foreground">{m.path}</p>
                </div>
                <Toggle checked={m.enabled} onChange={(v) => { setModule(m.key, v); showToast("success", `${m.label} ${v ? "activado" : "desactivado"}.`); }} />
              </div>
              <div className="mt-1">
                <span className={cn("inline-block rounded-full px-2.5 py-1 text-[11px] font-medium", m.enabled ? "bg-pastel-green text-pastel-green-foreground" : "bg-pastel-pink text-pastel-pink-foreground")}>
                  {m.enabled ? "Activo" : "Inactivo"}
                </span>
              </div>
            </div>
          ))}
        </div>

        {list.length === 0 && (
          <div className="rounded-2xl bg-card p-10 text-center shadow-card">
            <p className="text-sm text-muted-foreground">Nenhum módulo corresponde à pesquisa.</p>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className={cn(
            "fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-card",
            toast.kind === "success" ? "bg-pastel-green text-pastel-green-foreground" : "bg-pastel-pink text-pastel-pink-foreground",
          )}>
            {toast.kind === "success" ? <Check className="h-4 w-4" strokeWidth={2} /> : <AlertCircle className="h-4 w-4" strokeWidth={2} />}
            {toast.msg}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Modulos;
