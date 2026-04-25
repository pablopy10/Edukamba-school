import { GraduationCap, Home, Users, Receipt, BookOpen, Presentation, Contact, PersonStanding, UsersRound, CalendarDays, BookMarked, CalendarCheck, Smartphone, BookOpenCheck, BarChart3, Clock, UserCircle, Settings, Package, LogOut, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

type Item = { icon: React.ElementType; label: string; hasArrow?: boolean };

const menu: Item[] = [
  { icon: Home, label: "Painel de Controlo" },
  { icon: GraduationCap, label: "Professores" },
  { icon: Users, label: "Alunos" },
  { icon: Receipt, label: "Matrículas" },
  { icon: BookOpen, label: "Cursos" },
  { icon: Presentation, label: "Turmas" },
  { icon: Contact, label: "Disciplinas" },
  { icon: PersonStanding, label: "Educadores" },
  { icon: UsersRound, label: "Presenças" },
  { icon: CalendarDays, label: "Horário" },
  { icon: BookMarked, label: "Avaliações" },
  { icon: CalendarCheck, label: "Eventos" },
  { icon: Smartphone, label: "Pedidos" },
  { icon: BookOpenCheck, label: "Material" },
  { icon: BarChart3, label: "Relatórios" },
  { icon: Clock, label: "Timesheet" },
];

const other: Item[] = [
  { icon: UserCircle, label: "Perfil" },
  { icon: Settings, label: "Definições" },
  { icon: Package, label: "Módulos" },
  { icon: LogOut, label: "Sair" },
];

export const Sidebar = () => {
  const [active, setActive] = useState("Painel de Controlo");

  const renderItem = (item: Item) => {
    const Icon = item.icon;
    const isActive = active === item.label;
    return (
      <button
        key={item.label}
        onClick={() => setActive(item.label)}
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
      </button>
    );
  };

  return (
    <aside className="sidebar-scroll hidden lg:flex sticky top-0 w-64 shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar p-5 overflow-y-auto h-screen max-h-screen self-start">
      <div className="flex items-center justify-center gap-1 px-2 pt-2">
        <span className="text-3xl font-extrabold tracking-tight text-foreground">Edu</span>
        <span className="text-3xl font-extrabold tracking-tight text-pastel-blue-foreground">Kamba</span>
      </div>

      <div className="flex flex-col gap-1">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Menu</p>
        {menu.map(renderItem)}
      </div>

      <div className="mt-auto flex flex-col gap-1">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Outros</p>
        {other.map(renderItem)}
      </div>
    </aside>
  );
};