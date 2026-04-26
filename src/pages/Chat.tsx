import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Search, Send, Paperclip, Smile, Phone, Video, MoreVertical, Check, CheckCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

type Contact = {
  id: string;
  full_name: string;
  role: string | null;
};

type DBMessage = {
  id: string;
  sender_id: string | null;
  receiver_id: string | null;
  content: string;
  is_read: boolean | null;
  created_at: string | null;
  school_id: string | null;
};

type Conversation = {
  contactId: string;
  name: string;
  role: string;
  lastMessage: string;
  lastTime: string;
  unread: number;
};

const palette = ["bg-pastel-blue text-pastel-blue-foreground", "bg-pastel-pink text-pastel-pink-foreground", "bg-pastel-yellow text-pastel-yellow-foreground", "bg-pastel-green text-pastel-green-foreground", "bg-pastel-lilac text-pastel-lilac-foreground"];
const colorFor = (id: string) => palette[(id.charCodeAt(0) + id.charCodeAt(id.length - 1)) % palette.length];
const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "??";
const formatTime = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  const isToday = d.toDateString() === today.toDateString();
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (isToday) return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  if (isYesterday) return "ontem";
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
};
const roleLabel = (r: string | null) => {
  switch (r) {
    case "ADMIN": return "Administrador";
    case "TEACHER": return "Professor";
    case "PARENT": return "Educador";
    case "STUDENT": return "Aluno";
    case "SUPER_ADMIN": return "Super admin";
    default: return "Membro";
  }
};

