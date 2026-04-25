import { GraduationCap, LayoutDashboard, Users, UserSquare2, ClipboardCheck, DollarSign, Bell, Calendar, BookOpen, MessageSquare, User, Settings, LogOut, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

type Item = { icon: React.ElementType; label: string; hasArrow?: boolean };

const menu: Item[] = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: GraduationCap, label: "Professores" },
  { icon: Users, label: "Alunos" },
  { icon: UserSquare2, label: "Frequência" },
  { icon: DollarSign, label: "Financeiro", hasArrow: true },
  { icon: Bell, label: "Avisos" },
  { icon: Calendar, label: "Calendário" },
  { icon: BookOpen, label: "Biblioteca" },
  { icon: MessageSquare, label: "Mensagens" },
];

const other: Item[] = [
  { icon: User, label: "Perfil" },
  { icon: Settings, label: "Configurações" },
  { icon: LogOut, label: "Sair" },
];

export const Sidebar = () => {
  const [active, setActive] = useState("Dashboard");

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
    <aside className="hidden lg:flex w-64 shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar p-5">
      <div className="flex items-center gap-2 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pastel-blue text-pastel-blue-foreground">
          <GraduationCap className="h-6 w-6" strokeWidth={2} />
        </div>
        <span className="text-xl font-bold tracking-tight text-foreground">Edukamba</span>
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