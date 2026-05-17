import { NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import {
  Building2,
  FileText,
  Gauge,
  LayoutGrid,
  Loader2,
  LogOut,
  ScrollText,
  Shield,
  Workflow,
} from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function SidebarNav({
  compact,
}: {
  /** Em ecrãs pequenos: só ícone + texto curto opcional na mesma linha */
  compact?: boolean;
}) {
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
      isActive
        ? "bg-pastel-blue/25 text-pastel-blue-foreground ring-1 ring-pastel-blue/35"
        : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
      compact && "shrink-0 whitespace-nowrap",
    );

  return (
    <nav className={cn("flex gap-1", compact ? "flex-row overflow-x-auto pb-1 pt-1" : "flex-col")}>
      <NavLink to="/super" end className={linkCls}>
        <Gauge className="h-4 w-4 shrink-0 opacity-90" />
        {!compact ? <span>Resumo</span> : <span className="pr-2">Indicadores</span>}
      </NavLink>
      <NavLink to="/super/escolas" className={linkCls}>
        <Building2 className="h-4 w-4 shrink-0 opacity-90" />
        {!compact ? <span>Escolas</span> : <span className="pr-2">Escolas</span>}
      </NavLink>
      <NavLink to="/super/crm" className={linkCls}>
        <Workflow className="h-4 w-4 shrink-0 opacity-90" />
        {!compact ? <span>CRM (leads)</span> : <span className="pr-2">CRM</span>}
      </NavLink>
      <NavLink to="/super/propostas" className={linkCls}>
        <FileText className="h-4 w-4 shrink-0 opacity-90" />
        {!compact ? <span>Propostas</span> : <span className="pr-2">Propostas</span>}
      </NavLink>
      <NavLink to="/super/auditoria" className={linkCls}>
        <ScrollText className="h-4 w-4 shrink-0 opacity-90" />
        {!compact ? <span>Auditoria</span> : <span className="pr-2">Audit</span>}
      </NavLink>
    </nav>
  );
}

/**
 * Consola de gestão da plataforma Edukamba (SUPER_ADMIN): indicadores globais,
 * escolas/módulos, CRM, propostas e modo suporte numa escola — separado do
 * painel diário das escolas.
 */
export function SuperAdminPortal() {
  const { role, loading } = useUserRole();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Logout error", e);
    } finally {
      navigate("/", { replace: true });
      toast.success("Sessão terminada");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  if (role !== "SUPER_ADMIN") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex min-h-screen w-full bg-gradient-to-br from-muted/50 via-background to-pastel-blue/[0.07] font-sans text-foreground">
      {/* Desktop: navegação fixa */}
      <aside className="hidden w-[260px] shrink-0 flex-col border-r border-border/70 bg-card/85 backdrop-blur-sm lg:flex">
        <div className="flex h-full flex-col gap-6 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pastel-blue text-pastel-blue-foreground shadow-soft">
              <Shield className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <LayoutGrid className="h-3 w-3" aria-hidden />
                Plataforma
              </div>
              <p className="font-bold leading-tight text-foreground">Dashboard de gestão</p>
              <p className="mt-1 text-xs leading-snug text-muted-foreground">
                Gerir todas as escolas Edukamba, vendas e suporte — não é o painel quotidiano de uma escola.
              </p>
            </div>
          </div>

          <SidebarNav />

          <Separator className="opacity-70" />

          <div className="mt-auto">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-2 rounded-xl"
              onClick={() => void handleLogout()}
            >
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </aside>

      {/* Conteúdo + mobile header */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-pastel-blue text-pastel-blue-foreground">
                <Shield className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gestão plataforma</p>
                <p className="truncate text-sm font-bold">Edukamba</p>
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" className="shrink-0 gap-2 rounded-full" onClick={() => void handleLogout()}>
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
          <div className="border-t border-border/50 px-2">
            <SidebarNav compact />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:max-w-none lg:px-10 lg:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default SuperAdminPortal;
