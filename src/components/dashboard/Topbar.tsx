import { useEffect, useState } from "react";
import { Search, MessageSquare, Bell, Clock, CalendarDays, Baby } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { useSelectedChild } from "@/context/SelectedChildContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Administrador",
  TEACHER: "Professor",
  PARENT: "Encarregado",
  STUDENT: "Aluno",
};

const initialsOf = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("") || "?";

export const Topbar = () => {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const { user } = useAuth();
  const { years, selectedYearId, setSelectedYearId } = useAcademicYear();
  const { isParent, children: kids, selectedChildId, setSelectedChildId } = useSelectedChild();
  const [profile, setProfile] = useState<{ full_name: string; role: string | null; avatar_url: string | null } | null>(null);
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("full_name, role, avatar_url, school_id")
      .eq("id", user.id)
      .maybeSingle()
      .then(async ({ data }) => {
        if (!cancelled && data) setProfile(data);
        if (!cancelled && data?.school_id) {
          const { data: school } = await supabase
            .from("schools")
            .select("trial_ends_at, subscription_status")
            .eq("id", data.school_id)
            .maybeSingle();
          if (!cancelled && school && school.subscription_status === "trialing") {
            const ms = new Date(school.trial_ends_at).getTime() - Date.now();
            const days = Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
            setTrialDaysLeft(days);
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    navigate(`/pesquisa?q=${encodeURIComponent(term)}`);
  };

  const displayName = profile?.full_name ?? user?.email ?? "";
  const displayRole = profile?.role ? roleLabels[profile.role] ?? profile.role : "";
  const avatarUrl = profile?.avatar_url ?? "";

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <form onSubmit={submit} className="relative w-full max-w-md" role="search">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar..."
          className="h-11 w-full rounded-full border border-border bg-card pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </form>

      <div className="flex items-center gap-3">
        {isParent && kids.length > 0 && (
          <div className="hidden items-center md:flex" title="Filho(a) em consulta">
            <Select
              value={selectedChildId ?? undefined}
              onValueChange={(v) => setSelectedChildId(v)}
            >
              <SelectTrigger className="h-11 w-auto gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-soft hover:bg-accent">
                <Baby className="h-4 w-4 text-pastel-pink-foreground" strokeWidth={1.75} />
                <SelectValue placeholder="Filho(a)" />
              </SelectTrigger>
              <SelectContent>
                {kids.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}
                    {c.classroom_name ? ` · ${c.classroom_name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {years.length > 0 && (
          <div className="hidden items-center md:flex" title="Ano letivo em gestão">
            <Select value={selectedYearId ?? undefined} onValueChange={setSelectedYearId}>
              <SelectTrigger className="h-11 w-auto gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-soft hover:bg-accent">
                <CalendarDays className="h-4 w-4 text-pastel-blue-foreground" strokeWidth={1.75} />
                <SelectValue placeholder="Ano letivo" />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.label}
                    {y.is_active ? " · ativo" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {trialDaysLeft !== null && (
          <div
            className={`hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium shadow-soft md:flex ${
              trialDaysLeft <= 7
                ? "bg-destructive/10 text-destructive"
                : "bg-pastel-yellow text-pastel-yellow-foreground"
            }`}
            title="Período de avaliação"
          >
            <Clock className="h-3.5 w-3.5" />
            {trialDaysLeft === 0
              ? "Trial termina hoje"
              : `${trialDaysLeft} ${trialDaysLeft === 1 ? "dia" : "dias"} de trial`}
          </div>
        )}
        <Link
          to="/chat"
          aria-label="Chat"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-accent"
        >
          <MessageSquare className="h-5 w-5" strokeWidth={1.75} />
        </Link>
        <Link
          to="/notificacoes"
          aria-label="Notificações"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-accent"
        >
          <Bell className="h-5 w-5" strokeWidth={1.75} />
        </Link>
        <Link to="/perfil" className="flex items-center gap-3 pl-2 transition-opacity hover:opacity-80">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold text-foreground">{displayName || "—"}</p>
            {displayRole && <p className="text-xs text-muted-foreground">{displayRole}</p>}
          </div>
          <div className="relative">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="h-11 w-11 rounded-full object-cover shadow-soft"
              />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-lilac text-sm font-bold text-pastel-lilac-foreground shadow-soft">
                {initialsOf(displayName)}
              </div>
            )}
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-success" />
          </div>
        </Link>
      </div>
    </header>
  );
};