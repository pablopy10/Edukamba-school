import { NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, Gauge, Loader2, Presentation, Shield, Workflow } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function NavChip({ to, end, icon: Icon, label }: { to: string; end?: boolean; icon: typeof Shield; label: string }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
          isActive
            ? "border-pastel-blue-foreground bg-pastel-blue/35 text-pastel-blue-foreground"
            : "border-border bg-card text-muted-foreground hover:bg-muted/60",
        )
      }
    >
      <Icon className="h-4 w-4" />
      {label}
    </NavLink>
  );
}

/** Shell interno apenas para SUPER_ADMIN (Edukamba). Sub-rotas vêm via `<Outlet />`. */
export function SuperAdminPortal() {
  const { role, loading } = useUserRole();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (role !== "SUPER_ADMIN") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-muted/70 via-background to-pastel-blue/10 pb-14">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pastel-blue text-pastel-blue-foreground shadow-soft">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Edukamba</p>
              <p className="text-lg font-bold leading-tight text-foreground">Área SaaS (super‑admin)</p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-2 rounded-full" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4" /> Painel aplicacional
          </Button>
          <nav className="flex w-full flex-wrap gap-2 border-t border-border/50 pt-3">
            <NavChip to="/super" icon={Gauge} label="Resumo" end />
            <NavChip to="/super/escolas" icon={Presentation} label="Escolas / módulos" />
            <NavChip to="/super/crm" icon={Workflow} label="CRM" />
            <NavChip to="/super/propostas" icon={FileText} label="Propostas" />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

export default SuperAdminPortal;
