import { GraduationCap, Home, Users, Receipt, BookOpen, Presentation, Contact, PersonStanding, UsersRound, CalendarDays, BookMarked, CalendarCheck, Smartphone, BookOpenCheck, BarChart3, Clock, UserCircle, Settings, Package, LogOut, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { NavLink, useLocation } from "react-router-dom";
import { useModules, ModuleKey } from "@/context/ModulesContext";

type Item = { icon: React.ElementType; label: string; to: string; hasArrow?: boolean; moduleKey?: ModuleKey };

const menu: Item[] = [
  { icon: Home, label: "Painel de Controlo", to: "/" },
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
  { icon: CalendarCheck, label: "Eventos", to: "/eventos", moduleKey: "eventos" },
  { icon: Sparkles, label: "Extracurriculares", to: "/extracurriculares", moduleKey: "extracurriculares" },
  { icon: Smartphone, label: "Pedidos", to: "/pedidos", moduleKey: "pedidos" },
  { icon: BookOpenCheck, label: "Material", to: "/material", moduleKey: "material" },
  { icon: BarChart3, label: "Relatórios", to: "/relatorios", moduleKey: "relatorios" },
  { icon: Clock, label: "Timesheet", to: "/timesheet", moduleKey: "timesheet" },
];

const other: Item[] = [
  { icon: UserCircle, label: "Perfil", to: "/perfil" },
  { icon: Settings, label: "Definições", to: "/definicoes" },
  { icon: Package, label: "Módulos", to: "/modulos" },
  { icon: LogOut, label: "Sair", to: "/sair" },
];

export const Sidebar = () => {
  const location = useLocation();
  const { modules } = useModules();
  const visibleMenu = menu.filter((i) => !i.moduleKey || modules[i.moduleKey]);

  const renderItem = (item: Item) => {
    const Icon = item.icon;
    const isActive = location.pathname === item.to;
    return (
      <NavLink
        key={item.label}
        to={item.to}
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
    <aside className="sidebar-scroll hidden lg:flex sticky top-0 w-64 shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar p-5 overflow-y-auto h-screen max-h-screen self-start">
      <div className="flex items-center justify-center gap-1 px-2 pt-2">
        <span className="text-3xl font-extrabold tracking-tight text-foreground">Edu</span>
        <span className="text-3xl font-extrabold tracking-tight text-sidebar-ring">Kamba</span>
      </div>

      <div className="flex flex-col gap-1">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Menu</p>
        {visibleMenu.map(renderItem)}
      </div>

      <div className="mt-auto flex flex-col gap-1">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Outros</p>
        {other.map(renderItem)}
      </div>
    </aside>
  );
};