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
  Loader2,
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { toast } from "@/hooks/use-toast";
import { loadPendingSync } from "@/lib/pendingSyncStorage";
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

function TopbarConnectivity({ variant }: { variant: "native" | "desktop" }) {
  const {
    networkAvailableForSync,
    pendingCount,
    syncing,
    syncMode,
    setSyncMode,
    syncNow,
  } = useOfflineSync();

  const ringBase =
    variant === "native"
      ? "relative flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full shadow-soft ring-2 ring-offset-2 ring-offset-background"
      : "relative flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full shadow-soft ring-2 ring-offset-2 ring-offset-background";

  const connectivityTitle = !networkAvailableForSync
    ? "Sem Internet — modo offline"
    : pendingCount > 0
      ? `Pendente para envio (${pendingCount})`
      : "Sucesso — sincronizado";

  const onSyncPress = async () => {
    if (!networkAvailableForSync) {
      toast({
        title: "Sem rede",
        description: "Não há ligação suficiente para sincronizar.",
        variant: "destructive",
      });
      return;
    }
    const beforeLen = loadPendingSync().length;
    if (beforeLen === 0) {
      toast({ title: "Nada pendente", description: "Não há alterações por enviar ao servidor." });
      return;
    }
    const { successCount, remainingPending, blocked, httpStatus } = await syncNow();

    if (remainingPending === 0) {
      return;
    }
    if (successCount === 0) {
      if (blocked === "no_session") {
        toast({
          title: "Sessão expirada",
          description: `Inicie sessão novamente para enviar os ${remainingPending} pedido(s) na fila.`,
          variant: "destructive",
        });
        return;
      }
      if (blocked === "no_network") {
        toast({
          title: "Sem rede",
          description: "Não foi possível contactar o servidor. Verifique a ligação e tente outra vez.",
          variant: "destructive",
        });
        return;
      }
      const detail =
        httpStatus === 409
          ? `Conflito com dados já existentes no servidor (HTTP 409). Ainda há ${remainingPending} na fila.`
          : httpStatus === 400
            ? `Pedido rejeitado pelo servidor (HTTP 400) — pode haver dados incompletos ou em formato inválido. Ainda há ${remainingPending} na fila.`
            : httpStatus !== undefined
              ? `Resposta HTTP ${httpStatus}. Ainda há ${remainingPending} na fila.`
              : `O servidor pode estar indisponível ou há um erro nos dados enviados. Ainda há ${remainingPending} na fila.`;
      toast({
        title: "Ainda não foi possível sincronizar",
        description: detail,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Sincronização parcial",
      description: `Enviámos ${successCount}. Ainda ficam ${remainingPending} pendente(s).`,
      variant: "destructive",
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Rede e sincronização. ${connectivityTitle}`}
          title={connectivityTitle}
          className={cn(
            ringBase,
            "transition-[color,background-color]",
            !networkAvailableForSync &&
              "bg-destructive/15 text-destructive ring-destructive/35 dark:bg-destructive/25 dark:text-destructive dark:ring-destructive/40",
            networkAvailableForSync &&
              pendingCount > 0 &&
              "bg-pastel-yellow text-pastel-yellow-foreground ring-pastel-yellow/40",
            networkAvailableForSync &&
              pendingCount === 0 &&
              "bg-emerald-500/15 text-emerald-700 ring-emerald-500/25 dark:bg-emerald-500/20 dark:text-emerald-400 dark:ring-emerald-500/35",
          )}
        >
          {variant === "native" ? (
            !networkAvailableForSync ? (
              <WifiOff className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.75} aria-hidden />
            ) : (
              <Wifi className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.75} aria-hidden />
            )
          ) : !networkAvailableForSync ? (
            <WifiOff className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          ) : (
            <Cloud className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          )}
          {variant === "native" && pendingCount > 0 && (
            <span
              className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-600 px-0.5 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-card"
              aria-hidden
            >
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          )}
          {syncing ? (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-card/85 dark:bg-background/85">
              <Loader2 className="h-[1rem] w-[1rem] shrink-0 animate-spin text-primary" aria-hidden />
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="z-[100] w-[min(calc(100vw-2rem),20rem)] space-y-3 p-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Sincronização</p>
          <p className="text-xs text-muted-foreground">
            Modo automático envia assim que há rede. Modo manual só quando tocar em «Sincronizar agora».
          </p>
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="offline-sync-auto" className="cursor-pointer text-sm font-normal">
            Automático
          </Label>
          <Switch
            id="offline-sync-auto"
            checked={syncMode === "auto"}
            onCheckedChange={(v) => setSyncMode(v ? "auto" : "manual")}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          className="w-full gap-2"
          disabled={syncing || !networkAvailableForSync}
          onClick={() => void onSyncPress()}
        >
          {syncing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              A sincronizar…
            </>
          ) : (
            <>Sincronizar agora</>
          )}
        </Button>
        <p className="text-[11px] leading-snug text-muted-foreground">
          {pendingCount > 0
            ? `${pendingCount} alteração(ões) pendente(s) para envio.`
            : "Sucesso — sem alterações por enviar."}
        </p>
      </PopoverContent>
    </Popover>
  );
}

export const Topbar = ({ onOpenMobileMenu }: { onOpenMobileMenu?: () => void }) => {
  const native = isNativeMobileApp();
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

            <TopbarConnectivity variant="native" />

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

        {isParent && kids.length > 1 && (
          <div className="w-full min-w-0 rounded-2xl border border-border/60 bg-muted/25 p-3 shadow-soft/50 ring-1 ring-border/40">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Consultar dados de
            </p>
            <Select value={selectedChildId ?? undefined} onValueChange={(v) => setSelectedChildId(v)}>
              <SelectTrigger
                aria-label="Selecionar filho ou filha"
                className="h-12 w-full min-w-0 gap-2 rounded-xl border-border/80 bg-card px-4 text-left text-sm font-semibold text-foreground shadow-soft [&_svg]:shrink-0 [&>span]:line-clamp-1"
              >
                <Baby className="h-4 w-4 text-pastel-pink-foreground" strokeWidth={1.75} />
                <SelectValue placeholder="Filho(a)" />
              </SelectTrigger>
              <SelectContent align="center" position="popper" className="max-h-[min(60vh,20rem)] w-[min(100vw-2rem,var(--radix-select-trigger-width))]">
                {kids.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="cursor-pointer py-3">
                    <span className="flex flex-col gap-0.5 text-left">
                      <span className="font-medium leading-tight">{c.full_name}</span>
                      {c.classroom_name ? (
                        <span className="text-xs font-normal text-muted-foreground">{c.classroom_name}</span>
                      ) : null}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

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
          <TopbarConnectivity variant="desktop" />
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
