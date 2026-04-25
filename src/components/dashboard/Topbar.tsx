import { useEffect, useState } from "react";
import { Search, MessageSquare, Bell } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

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
  const [profile, setProfile] = useState<{ full_name: string; role: string | null; avatar_url: string | null } | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("full_name, role, avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setProfile(data);
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