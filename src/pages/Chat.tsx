import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search, Send, Paperclip, Smile, MoreVertical, Check, CheckCheck, Loader2,
  Plus, X, FileText, ImageIcon, Download, Ban, ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@/hooks/useUserRole";
import { ROLE_LABEL_INVITE } from "@/components/definicoes/InviteStaffUserDialog";
import { isNativeMobileApp } from "@/lib/nativeApp";

type Role = UserRole;

type Contact = {
  id: string;
  full_name: string;
  role: Role;
};

type DBMessage = {
  id: string;
  sender_id: string | null;
  receiver_id: string | null;
  content: string | null;
  is_read: boolean | null;
  created_at: string | null;
  school_id: string | null;
  message_type: "text" | "image" | "file" | null;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
};

type Conversation = {
  contactId: string;
  name: string;
  role: string;
  lastMessage: string;
  lastTime: string;
  lastIso: string;
  unread: number;
  isMine: boolean;
  isRead: boolean;
};

const palette = [
  "bg-pastel-blue text-pastel-blue-foreground",
  "bg-pastel-pink text-pastel-pink-foreground",
  "bg-pastel-yellow text-pastel-yellow-foreground",
  "bg-pastel-green text-pastel-green-foreground",
  "bg-pastel-lilac text-pastel-lilac-foreground",
];
const colorFor = (id: string) =>
  palette[(id.charCodeAt(0) + id.charCodeAt(id.length - 1)) % palette.length];
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
const roleLabel = (r: Role) => {
  if (!r) return "Membro";
  if (r === "PARENT") return "Educador";
  if (r === "STUDENT") return "Aluno";
  if (r === "SUPER_ADMIN") return "Super admin";
  return ROLE_LABEL_INVITE[r as keyof typeof ROLE_LABEL_INVITE] ?? r;
};

// Allowed-pair check (UI mirror of RLS): students excluded entirely; teacher↔student forbidden
const canChat = (myRole: Role, otherRole: Role) => {
  if (myRole === "STUDENT" || otherRole === "STUDENT") return false;
  return true;
};