const Chat = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const toParam = searchParams.get("to");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [allMessages, setAllMessages] = useState<DBMessage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initial load: contacts + messages + my school
  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: me } = await supabase.from("profiles").select("school_id").eq("id", user.id).maybeSingle();
    const sId = me?.school_id ?? null;
    setSchoolId(sId);

    const [{ data: profs }, { data: msgs }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, role").neq("id", user.id).order("full_name"),
      supabase
        .from("messages")
        .select("id, sender_id, receiver_id, content, is_read, created_at, school_id")
        .order("created_at", { ascending: true }),
    ]);
    setContacts((profs ?? []) as Contact[]);
    setAllMessages((msgs ?? []) as DBMessage[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  // Honor ?to= once contacts are loaded
  useEffect(() => {
    if (!toParam || contacts.length === 0) return;
    const exists = contacts.some((c) => c.id === toParam);
    if (exists) {
      setActiveId(toParam);
    } else {
      toast({ title: "Contacto não encontrado na sua escola", variant: "destructive" });
    }
    // remove ?to= from URL after honoring
    searchParams.delete("to");
    setSearchParams(searchParams, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toParam, contacts.length]);

  // Realtime subscription for messages
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("messages-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        // simple refetch of messages
        supabase
          .from("messages")
          .select("id, sender_id, receiver_id, content, is_read, created_at, school_id")
          .order("created_at", { ascending: true })
          .then(({ data }) => setAllMessages((data ?? []) as DBMessage[]));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // Build conversations from messages, plus the active contact even if no messages yet
  const conversations: Conversation[] = useMemo(() => {
    if (!user) return [];
    const byContact = new Map<string, DBMessage[]>();
    for (const m of allMessages) {
      const other = m.sender_id === user.id ? m.receiver_id : m.sender_id;
      if (!other) continue;
      const arr = byContact.get(other) ?? [];
      arr.push(m);
      byContact.set(other, arr);
    }
    // ensure active contact appears in list even with no messages
    if (activeId && !byContact.has(activeId)) byContact.set(activeId, []);

    const list: Conversation[] = [];
    for (const [contactId, msgs] of byContact) {
      const contact = contacts.find((c) => c.id === contactId);
      if (!contact) continue;
      const last = msgs[msgs.length - 1];
      const unread = msgs.filter((m) => m.receiver_id === user.id && !m.is_read).length;
      list.push({
        contactId,
        name: contact.full_name,
        role: roleLabel(contact.role),
        lastMessage: last?.content ?? "Sem mensagens ainda. Diga olá!",
        lastTime: formatTime(last?.created_at ?? null),
        unread,
      });
    }
    list.sort((a, b) => {
      // newest message first; empty conversations stay near top if active
      const aLast = allMessages.filter((m) => m.sender_id === a.contactId || m.receiver_id === a.contactId).at(-1)?.created_at ?? "0";
      const bLast = allMessages.filter((m) => m.sender_id === b.contactId || m.receiver_id === b.contactId).at(-1)?.created_at ?? "0";
      return bLast.localeCompare(aLast);
    });
    return list;
  }, [allMessages, contacts, activeId, user?.id]);

  const filteredConvos = useMemo(
    () =>
      conversations.filter((c) =>
        [c.name, c.role, c.lastMessage].some((s) => s.toLowerCase().includes(search.toLowerCase())),
      ),
    [conversations, search],
  );

  const active = activeId ? contacts.find((c) => c.id === activeId) ?? null : null;
  const thread = useMemo(() => {
    if (!user || !activeId) return [] as DBMessage[];
    return allMessages.filter(
      (m) =>
        (m.sender_id === user.id && m.receiver_id === activeId) ||
        (m.sender_id === activeId && m.receiver_id === user.id),
    );
  }, [allMessages, activeId, user?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [activeId, thread.length]);

  // Mark received messages as read when opening
  useEffect(() => {
    if (!user || !activeId) return;
    const unreadIds = allMessages
      .filter((m) => m.sender_id === activeId && m.receiver_id === user.id && !m.is_read)
      .map((m) => m.id);
    if (unreadIds.length === 0) return;
    supabase.from("messages").update({ is_read: true }).in("id", unreadIds).then(() => {
      setAllMessages((prev) => prev.map((m) => (unreadIds.includes(m.id) ? { ...m, is_read: true } : m)));
    });
  }, [activeId, user?.id]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !user || !activeId || !schoolId || sending) return;
    setSending(true);
    const { data, error } = await supabase
      .from("messages")
      .insert({ sender_id: user.id, receiver_id: activeId, content: text, school_id: schoolId, is_read: false })
      .select()
      .single();
    setSending(false);
    if (error) {
      toast({ title: "Erro a enviar", description: error.message, variant: "destructive" });
      return;
    }
    setAllMessages((prev) => [...prev, data as DBMessage]);
    setDraft("");
  };

  const StatusIcon = ({ read }: { read: boolean }) => {
    return read
      ? <CheckCheck className="h-3.5 w-3.5 text-pastel-blue-foreground" strokeWidth={2} />
      : <Check className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />;
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
              {loading && (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              )}
              <ul className="flex flex-col">
                {!loading && filteredConvos.map((c) => {
                  const isActive = c.contactId === activeId;
                  return (
                    <li key={c.contactId}>
                      <button
                        onClick={() => setActiveId(c.contactId)}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                          isActive ? "bg-pastel-blue/30" : "hover:bg-muted/60",
                        )}
                      >
                        <div className="relative shrink-0">
                          <div className={cn("flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold", colorFor(c.contactId))}>
                            {initialsOf(c.name)}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                            <span className="shrink-0 text-[11px] text-muted-foreground">{c.lastTime}</span>
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
                {!loading && filteredConvos.length === 0 && (
                  <li className="p-6 text-center text-xs text-muted-foreground">Nenhuma conversa ainda.</li>
                )}
              </ul>
            </div>
          </aside>

          {/* Painel de mensagens */}
          <section className="flex flex-col">
            {/* Cabeçalho */}
            <header className="flex items-center justify-between gap-3 border-b border-border p-4">
              {active ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className={cn("flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold", colorFor(active.id))}>
                      {initialsOf(active.full_name)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{active.full_name}</p>
                      <p className="text-xs text-muted-foreground">{roleLabel(active.role)}</p>
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
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Seleccione uma conversa para começar.</p>
              )}
            </header>

            {/* Mensagens */}
            <div ref={scrollRef} className="sidebar-scroll flex-1 overflow-y-auto bg-muted/30 p-6">
              <div className="mx-auto flex max-w-2xl flex-col gap-3">
                {active && thread.map((m) => {
                  const mine = m.sender_id === user?.id;
                  return (
                    <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[75%] rounded-2xl px-4 py-2.5 shadow-soft", mine ? "bg-pastel-blue text-pastel-blue-foreground rounded-br-sm" : "bg-card text-foreground rounded-bl-sm")}>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                        <div className={cn("mt-1 flex items-center justify-end gap-1 text-[10px]", mine ? "text-pastel-blue-foreground/80" : "text-muted-foreground")}>
                          <span>{formatTime(m.created_at)}</span>
                          {mine && <StatusIcon read={!!m.is_read} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {active && thread.length === 0 && (
                  <div className="py-16 text-center text-sm text-muted-foreground">Sem mensagens ainda. Diga olá! 👋</div>
                )}
                {!active && (
                  <div className="py-16 text-center text-sm text-muted-foreground">Escolha alguém da lista ou abra um chat a partir de outra página.</div>
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
                  placeholder={active ? `Mensagem para ${active.full_name}...` : "Seleccione uma conversa..."}
                  maxLength={2000}
                  disabled={!active || sending}
                  className="min-h-[40px] max-h-32 flex-1 resize-none rounded-2xl border border-border bg-card px-4 py-2.5 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                />
                <button
                  onClick={send}
                  disabled={!draft.trim() || !active || sending}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pastel-blue-foreground text-card shadow-soft transition-[var(--transition-smooth)] hover:opacity-90 disabled:opacity-40"
                  aria-label="Enviar"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" strokeWidth={2} />}
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