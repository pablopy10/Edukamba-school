import type { ElementType } from "react";
import { Home, UsersRound, CalendarDays, BookMarked, BookOpenCheck, Smartphone } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useModules, ModuleKey } from "@/context/ModulesContext";
import { useUserRole, UserRole } from "@/hooks/useUserRole";
import { isSchoolManagementRole } from "@/lib/schoolStaffRoles";

type NavItem = {
  icon: ElementType;
  label: string;
  to: string;
  moduleKey?: ModuleKey;
};

const bottomNavItems: NavItem[] = [
  { icon: Home, label: "Painel", to: "/dashboard" },
  { icon: UsersRound, label: "Presenças", to: "/presencas", moduleKey: "presencas" },
  { icon: CalendarDays, label: "Horário", to: "/horario", moduleKey: "horario" },
  { icon: BookMarked, label: "Avaliações", to: "/avaliacoes", moduleKey: "avaliacoes" },
  { icon: BookOpenCheck, label: "Material", to: "/material", moduleKey: "material" },
  { icon: Smartphone, label: "Pedidos", to: "/pedidos", moduleKey: "pedidos" },
];

/** Igual à Sidebar: rotas permitidas por perfil (Admin/SuperAdmin ignorado aqui). */
const roleAllowedRoutes: Record<Exclude<UserRole, null | "ADMIN" | "SUPER_ADMIN">, string[]> = {
  TEACHER: ["/dashboard", "/alunos", "/turmas", "/avaliacoes", "/presencas", "/horario", "/material", "/pedidos", "/eventos", "/educadores"],
  PARENT: ["/dashboard", "/alunos", "/avaliacoes", "/pagamentos", "/horario", "/matriculas", "/eventos", "/presencas", "/material", "/professores"],
  STUDENT: ["/dashboard", "/presencas", "/horario", "/avaliacoes", "/eventos", "/material"],
};

function routeActive(pathname: string, itemPath: string): boolean {
  if (itemPath === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/";
  }
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

export const MobileBottomNav = () => {
  const location = useLocation();
  const { modules } = useModules();
  const { role, loading } = useUserRole();

  const isPrivileged = role === "SUPER_ADMIN" || (role != null && isSchoolManagementRole(role));

  if (loading || role === null) {
    return (
      <nav
        aria-hidden="true"
        className="pointer-events-auto fixed bottom-0 left-0 right-0 z-[100] border-t border-border bg-card/95 backdrop-blur-md lg:hidden"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex justify-around px-1 pb-2 pt-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="h-9 w-9 animate-pulse rounded-xl bg-muted" />
              <div className="h-2 w-10 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </nav>
    );
  }

  const visible = bottomNavItems.filter((item) => {
    if (item.moduleKey && !modules[item.moduleKey]) return false;
    if (isPrivileged) return true;
    const allowed = roleAllowedRoutes[role as Exclude<UserRole, null | "ADMIN" | "SUPER_ADMIN">] ?? [];
    return allowed.includes(item.to);
  });

  if (visible.length === 0) return null;

  return (
    <nav
      className="pointer-events-auto fixed bottom-0 left-0 right-0 z-[100] border-t border-border bg-card/95 shadow-[0_-4px_24px_rgba(15,23,42,0.06)] backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "max(0.35rem, env(safe-area-inset-bottom))" }}
      aria-label="Navegação principal"
    >
      <div className="mx-auto flex max-w-[1600px] justify-evenly gap-0 px-0 pb-1 pt-1">
        {visible.map((item) => {
          const Icon = item.icon;
          const active = routeActive(location.pathname, item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "relative z-[1] flex min-h-[52px] min-w-0 flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-2 transition-[var(--transition-smooth)] active:opacity-90",
                active ? "text-pastel-blue-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-[var(--transition-smooth)]",
                  active ? "bg-pastel-blue text-pastel-blue-foreground shadow-soft" : "bg-transparent",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2 : 1.75} />
              </span>
              <span className="max-w-full truncate px-0.5 text-center text-[10px] font-semibold leading-tight sm:text-[11px]">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