const formatBytes = (bytes: number | null) => {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const Chat = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const toParam = searchParams.get("to");

  const [myRole, setMyRole] = useState<Role>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [allMessages, setAllMessages] = useState<DBMessage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  // Mobile layout detection: native app OR screen width < md (768px)
  const native = isNativeMobileApp();
  const [windowWidth, setWindowWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1200,
  );
  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  const isMobileLayout = native || windowWidth < 768;

  // Initial load
  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: me } = await supabase
      .from("profiles")
      .select("school_id, role")
      .eq("id", user.id)
      .maybeSingle();
    const sId = me?.school_id ?? null;
    const role = (me?.role ?? null) as Role;
    setSchoolId(sId);
    setMyRole(role);

    if (role === "STUDENT") {
      setContacts([]);
      setAllMessages([]);
      setLoading(false);
      return;
    }

    const [{ data: profs }, { data: msgs }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, role")
        .neq("id", user.id)
        .order("full_name"),
      supabase
        .from("messages")
        .select("id, sender_id, receiver_id, content, is_read, created_at, school_id, message_type, file_url, file_name, file_type, file_size")
        .order("created_at", { ascending: true }),
    ]);
    // exclude students entirely AND apply teacher↔student forbidden rule
    const filtered = (profs ?? []).filter((p) => canChat(role, p.role as Role));
    setContacts(filtered as Contact[]);
    setAllMessages((msgs ?? []) as DBMessage[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  // honor ?to=
  useEffect(() => {
    if (!toParam || contacts.length === 0) return;
    const exists = contacts.some((c) => c.id === toParam);
    if (exists) setActiveId(toParam);
    // Se o contacto não estiver disponível (ex.: foi removido ou tem perfil incompatível),
    // simplesmente não selecionamos — sem alarme visual.
    searchParams.delete("to");
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toParam, contacts.length]);

  // realtime
  useEffect(() => {
    if (!user || myRole === "STUDENT") return;
    const channel = supabase
      .channel("messages-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        supabase
          .from("messages")
          .select("id, sender_id, receiver_id, content, is_read, created_at, school_id, message_type, file_url, file_name, file_type, file_size")
          .order("created_at", { ascending: true })
          .then(({ data }) => setAllMessages((data ?? []) as DBMessage[]));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, myRole]);

  // build conversations sorted by last message desc
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
    if (activeId && !byContact.has(activeId)) byContact.set(activeId, []);

    const list: Conversation[] = [];
    for (const [contactId, msgs] of byContact) {
      const contact = contacts.find((c) => c.id === contactId);
      if (!contact) continue;
      const last = msgs[msgs.length - 1];
      const unread = msgs.filter((m) => m.receiver_id === user.id && !m.is_read).length;
      const preview = last
        ? (last.message_type === "image" ? "📷 Imagem"
          : last.message_type === "file" ? `📎 ${last.file_name ?? "Ficheiro"}`
          : last.content ?? "")
        : "Sem mensagens. Diga olá!";
      list.push({
        contactId,
        name: contact.full_name,
        role: roleLabel(contact.role),
        lastMessage: preview,
        lastTime: formatTime(last?.created_at ?? null),
        lastIso: last?.created_at ?? "",
        unread,
        isMine: !!last && last.sender_id === user.id,
        isRead: !!last?.is_read,
      });
    }
    list.sort((a, b) => b.lastIso.localeCompare(a.lastIso));
    return list;
  }, [allMessages, contacts, activeId, user?.id]);

  const filteredConvos = useMemo(
    () => conversations.filter((c) =>
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
    mobileScrollRef.current?.scrollTo({ top: mobileScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [activeId, thread.length]);

  // mark as read on open
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

  const insertMessage = async (payload: Partial<DBMessage>) => {
    if (!user || !activeId || !schoolId) return;
    const { data, error } = await supabase
      .from("messages")
      .insert({
        sender_id: user.id,
        receiver_id: activeId,
        school_id: schoolId,
        is_read: false,
        message_type: "text",
        ...payload,
      })
      .select("id, sender_id, receiver_id, content, is_read, created_at, school_id, message_type, file_url, file_name, file_type, file_size")
      .single();
    if (error) {
      toast({ title: "Erro a enviar", description: error.message, variant: "destructive" });
      return;
    }
    setAllMessages((prev) => [...prev, data as DBMessage]);
  };

  const sendText = async () => {
    const text = draft.trim();
    if (!text || !user || !activeId || sending) return;
    setSending(true);
    await insertMessage({ content: text, message_type: "text" });
    setSending(false);
    setDraft("");
  };

  const onPickFile = async (file: File, kind: "image" | "file") => {
    if (!user || !activeId || !schoolId) {
      toast({ title: "Selecione uma conversa primeiro", variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Ficheiro muito grande", description: "Máx. 20 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from("chat-attachments").upload(path, file, {
      contentType: file.type || "application/octet-stream",
    });
    if (upErr) {
      setUploading(false);
      toast({ title: "Falha no upload", description: upErr.message, variant: "destructive" });
      return;
    }
    await insertMessage({
      content: null,
      message_type: kind,
      file_url: path,
      file_name: file.name,
      file_type: file.type || null,
      file_size: file.size,
    });
    setUploading(false);
  };

  const downloadAttachment = async (m: DBMessage) => {
    if (!m.file_url) return;
    const { data, error } = await supabase.storage.from("chat-attachments").createSignedUrl(m.file_url, 60 * 5);
    if (error || !data) {
      toast({ title: "Não foi possível abrir o ficheiro", description: error?.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  // sign image previews
  useEffect(() => {
    const imgs = thread.filter((m) => m.message_type === "image" && m.file_url && !signedUrls[m.id]);
    if (imgs.length === 0) return;
    (async () => {
      const updates: Record<string, string> = {};
      for (const m of imgs) {
        const { data } = await supabase.storage.from("chat-attachments").createSignedUrl(m.file_url!, 60 * 30);
        if (data) updates[m.id] = data.signedUrl;
      }
      if (Object.keys(updates).length) setSignedUrls((p) => ({ ...p, ...updates }));
    })();
  }, [thread]);

  const StatusIcon = ({ read }: { read: boolean }) =>
    read ? <CheckCheck className="h-3.5 w-3.5" strokeWidth={2} />
         : <Check className="h-3.5 w-3.5" strokeWidth={2} />;

  // STUDENT lockout view
  if (myRole === "STUDENT") {
    return (
      <>
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-card p-12 text-center shadow-card">
          <Ban className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Chat indisponível</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            O chat não está disponível para a conta de aluno. Contacte um administrador ou educador para qualquer assunto.
          </p>
        </div>
      </>
    );
  }

  // contacts available for "new chat" (exclude those already in conversations)
  const existingIds = new Set(conversations.map((c) => c.contactId));
  const newChatCandidates = contacts
    .filter((c) => !existingIds.has(c.id))
    .filter((c) => {
      const q = newChatSearch.toLowerCase();
      return !q || c.full_name.toLowerCase().includes(q) || roleLabel(c.role).toLowerCase().includes(q);
    });

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Chat</h1>
          <p className="text-sm text-muted-foreground">Mensagens entre administradores, professores e educadores.</p>
        </div>

        <div className={cn(
          "grid overflow-hidden rounded-2xl bg-card shadow-card",
          isMobileLayout
            ? "h-[calc(100vh-12rem)] grid-cols-1"
            : "h-[calc(100vh-12rem)] grid-cols-1 md:grid-cols-[320px_1fr]",
        )}>
          {/* Sidebar */}
          <aside className="flex flex-col border-r border-border">
            <div className="flex items-center justify-between gap-2 border-b border-border p-4">
              <h2 className="text-sm font-semibold text-foreground">Conversas</h2>
              <button
                onClick={() => setShowNewChat(true)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-pastel-blue text-pastel-blue-foreground transition-colors hover:opacity-90"
                aria-label="Nova conversa"
                title="Nova conversa"
              >
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
              {loading && (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              )}
              <ul className="flex flex-col">
                {!loading && filteredConvos.map((c) => {
                  const isActive = c.contactId === activeId;
                  return (
                    <li key={c.contactId}>
                      <button
                        onClick={() => { setDraft(""); setActiveId(c.contactId); }}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                          isActive ? "bg-pastel-blue/30" : "hover:bg-muted/60",
                        )}
                      >
                        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold", colorFor(c.contactId))}>
                          {initialsOf(c.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                            <span className="shrink-0 text-[11px] text-muted-foreground">{c.lastTime}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <p className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
                              {c.isMine && c.lastIso && (
                                <span className="shrink-0 text-pastel-blue-foreground">
                                  {c.isRead ? <CheckCheck className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                                </span>
                              )}
                              <span className="truncate">{c.lastMessage}</span>
                            </p>
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
                  <li className="p-6 text-center text-xs text-muted-foreground">
                    Nenhuma conversa ainda. Clique no <Plus className="inline h-3 w-3" /> para começar.
                  </li>
                )}
              </ul>
            </div>
          </aside>

          {/* Main panel — desktop only */}
          <section className={cn("flex-col", isMobileLayout ? "hidden" : "flex")}>
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
                  <button className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Mais opções">
                    <MoreVertical className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Seleccione uma conversa para começar.</p>
              )}
            </header>

            {/* Messages */}
            <div ref={scrollRef} className="sidebar-scroll flex-1 overflow-y-auto bg-muted/30 p-6">
              <div className="mx-auto flex max-w-2xl flex-col gap-3">
                {active && thread.map((m) => {
                  const mine = m.sender_id === user?.id;
                  return (
                    <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[75%] rounded-2xl px-3 py-2 shadow-soft",
                        mine ? "bg-pastel-blue text-pastel-blue-foreground rounded-br-sm" : "bg-card text-foreground rounded-bl-sm",
                      )}>
                        {m.message_type === "image" && m.file_url && (
                          <button onClick={() => downloadAttachment(m)} className="block overflow-hidden rounded-lg">
                            {signedUrls[m.id] ? (
                              <img src={signedUrls[m.id]} alt={m.file_name ?? "imagem"} className="max-h-64 w-full rounded-lg object-cover" />
                            ) : (
                              <div className="flex h-40 w-60 items-center justify-center rounded-lg bg-muted">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                              </div>
                            )}
                          </button>
                        )}
                        {m.message_type === "file" && (
                          <button
                            onClick={() => downloadAttachment(m)}
                            className={cn(
                              "flex items-center gap-3 rounded-lg p-2 text-left transition-colors",
                              mine ? "bg-pastel-blue-foreground/10 hover:bg-pastel-blue-foreground/20" : "bg-muted hover:bg-muted/80",
                            )}
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-card">
                              <FileText className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{m.file_name ?? "Ficheiro"}</p>
                              <p className="text-[11px] opacity-70">{formatBytes(m.file_size)}</p>
                            </div>
                            <Download className="h-4 w-4 opacity-70" strokeWidth={1.75} />
                          </button>
                        )}
                        {m.content && (
                          <p className={cn("whitespace-pre-wrap text-sm leading-relaxed", (m.message_type === "image" || m.message_type === "file") && "mt-2")}>
                            {m.content}
                          </p>
                        )}
                        <div className={cn(
                          "mt-1 flex items-center justify-end gap-1 text-[10px]",
                          mine ? "text-pastel-blue-foreground/80" : "text-muted-foreground",
                        )}>
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
                  <div className="py-16 text-center text-sm text-muted-foreground">Escolha alguém da lista ou abra uma nova conversa.</div>
                )}
              </div>
            </div>

            {/* Composer */}
            <div className="border-t border-border bg-card p-3">
              <div className="flex items-end gap-2">
                {/* Attach file */}
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f, "file"); e.target.value = ""; }}
                />
                <input
                  ref={imageRef}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f, "image"); e.target.value = ""; }}
                />

                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      disabled={!active || uploading}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                      aria-label="Anexar"
                    >
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" strokeWidth={1.75} />}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" side="top" className="w-44 p-1">
                    <button
                      onClick={() => imageRef.current?.click()}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
                    >
                      <ImageIcon className="h-4 w-4" /> Imagem
                    </button>
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
                    >
                      <FileText className="h-4 w-4" /> Documento
                    </button>
                  </PopoverContent>
                </Popover>

                <Popover open={showEmoji} onOpenChange={setShowEmoji}>
                  <PopoverTrigger asChild>
                    <button
                      disabled={!active}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                      aria-label="Emoji"
                    >
                      <Smile className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" side="top" className="w-auto border-0 p-0">
                    <EmojiPicker
                      onEmojiClick={(e) => { setDraft((d) => d + e.emoji); }}
                      emojiStyle={EmojiStyle.NATIVE}
                      theme={Theme.AUTO}
                      width={320}
                      height={380}
                      searchPlaceHolder="Pesquisar emoji..."
                      previewConfig={{ showPreview: false }}
                    />
                  </PopoverContent>
                </Popover>

                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); }
                  }}
                  rows={1}
                  placeholder={active ? `Mensagem para ${active.full_name}...` : "Seleccione uma conversa..."}
                  maxLength={2000}
                  disabled={!active || sending}
                  className="min-h-[40px] max-h-32 flex-1 resize-none rounded-2xl border border-border bg-card px-4 py-2.5 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                />
                <button
                  onClick={sendText}
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

      {/* Mobile: full-screen chat dialog */}
      {isMobileLayout && (
        <Dialog
          open={!!activeId}
          onOpenChange={(open) => { if (!open) { setActiveId(null); setShowEmoji(false); } }}
        >
          <DialogContent className="fixed inset-0 z-50 flex h-[100dvh] w-full max-w-none flex-col gap-0 rounded-none border-0 p-0 [transform:none]">
            <DialogHeader className="sr-only">
              <DialogTitle>{active?.full_name ?? "Conversa"}</DialogTitle>
              <DialogDescription>Conversa com {active?.full_name ?? "utilizador"}</DialogDescription>
            </DialogHeader>

            {/* Header */}
            <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card p-4 [padding-top:max(1rem,env(safe-area-inset-top,0px))]">
              <button
                onClick={() => { setActiveId(null); setShowEmoji(false); }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-accent"
                aria-label="Voltar"
              >
                <ArrowLeft className="h-5 w-5" strokeWidth={1.75} />
              </button>
              {active && (
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold", colorFor(active.id))}>
                    {initialsOf(active.full_name)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{active.full_name}</p>
                    <p className="text-xs text-muted-foreground">{roleLabel(active.role)}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Messages */}
            <div ref={mobileScrollRef} className="sidebar-scroll flex-1 overflow-y-auto bg-muted/30 p-4">
              <div className="mx-auto flex max-w-2xl flex-col gap-3">
                {active && thread.map((m) => {
                  const mine = m.sender_id === user?.id;
                  return (
                    <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[80%] rounded-2xl px-3 py-2 shadow-soft",
                        mine ? "bg-pastel-blue text-pastel-blue-foreground rounded-br-sm" : "bg-card text-foreground rounded-bl-sm",
                      )}>
                        {m.message_type === "image" && m.file_url && (
                          <button onClick={() => downloadAttachment(m)} className="block overflow-hidden rounded-lg">
                            {signedUrls[m.id] ? (
                              <img src={signedUrls[m.id]} alt={m.file_name ?? "imagem"} className="max-h-64 w-full rounded-lg object-cover" />
                            ) : (
                              <div className="flex h-40 w-60 items-center justify-center rounded-lg bg-muted">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                              </div>
                            )}
                          </button>
                        )}
                        {m.message_type === "file" && (
                          <button
                            onClick={() => downloadAttachment(m)}
                            className={cn(
                              "flex items-center gap-3 rounded-lg p-2 text-left transition-colors",
                              mine ? "bg-pastel-blue-foreground/10 hover:bg-pastel-blue-foreground/20" : "bg-muted hover:bg-muted/80",
                            )}
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-card">
                              <FileText className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{m.file_name ?? "Ficheiro"}</p>
                              <p className="text-[11px] opacity-70">{formatBytes(m.file_size)}</p>
                            </div>
                            <Download className="h-4 w-4 opacity-70" strokeWidth={1.75} />
                          </button>
                        )}
                        {m.content && (
                          <p className={cn("whitespace-pre-wrap text-sm leading-relaxed", (m.message_type === "image" || m.message_type === "file") && "mt-2")}>
                            {m.content}
                          </p>
                        )}
                        <div className={cn(
                          "mt-1 flex items-center justify-end gap-1 text-[10px]",
                          mine ? "text-pastel-blue-foreground/80" : "text-muted-foreground",
                        )}>
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
              </div>
            </div>

            {/* Composer */}
            <div className="shrink-0 border-t border-border bg-card p-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom,0px))]">
              <div className="flex items-end gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      disabled={!active || uploading}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                      aria-label="Anexar"
                    >
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" strokeWidth={1.75} />}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" side="top" className="w-44 p-1">
                    <button
                      onClick={() => imageRef.current?.click()}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
                    >
                      <ImageIcon className="h-4 w-4" /> Imagem
                    </button>
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
                    >
                      <FileText className="h-4 w-4" /> Documento
                    </button>
                  </PopoverContent>
                </Popover>

                <Popover open={showEmoji} onOpenChange={setShowEmoji}>
                  <PopoverTrigger asChild>
                    <button
                      disabled={!active}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                      aria-label="Emoji"
                    >
                      <Smile className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" side="top" className="w-auto border-0 p-0">
                    <EmojiPicker
                      onEmojiClick={(e) => { setDraft((d) => d + e.emoji); }}
                      emojiStyle={EmojiStyle.NATIVE}
                      theme={Theme.AUTO}
                      width={300}
                      height={350}
                      searchPlaceHolder="Pesquisar emoji..."
                      previewConfig={{ showPreview: false }}
                    />
                  </PopoverContent>
                </Popover>

                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); }
                  }}
                  rows={1}
                  placeholder={active ? `Mensagem para ${active.full_name}...` : "Seleccione uma conversa..."}
                  maxLength={2000}
                  disabled={!active || sending}
                  className="min-h-[40px] max-h-32 flex-1 resize-none rounded-2xl border border-border bg-card px-4 py-2.5 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                />
                <button
                  onClick={sendText}
                  disabled={!draft.trim() || !active || sending}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pastel-blue-foreground text-card shadow-soft transition-[var(--transition-smooth)] hover:opacity-90 disabled:opacity-40"
                  aria-label="Enviar"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" strokeWidth={2} />}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* New chat dialog */}
      <Dialog open={showNewChat} onOpenChange={setShowNewChat}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova conversa</DialogTitle>
            <DialogDescription>
              Escolha uma pessoa da sua escola para iniciar uma conversa.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={newChatSearch}
              onChange={(e) => setNewChatSearch(e.target.value)}
              type="text"
              placeholder="Pesquisar pessoa..."
              className="h-10 w-full rounded-full border border-border bg-card pl-10 pr-4 text-sm shadow-soft outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <ul className="flex max-h-80 flex-col overflow-y-auto sidebar-scroll">
            {newChatCandidates.length === 0 && (
              <li className="p-6 text-center text-xs text-muted-foreground">
                Nenhum contacto disponível.
              </li>
            )}
            {newChatCandidates.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => {
                    setDraft("");
                    setActiveId(c.id);
                    setShowNewChat(false);
                    setNewChatSearch("");
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/60"
                >
                  <div className={cn("flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold", colorFor(c.id))}>
                    {initialsOf(c.full_name)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{c.full_name}</p>
                    <p className="text-xs text-muted-foreground">{roleLabel(c.role)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setShowNewChat(false)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Chat;
