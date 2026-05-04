import type { ElementType } from "react";
import { GraduationCap, Home, Users, Receipt, BookOpen, Presentation, Contact, PersonStanding, UsersRound, CalendarDays, BookMarked, Table2, CalendarCheck, Smartphone, BookOpenCheck, BarChart3, Clock, UserCircle, Settings, Package, LogOut, ChevronRight, Sparkles, Wallet, TrendingUp, Bus } from "lucide-react";
import { cn } from "@/lib/utils";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useModules, ModuleKey } from "@/context/ModulesContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { EdukambaWordmark } from "@/components/branding/EdukambaWordmark";
import { isDashboardRouteBlockedOnNative, isNativeMobileApp } from "@/lib/nativeApp";
import {
  canOpenDefinicoesPage,
  canOpenModulosPage,
  isNavPathAllowedForRole,
} from "@/lib/staffNavAccess";

export type NavItem = { icon: ElementType; label: string; to: string; hasArrow?: boolean; moduleKey?: ModuleKey };

const menu: NavItem[] = [
  { icon: Home, label: "Painel de Controlo", to: "/dashboard" },
  { icon: GraduationCap, label: "Professores", to: "/professores", moduleKey: "professores" },
  { icon: Users, label: "Alunos", to: "/alunos", moduleKey: "alunos" },
  { icon: Receipt, label: "Matrículas", to: "/matriculas", moduleKey: "matriculas" },
  { icon: BookOpen, label: "Cursos", to: "/cursos", moduleKey: "cursos" },
  { icon: Presentation, label: "Turmas", to: "/turmas", moduleKey: "turmas" },
  { icon: Contact, label: "Disciplinas", to: "/disciplinas", moduleKey: "disciplinas" },
  { icon: PersonStanding, label: "Educadores", to: "/educadores", moduleKey: "educadores" },
  { icon: UsersRound, label: "Presenças", to: "/presencas", moduleKey: "presencas" },
  { icon: CalendarDays, label: "Horário", to: "/horario", moduleKey: "horario" },
  { icon: BookMarked, label: "Avaliações", to: "/avaliacoes", moduleKey: "avaliacoes" },
  { icon: Table2, label: "Notas", to: "/notas", moduleKey: "notas" },
  { icon: CalendarCheck, label: "Eventos", to: "/eventos", moduleKey: "eventos" },
  { icon: Sparkles, label: "Extracurriculares", to: "/extracurriculares", moduleKey: "extracurriculares" },
  { icon: Bus, label: "Transporte", to: "/transportes", moduleKey: "transportes" },
  { icon: Smartphone, label: "Pedidos", to: "/pedidos", moduleKey: "pedidos" },
  { icon: BookOpenCheck, label: "Material", to: "/material", moduleKey: "material" },
  { icon: Wallet, label: "Pagamentos", to: "/pagamentos", moduleKey: "pagamentos" },
  { icon: TrendingUp, label: "Finanças", to: "/financas", moduleKey: "financas" },
  { icon: BarChart3, label: "Relatórios", to: "/relatorios", moduleKey: "relatorios" },
  { icon: Clock, label: "Timesheet", to: "/timesheet", moduleKey: "timesheet" },
];

const other: NavItem[] = [
  { icon: UserCircle, label: "Perfil", to: "/perfil" },
  { icon: Settings, label: "Definições", to: "/definicoes" },
  { icon: Package, label: "Módulos", to: "/modulos" },
];

function routeMatchesSidebar(pathname: string, to: string): boolean {
  if (to === "/dashboard") return pathname === "/dashboard" || pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

function SidebarNavigation({
  onNavigate,
  scrollClassName,
}: {
  onNavigate?: () => void;
  scrollClassName?: string;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { modules } = useModules();
  const { role, loading: roleLoading } = useUserRole();

  const native = isNativeMobileApp();

  const visibleMenu = menu.filter((item) => {
    if (native && isDashboardRouteBlockedOnNative(item.to)) return false;
    if (item.moduleKey && !modules[item.moduleKey]) return false;
    if (roleLoading || role === null) return false;
    return isNavPathAllowedForRole(role, item.to);
  });

  const visibleOther = other.filter((item) => {
    if (native && isDashboardRouteBlockedOnNative(item.to)) return false;
    if (roleLoading || role === null) return false;
    if (item.to === "/perfil") return isNavPathAllowedForRole(role, "/perfil");
    if (item.to === "/definicoes") return canOpenDefinicoesPage(role);
    if (item.to === "/modulos") return canOpenModulosPage(role);
    return isNavPathAllowedForRole(role, item.to);
  });

  const handleLogout = async () => {
    onNavigate?.();
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Logout error", e);
    } finally {
      navigate("/", { replace: true });
      toast.success("Sessão terminada");
    }
  };

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = routeMatchesSidebar(location.pathname, item.to);
    return (
      <NavLink
        key={item.label}
        to={item.to}
        onClick={() => onNavigate?.()}
        className={cn(
          "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-[var(--transition-smooth)]",
          isActive
            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-soft"
            : "text-sidebar-foreground hover:bg-sidebar-accent",
        )}
      >
        <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
        <span className="flex-1 text-left">{item.label}</span>
        {item.hasArrow && <ChevronRight className="h-4 w-4 opacity-60" />}
      </NavLink>
    );
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-6", scrollClassName)}>
      <div className="flex items-center justify-center px-2 pt-2">
        <EdukambaWordmark />
      </div>

      <div className="flex flex-col gap-1">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Menu</p>
        {roleLoading || role === null
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={`menu-skel-${i}`} className="mx-1 my-1 h-9 animate-pulse rounded-xl bg-sidebar-accent/40" />
            ))
          : visibleMenu.map(renderItem)}
      </div>

      <div className="mt-auto flex flex-col gap-1">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Outros</p>
        {roleLoading || role === null
          ? Array.from({ length: 2 }).map((_, i) => (
              <div key={`other-skel-${i}`} className="mx-1 my-1 h-9 animate-pulse rounded-xl bg-sidebar-accent/40" />
            ))
          : visibleOther.map(renderItem)}
        <button
          type="button"
          onClick={handleLogout}
          className={cn(
            "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-[var(--transition-smooth)]",
            "text-sidebar-foreground hover:bg-sidebar-accent",
          )}
        >
          <LogOut className="h-5 w-5 shrink-0" strokeWidth={1.75} />
          <span className="flex-1 text-left">Sair</span>
        </button>
      </div>
    </div>
  );
}

export const Sidebar = () => {
  return (
    <aside className="sidebar-scroll sticky top-0 hidden h-screen max-h-screen w-64 shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar p-5 lg:flex lg:flex-col">
      <SidebarNavigation scrollClassName="flex-1" />
    </aside>
  );
};

export const SidebarMobileDrawer = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent
      side="left"
      overlayClassName="z-[110]"
      className="sidebar-scroll z-[110] flex w-[min(100vw,22rem)] flex-col overflow-y-auto border-sidebar-border bg-sidebar p-0 pt-12"
    >
      <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
      <SidebarNavigation onNavigate={() => onOpenChange(false)} scrollClassName="flex-1 px-5 pb-8" />
    </SheetContent>
  </Sheet>
);
