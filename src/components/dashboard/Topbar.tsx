import { useEffect, useRef, useState } from "react";
import {
  Search,
  MessageSquare,
  Bell,
  Clock,
  CalendarDays,
  Baby,
  Cloud,
  Menu,
  Wifi,
  WifiOff,
} from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { cn } from "@/lib/utils";
import { isNativeMobileApp } from "@/lib/nativeApp";
import { EdukambaWordmark } from "@/components/branding/EdukambaWordmark";

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

const nativeIconBtn =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-accent active:scale-[0.98] [&_svg]:h-[1.15rem] [&_svg]:w-[1.15rem]";

export const Topbar = ({ onOpenMobileMenu }: { onOpenMobileMenu?: () => void }) => {
  const native = isNativeMobileApp();
  const { pendingCount, isOnline } = useOfflineSync();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { years, selectedYearId, setSelectedYearId } = useAcademicYear();
  const { isParent, children: kids, selectedChildId, setSelectedChildId } = useSelectedChild();
  const [profile, setProfile] = useState<{ full_name: string; role: string | null; avatar_url: string | null } | null>(
    null,
  );
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

  useEffect(() => {
    if (!native || !searchOpen) return;
    const t = window.setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [native, searchOpen]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    navigate(`/pesquisa?q=${encodeURIComponent(term)}`);
    setSearchOpen(false);
  };

  const displayName = profile?.full_name ?? user?.email ?? "";
  const displayRole = profile?.role ? roleLabels[profile.role] ?? profile.role : "";
  const avatarUrl = profile?.avatar_url ?? "";

  const connectivityTitle = !isOnline
    ? "Sem ligação à Internet"
    : pendingCount > 0
      ? `${pendingCount} alteração(ões) por sincronizar`
      : "Ligado · sincronizado";

  if (native) {
    return (
      <header className="flex flex-col gap-4">
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {!!onOpenMobileMenu && (
              <button
                type="button"
                className={cn(nativeIconBtn)}
                aria-label="Abrir menu"
                onClick={onOpenMobileMenu}
              >
                <Menu strokeWidth={1.75} />
              </button>
            )}
            <Link
              to="/dashboard"
              className="min-w-0 shrink touch-manipulation"
              aria-label="Edukamba — Painel"
            >
              <EdukambaWordmark className="block truncate leading-none" />
            </Link>
          </div>

          <div className="flex max-w-[min(100%,22rem)] shrink-0 flex-nowrap items-center justify-end gap-1">
            <button
              type="button"
              className={cn(nativeIconBtn)}
              aria-label="Pesquisar"
              onClick={() => setSearchOpen(true)}
            >
              <Search strokeWidth={1.75} />
            </button>

            <div
              className={cn(
                "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-soft",
                !isOnline && "bg-muted text-muted-foreground",
                isOnline &&
                  pendingCount > 0 &&
                  "bg-pastel-yellow text-pastel-yellow-foreground",
                isOnline &&
                  pendingCount === 0 &&
                  "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
              )}
              title={connectivityTitle}
              role="status"
              aria-live="polite"
            >
              {!isOnline ? (
                <WifiOff className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.75} aria-hidden />
              ) : (
                <Wifi className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.75} aria-hidden />
              )}
              {pendingCount > 0 && (
                <span
                  className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-600 px-0.5 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-card"
                  aria-hidden
                >
                  {pendingCount > 9 ? "9+" : pendingCount}
                </span>
              )}
            </div>

            <Link to="/chat" aria-label="Chat" className={cn(nativeIconBtn)}>
              <MessageSquare strokeWidth={1.75} />
            </Link>
            <Link to="/notificacoes" aria-label="Notificações" className={cn(nativeIconBtn)}>
              <Bell strokeWidth={1.75} />
            </Link>
            <Link
              to="/perfil"
              aria-label="Perfil"
              className="flex shrink-0 touch-manipulation items-center justify-center rounded-full transition-opacity hover:opacity-80"
            >
              <div className="relative">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-10 w-10 rounded-full border border-border object-cover shadow-soft"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-gradient-lilac text-sm font-bold text-pastel-lilac-foreground shadow-soft">
                    {initialsOf(displayName)}
                  </div>
                )}
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-success" />
              </div>
            </Link>
          </div>
        </div>

        <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
          <DialogContent className="gap-4 sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Pesquisar</DialogTitle>
              <DialogDescription>Escreva um termo e prima Enter para ir à página de pesquisa.</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="flex flex-col gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  type="search"
                  enterKeyHint="search"
                  autoCapitalize="sentences"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar..."
                  className="pl-10"
                />
              </div>
              <Button type="submit" className="w-full sm:w-auto">
                Pesquisar
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </header>
    );
  }

  return (
    <header className="flex flex-col gap-4">
      <div className="flex w-full flex-wrap items-center gap-3">
        {!!onOpenMobileMenu && (
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-accent lg:hidden"
            aria-label="Abrir menu"
            onClick={onOpenMobileMenu}
          >
            <Menu className="h-6 w-6" strokeWidth={1.75} />
          </button>
        )}
        <form onSubmit={submit} className="relative min-w-0 max-w-md flex-1" role="search">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar..."
            className="h-11 w-full rounded-full border border-border bg-card pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </form>

        <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-3 min-[480px]:w-auto min-[480px]:flex-1">
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
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-soft",
              pendingCount > 0
                ? "bg-pastel-yellow text-pastel-yellow-foreground"
                : "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
            )}
            title={
              pendingCount > 0
                ? `${pendingCount} alteração(ões) pendente(s) de sincronização`
                : "Sincronizado com o servidor"
            }
            role="status"
            aria-live="polite"
          >
            <Cloud className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </div>
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
      </div>
    </header>
  );
};
