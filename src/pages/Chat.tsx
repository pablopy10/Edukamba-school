import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Search, Send, Paperclip, Smile, Phone, Video, MoreVertical, Check, CheckCheck, Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type Conversation = {
  id: string;
  name: string;
  role: string;
  initials: string;
  avatarBg: string;
  avatarFg: string;
  lastMessage: string;
  time: string;
  unread: number;
  online: boolean;
  group?: boolean;
};

type Message = {
  id: string;
  conversationId: string;
  author: "me" | string;
  authorName?: string;
  text: string;
  time: string;
  status?: "sent" | "delivered" | "read";
};

const conversations: Conversation[] = [
  { id: "c1", name: "Carla Mendes", role: "Coordenadora", initials: "CM", avatarBg: "bg-pastel-blue", avatarFg: "text-pastel-blue-foreground", lastMessage: "Bom dia! Confirma a reunião pedagógica de amanhã?", time: "09:42", unread: 2, online: true },
  { id: "c2", name: "Tiago Ferreira", role: "Professor de Matemática", initials: "TF", avatarBg: "bg-pastel-green", avatarFg: "text-pastel-green-foreground", lastMessage: "Já lancei as notas do 2.º teste.", time: "09:15", unread: 0, online: true },
  { id: "c3", name: "Direção 10.º A", role: "Grupo · 12 membros", initials: "DA", avatarBg: "bg-pastel-lilac", avatarFg: "text-pastel-lilac-foreground", lastMessage: "Helena: Trago o material da apresentação.", time: "ontem", unread: 5, online: false, group: true },
  { id: "c4", name: "Helena Costa", role: "Professora", initials: "HC", avatarBg: "bg-pastel-yellow", avatarFg: "text-pastel-yellow-foreground", lastMessage: "Obrigada! Combinado então.", time: "ontem", unread: 0, online: false },
  { id: "c5", name: "Rui Pereira", role: "Educador", initials: "RP", avatarBg: "bg-pastel-pink", avatarFg: "text-pastel-pink-foreground", lastMessage: "Posso passar pelo gabinete às 15h?", time: "seg", unread: 0, online: false },
  { id: "c6", name: "Pais — 7.º B", role: "Grupo · 24 membros", initials: "P7", avatarBg: "bg-pastel-blue", avatarFg: "text-pastel-blue-foreground", lastMessage: "Maria: Bom dia a todos!", time: "seg", unread: 0, online: false, group: true },
];

const seedMessages: Message[] = [
  { id: "m1", conversationId: "c1", author: "c1", authorName: "Carla Mendes", text: "Bom dia, Linda! Tudo bem?", time: "09:38" },
  { id: "m2", conversationId: "c1", author: "me", text: "Bom dia, Carla! Tudo óptimo, e contigo?", time: "09:39", status: "read" },
  { id: "m3", conversationId: "c1", author: "c1", authorName: "Carla Mendes", text: "Tudo bem 🙌 Confirmas a reunião pedagógica de amanhã às 14h?", time: "09:41" },
  { id: "m4", conversationId: "c1", author: "c1", authorName: "Carla Mendes", text: "Vou enviar a ordem de trabalhos por email ainda esta manhã.", time: "09:42" },
  { id: "m5", conversationId: "c2", author: "c2", authorName: "Tiago Ferreira", text: "Já lancei as notas do 2.º teste do 10.º A.", time: "09:15" },
  { id: "m6", conversationId: "c2", author: "me", text: "Perfeito, obrigada Tiago!", time: "09:16", status: "delivered" },
  { id: "m7", conversationId: "c3", author: "c3", authorName: "Helena Costa", text: "Trago o material da apresentação.", time: "ontem" },
  { id: "m8", conversationId: "c4", author: "c4", authorName: "Helena Costa", text: "Obrigada! Combinado então.", time: "ontem" },
  { id: "m9", conversationId: "c5", author: "c5", authorName: "Rui Pereira", text: "Posso passar pelo gabinete às 15h?", time: "seg" },
  { id: "m10", conversationId: "c6", author: "c6", authorName: "Maria Silva", text: "Bom dia a todos!", time: "seg" },
];

