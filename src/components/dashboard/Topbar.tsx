import { useState } from "react";
import { Search, MessageSquare, Bell } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

export const Topbar = () => {
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/pesquisa?q=${encodeURIComponent(term)}` : "/pesquisa");
  };

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <form onSubmit={submit} className="relative w-full max-w-md" role="search">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => navigate("/pesquisa")}
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
        <div className="flex items-center gap-3 pl-2">
          <div className="text-right">
            <p className="text-sm font-semibold text-foreground">Linda Adora</p>
            <p className="text-xs text-muted-foreground">Administradora</p>
          </div>
          <div className="relative">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-lilac text-sm font-bold text-pastel-lilac-foreground shadow-soft">
              LA
            </div>
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-success" />
          </div>
        </div>
      </div>
    </header>
  );
};