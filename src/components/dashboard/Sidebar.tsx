import type { ElementType } from "react";
import { GraduationCap, Home, Users, Receipt, BookOpen, Presentation, Contact, PersonStanding, UsersRound, CalendarDays, BookMarked, Table2, CalendarCheck, Smartphone, BookOpenCheck, BarChart3, Clock, UserCircle, Settings, Package, LogOut, ChevronRight, Sparkles, TrendingUp, Bus, FolderOpen, Landmark, Utensils, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useModules, ModuleKey } from "@/context/ModulesContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { useSchoolPermissionMatrix } from "@/hooks/useSchoolPermissionMatrix";
import type { PermissionModuleKey } from "@/lib/schoolPermissionModules";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { EdukambaWordmark } from "@/components/branding/EdukambaWordmark";
import { isDashboardRouteBlockedOnNative, isNativeMobileApp } from "@/lib/nativeApp";
import {
  canOpenDefinicoesPage,
  canOpenModulosPage,
  isNavPathAllowedForRole,
} from "@/lib/staffNavAccess";
import { useTranslation } from "react-i18next";

export type NavItem = { icon: ElementType; labelKey: string; to: string; hasArrow?: boolean; moduleKey?: ModuleKey };

const menu: NavItem[] = [
  { icon: Home, labelKey: "nav.dashboard", to: "/dashboard" },
  { icon: GraduationCap, labelKey: "nav.teachers", to: "/professores", moduleKey: "professores" },
  { icon: Users, labelKey: "nav.students", to: "/alunos", moduleKey: "alunos" },
  { icon: Receipt, labelKey: "nav.enrollments", to: "/matriculas", moduleKey: "matriculas" },
  { icon: BookOpen, labelKey: "nav.courses", to: "/cursos", moduleKey: "cursos" },
  { icon: Presentation, labelKey: "nav.classes", to: "/turmas", moduleKey: "turmas" },
  { icon: Contact, labelKey: "nav.subjects", to: "/disciplinas", moduleKey: "disciplinas" },
  { icon: PersonStanding, labelKey: "nav.guardians", to: "/educadores", moduleKey: "educadores" },
  { icon: UsersRound, labelKey: "nav.attendance", to: "/presencas", moduleKey: "presencas" },
  { icon: CalendarDays, labelKey: "nav.timetable", to: "/horario", moduleKey: "horario" },
  { icon: BookMarked, labelKey: "nav.assessments", to: "/avaliacoes", moduleKey: "avaliacoes" },
  { icon: Table2, labelKey: "nav.grades", to: "/notas", moduleKey: "notas" },
  { icon: CalendarCheck, labelKey: "nav.events", to: "/eventos", moduleKey: "eventos" },
  { icon: Landmark, labelKey: "nav.tuition", to: "/propinas", moduleKey: "propinas" },
  { icon: Sparkles, labelKey: "nav.extracurricular", to: "/extracurriculares", moduleKey: "extracurriculares" },
  { icon: Bus, labelKey: "nav.transport", to: "/transportes", moduleKey: "transportes" },
  { icon: Utensils, labelKey: "nav.meals", to: "/refeicoes", moduleKey: "refeicoes" },
  { icon: Smartphone, labelKey: "nav.requests", to: "/pedidos", moduleKey: "pedidos" },
  { icon: BookOpenCheck, labelKey: "nav.materials", to: "/material", moduleKey: "material" },
  { icon: FolderOpen, labelKey: "nav.documents", to: "/documentos", moduleKey: "documentos" },
  { icon: TrendingUp, labelKey: "nav.finance", to: "/financas", moduleKey: "financas" },
  { icon: BarChart3, labelKey: "nav.reports", to: "/relatorios", moduleKey: "relatorios" },
  { icon: Clock, labelKey: "nav.timesheet", to: "/timesheet", moduleKey: "timesheet" },
];

const other: NavItem[] = [
  { icon: UserCircle, labelKey: "nav.profile", to: "/perfil" },
  { icon: Settings, labelKey: "nav.settings", to: "/definicoes" },
  { icon: Package, labelKey: "nav.modules", to: "/modulos" },
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
  const { t } = useTranslation("common");
  const location = useLocation();
  const navigate = useNavigate();
  const { modules } = useModules();
  const { role, loading: roleLoading } = useUserRole();
  const { canReadModule } = useSchoolPermissionMatrix();

  const native = isNativeMobileApp();

  const visibleMenu = menu.filter((item) => {
    if (native && isDashboardRouteBlockedOnNative(item.to)) return false;
    if (item.moduleKey && !modules[item.moduleKey]) return false;
    if (roleLoading || role === null) return false;
    if (!isNavPathAllowedForRole(role, item.to)) return false;
    if (item.moduleKey && !canReadModule(item.moduleKey as PermissionModuleKey)) return false;
    return true;
  });

  const visibleOther = other.filter((item) => {
      if (native && isDashboardRouteBlockedOnNative(item.to)) return false;
      if (roleLoading || role === null) return false;
      if (item.to === "/perfil") return isNavPathAllowedForRole(role, "/perfil");
      if (item.to === "/definicoes") return canOpenDefinicoesPage(role);
      if (item.to === "/modulos")
        return canOpenModulosPage(role) && canReadModule("modulos" as PermissionModuleKey);
      return isNavPathAllowedForRole(role, item.to);
    });

  const superAdminNav: NavItem[] =
    !roleLoading && role === "SUPER_ADMIN"
      ? [{ icon: Shield, labelKey: "nav.super_dashboard", to: "/super" }]
      : [];

  const bottomNavItems = [...superAdminNav, ...visibleOther];

  const handleLogout = async () => {
    onNavigate?.();
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Logout error", e);
    } finally {
      navigate("/", { replace: true });
      toast.success(t("nav.session_ended"));
    }
  };

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = routeMatchesSidebar(location.pathname, item.to);
    return (
      <NavLink
        key={item.to}
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
        <span className="flex-1 text-left">{t(item.labelKey)}</span>
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
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("nav.section_menu")}</p>
        {roleLoading || role === null
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={`menu-skel-${i}`} className="mx-1 my-1 h-9 animate-pulse rounded-xl bg-sidebar-accent/40" />
            ))
          : visibleMenu.map(renderItem)}
      </div>

      <div className="mt-auto flex flex-col gap-1">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("nav.section_other")}</p>
        {roleLoading || role === null
          ? Array.from({ length: 2 }).map((_, i) => (
              <div key={`other-skel-${i}`} className="mx-1 my-1 h-9 animate-pulse rounded-xl bg-sidebar-accent/40" />
            ))
          : bottomNavItems.map(renderItem)}
        <button
          type="button"
          onClick={handleLogout}
          className={cn(
            "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-[var(--transition-smooth)]",
            "text-sidebar-foreground hover:bg-sidebar-accent",
          )}
        >
          <LogOut className="h-5 w-5 shrink-0" strokeWidth={1.75} />
          <span className="flex-1 text-left">{t("nav.logout")}</span>
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
}) => {
  const { t } = useTranslation("common");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        overlayClassName="z-[110]"
        className="sidebar-scroll z-[110] flex w-[min(100vw,22rem)] flex-col overflow-y-auto border-sidebar-border bg-sidebar p-0 pt-12"
      >
        <SheetTitle className="sr-only">{t("nav.sheet_title")}</SheetTitle>
        <SidebarNavigation onNavigate={() => onOpenChange(false)} scrollClassName="flex-1 px-5 pb-8" />
      </SheetContent>
    </Sheet>
  );
};