const Chat = () => {
  const [activeId, setActiveId] = useState<string>("c1");
  const [search, setSearch] = useState("");
  const [messages, setMessages] = useState<Message[]>(seedMessages);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const list = useMemo(
    () =>
      conversations.filter((c) =>
        [c.name, c.role, c.lastMessage].some((s) => s.toLowerCase().includes(search.toLowerCase())),
      ),
    [search],
  );

  const active = conversations.find((c) => c.id === activeId)!;
  const thread = messages.filter((m) => m.conversationId === activeId);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [activeId, thread.length]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    setMessages((prev) => [
      ...prev,
      { id: `m${Date.now()}`, conversationId: activeId, author: "me", text, time, status: "sent" },
    ]);
    setDraft("");
  };

  const StatusIcon = ({ status }: { status?: Message["status"] }) => {
    if (!status) return null;
    if (status === "read") return <CheckCheck className="h-3.5 w-3.5 text-pastel-blue-foreground" strokeWidth={2} />;
    if (status === "delivered") return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />;
    return <Check className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />;
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Chat</h1>
          <p className="text-sm text-muted-foreground">Mensagens entre professores, coordenadores, educadores e pais.</p>
        </div>

        <div className="grid h-[calc(100vh-12rem)] grid-cols-1 overflow-hidden rounded-2xl bg-card shadow-card md:grid-cols-[320px_1fr]">
          {/* Sidebar de conversas */}
          <aside className="flex flex-col border-r border-border">
            <div className="flex items-center justify-between gap-2 border-b border-border p-4">
              <h2 className="text-sm font-semibold text-foreground">Conversas</h2>
              <button className="flex h-8 w-8 items-center justify-center rounded-full bg-pastel-blue text-pastel-blue-foreground transition-colors hover:opacity-90" aria-label="Nova conversa">
                <Plus className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
            <div className="p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  type="text"
                  placeholder="Pesquisar..."
                  className="h-10 w-full rounded-full border border-border bg-card pl-10 pr-4 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto sidebar-scroll">
              <ul className="flex flex-col">
                {list.map((c) => {
                  const isActive = c.id === activeId;
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => setActiveId(c.id)}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                          isActive ? "bg-pastel-blue/30" : "hover:bg-muted/60",
                        )}
                      >
                        <div className="relative shrink-0">
                          <div className={cn("flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold", c.avatarBg, c.avatarFg)}>
                            {c.group ? <Users className="h-5 w-5" strokeWidth={1.75} /> : c.initials}
                          </div>
                          {c.online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-success" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                            <span className="shrink-0 text-[11px] text-muted-foreground">{c.time}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-xs text-muted-foreground">{c.lastMessage}</p>
                            {c.unread > 0 && (
                              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-pastel-blue-foreground px-1.5 text-[10px] font-bold text-card">
                                {c.unread}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
                {list.length === 0 && (
                  <li className="p-6 text-center text-xs text-muted-foreground">Nenhuma conversa encontrada.</li>
                )}
              </ul>
            </div>
          </aside>

          {/* Painel de mensagens */}
          <section className="flex flex-col">
            {/* Cabeçalho */}
            <header className="flex items-center justify-between gap-3 border-b border-border p-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className={cn("flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold", active.avatarBg, active.avatarFg)}>
                    {active.group ? <Users className="h-5 w-5" strokeWidth={1.75} /> : active.initials}
                  </div>
                  {active.online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-success" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{active.name}</p>
                  <p className="text-xs text-muted-foreground">{active.online ? "Online agora" : active.role}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Chamada">
                  <Phone className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <button className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Vídeo">
                  <Video className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <button className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Mais opções">
                  <MoreVertical className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            </header>

            {/* Mensagens */}
            <div ref={scrollRef} className="sidebar-scroll flex-1 overflow-y-auto bg-muted/30 p-6">
              <div className="mx-auto flex max-w-2xl flex-col gap-3">
                <div className="flex justify-center">
                  <span className="rounded-full bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-soft">Hoje</span>
                </div>
                {thread.map((m) => {
                  const mine = m.author === "me";
                  return (
                    <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[75%] rounded-2xl px-4 py-2.5 shadow-soft", mine ? "bg-pastel-blue text-pastel-blue-foreground rounded-br-sm" : "bg-card text-foreground rounded-bl-sm")}>
                        {!mine && active.group && (
                          <p className="mb-1 text-[11px] font-semibold text-pastel-lilac-foreground">{m.authorName}</p>
                        )}
                        <p className="text-sm leading-relaxed">{m.text}</p>
                        <div className={cn("mt-1 flex items-center justify-end gap-1 text-[10px]", mine ? "text-pastel-blue-foreground/80" : "text-muted-foreground")}>
                          <span>{m.time}</span>
                          {mine && <StatusIcon status={m.status} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {thread.length === 0 && (
                  <div className="py-16 text-center text-sm text-muted-foreground">Sem mensagens ainda. Diga olá! 👋</div>
                )}
              </div>
            </div>

            {/* Composer */}
            <div className="border-t border-border bg-card p-3">
              <div className="flex items-end gap-2">
                <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Anexar">
                  <Paperclip className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Emoji">
                  <Smile className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={1}
                  placeholder={`Mensagem para ${active.name}...`}
                  maxLength={2000}
                  className="min-h-[40px] max-h-32 flex-1 resize-none rounded-2xl border border-border bg-card px-4 py-2.5 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <button
                  onClick={send}
                  disabled={!draft.trim()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pastel-blue-foreground text-card shadow-soft transition-[var(--transition-smooth)] hover:opacity-90 disabled:opacity-40"
                  aria-label="Enviar"
                >
                  <Send className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Chat;