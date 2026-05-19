import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { dateLocaleTag } from "@/lib/i18nDateLocale";
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
import { isNativeMobileApp } from "@/lib/nativeApp";
import { effectiveSchoolIdFromProfile } from "@/lib/effectiveTenant";
import { uploadFileToR2, R2UploadError } from "@/lib/r2/uploadFileToR2";
import { isPublicFileUrl, openFileUrl, resolveFileUrl } from "@/lib/r2/resolveFileUrl";

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
  const { t, i18n } = useTranslation("pages", { keyPrefix: "chat" });
  const { t: tShared } = useTranslation("pages", { keyPrefix: "shared" });
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const formatTime = useCallback(
    (iso: string | null) => {
      if (!iso) return "";
      const d = new Date(iso);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      const isToday = d.toDateString() === today.toDateString();
      const isYesterday = d.toDateString() === yesterday.toDateString();
      if (isToday) {
        return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
      }
      if (isYesterday) return tShared("relative_yesterday");
      return d.toLocaleDateString(dateLocaleTag(i18n.language), { day: "2-digit", month: "2-digit" });
    },
    [i18n.language, tShared],
  );

  const roleLabel = useCallback(
    (r: Role) => {
      if (!r) return t("roles.member_fallback");
      return t(`roles.${r}`, { defaultValue: r });
    },
    [t],
  );
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
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const uploadLockRef = useRef(false);

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
      .select("school_id, support_context_school_id, role")
      .eq("id", user.id)
      .maybeSingle();
    const sId = effectiveSchoolIdFromProfile(me);
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
        ? (last.message_type === "image"
          ? t("preview_image")
          : last.message_type === "file"
            ? t("preview_file", { name: last.file_name ?? t("preview_file_fallback") })
            : last.content ?? "")
        : t("preview_empty");
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
  }, [allMessages, contacts, activeId, user?.id, formatTime, roleLabel, t]);

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
      window.dispatchEvent(new Event("unread_messages_updated"));
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
      toast({ title: t("toast_send_error"), description: error.message, variant: "destructive" });
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
    if (uploadLockRef.current) return;
    if (!user || !activeId || !schoolId) {
      toast({ title: t("toast_select_conversation"), variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: t("toast_file_large_title"), description: t("toast_file_large_desc"), variant: "destructive" });
      return;
    }
    uploadLockRef.current = true;
    setShowAttachMenu(false);
    setShowEmoji(false);
    setUploading(true);
    setUploadProgress(0);
    try {
      const publicUrl = await uploadFileToR2(file, {
        prefix: "chat-attachments",
        onProgress: setUploadProgress,
      });
      await insertMessage({
        content: null,
        message_type: kind,
        file_url: publicUrl,
        file_name: file.name,
        file_type: file.type || null,
        file_size: file.size,
      });
    } catch (e) {
      const msg = e instanceof R2UploadError ? e.message : e instanceof Error ? e.message : t("toast_upload_failed");
      toast({ title: t("toast_upload_failed"), description: msg, variant: "destructive" });
    } finally {
      uploadLockRef.current = false;
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const downloadAttachment = async (m: DBMessage) => {
    if (!m.file_url) return;
    try {
      await openFileUrl(m.file_url, "chat-attachments");
    } catch (e) {
      toast({
        title: t("toast_open_file_failed"),
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    }
  };

  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  // sign image previews
  useEffect(() => {
    const imgs = thread.filter((m) => m.message_type === "image" && m.file_url && !signedUrls[m.id]);
    if (imgs.length === 0) return;
    (async () => {
      const updates: Record<string, string> = {};
      for (const m of imgs) {
        if (!m.file_url) continue;
        try {
          updates[m.id] = isPublicFileUrl(m.file_url)
            ? m.file_url
            : await resolveFileUrl(m.file_url, "chat-attachments");
        } catch {
          /* skip broken legacy paths */
        }
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("student_lockout_title")}</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {t("student_lockout_desc")}
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

  const triggerImagePick = () => {
    setShowAttachMenu(false);
    setShowEmoji(false);
    imageRef.current?.click();
  };

  const triggerFilePick = () => {
    setShowAttachMenu(false);
    setShowEmoji(false);
    fileRef.current?.click();
  };

  const emojiPickerWidth = Math.min(320, Math.max(260, windowWidth - 48));

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
        onChange={(e) => {
          const input = e.target;
          const f = input.files?.[0];
          input.value = "";
          if (f) void onPickFile(f, "file");
        }}
      />
      <input
        ref={imageRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        accept="image/*"
        onChange={(e) => {
          const input = e.target;
          const f = input.files?.[0];
          input.value = "";
          if (f) void onPickFile(f, "image");
        }}
      />
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
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
              <h2 className="text-sm font-semibold text-foreground">{t("conversations")}</h2>
              <button
                onClick={() => setShowNewChat(true)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-pastel-blue text-pastel-blue-foreground transition-colors hover:opacity-90"
                aria-label={t("new_chat_aria")}
                title={t("new_chat_aria")}
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
                  placeholder={t("search_placeholder")}
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
                    <Trans
                      t={t}
                      i18nKey="empty_conversations"
                      components={{ 1: <Plus className="inline h-3 w-3" /> }}
                    />
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
                  <button className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={t("more_options_aria")}>
                    <MoreVertical className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t("select_conversation")}</p>
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
                              <img src={signedUrls[m.id]} alt={m.file_name ?? t("image_alt")} className="max-h-64 w-full rounded-lg object-cover" />
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
                              <p className="truncate text-sm font-medium">{m.file_name ?? t("preview_file_fallback")}</p>
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
                  <div className="py-16 text-center text-sm text-muted-foreground">{t("thread_empty")}</div>
                )}
                {!active && (
                  <div className="py-16 text-center text-sm text-muted-foreground">{t("pick_someone")}</div>
                )}
              </div>
            </div>

            {/* Composer */}
            <div className="border-t border-border bg-card p-3">
              <div className="flex items-end gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      disabled={!active || uploading}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                      aria-label={t("attach_aria")}
                    >
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" strokeWidth={1.75} />}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" side="top" className="w-44 p-1">
                    <button
                      type="button"
                      onClick={triggerImagePick}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
                    >
                      <ImageIcon className="h-4 w-4" /> {t("attach_image")}
                    </button>
                    <button
                      type="button"
                      onClick={triggerFilePick}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
                    >
                      <FileText className="h-4 w-4" /> {t("attach_document")}
                    </button>
                  </PopoverContent>
                </Popover>

                <Popover open={showEmoji} onOpenChange={setShowEmoji}>
                  <PopoverTrigger asChild>
                    <button
                      disabled={!active}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                      aria-label={t("emoji_aria")}
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
                      searchPlaceHolder={t("emoji_search")}
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
                  placeholder={active ? t("placeholder_active", { name: active.full_name }) : t("placeholder_inactive")}
                  maxLength={2000}
                  disabled={!active || sending}
                  className="min-h-[40px] max-h-32 flex-1 resize-none rounded-2xl border border-border bg-card px-4 py-2.5 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                />
                <button
                  onClick={sendText}
                  disabled={!draft.trim() || !active || sending}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pastel-blue-foreground text-card shadow-soft transition-[var(--transition-smooth)] hover:opacity-90 disabled:opacity-40"
                  aria-label={t("send_aria")}
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
          onOpenChange={(open) => {
            if (!open) {
              setActiveId(null);
              setShowEmoji(false);
              setShowAttachMenu(false);
            }
          }}
        >
          <DialogContent className="fixed inset-0 z-[150] flex h-[100dvh] w-full max-w-none flex-col gap-0 rounded-none border-0 p-0 [transform:none] pl-[max(0.75rem,var(--sal-r))] pr-[max(0.75rem,var(--sar-r))]">
            <DialogHeader className="sr-only">
              <DialogTitle>{active?.full_name ?? t("mobile_conversation_title")}</DialogTitle>
              <DialogDescription>{t("mobile_conversation_desc", { name: active?.full_name ?? t("mobile_default_user") })}</DialogDescription>
            </DialogHeader>

            {/* Header */}
            <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 pb-3 pt-[max(0.75rem,var(--sat-r))]">
              <button
                onClick={() => { setActiveId(null); setShowEmoji(false); setShowAttachMenu(false); }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-accent"
                aria-label={t("back_aria")}
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
            <div ref={mobileScrollRef} className="sidebar-scroll min-h-0 flex-1 overflow-y-auto bg-muted/30 px-1 py-4 sm:px-4">
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
                              <img src={signedUrls[m.id]} alt={m.file_name ?? t("image_alt")} className="max-h-64 w-full rounded-lg object-cover" />
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
                              <p className="truncate text-sm font-medium">{m.file_name ?? t("preview_file_fallback")}</p>
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
                  <div className="py-16 text-center text-sm text-muted-foreground">{t("thread_empty")}</div>
                )}
              </div>
            </div>

            {/* Composer mobile — menus inline (Popover não funciona no Dialog/Capacitor) */}
            <div className="relative shrink-0 border-t border-border bg-card px-3 pb-[max(0.75rem,var(--sab-r))] pt-3">
              {(showAttachMenu || showEmoji) && (
                <button
                  type="button"
                  className="absolute inset-0 -top-[100vh] z-[1] h-[200vh] w-full bg-transparent"
                  aria-label={t("close")}
                  onClick={() => {
                    setShowAttachMenu(false);
                    setShowEmoji(false);
                  }}
                />
              )}
              {showAttachMenu && (
                <div
                  className="absolute bottom-full left-0 z-[2] mb-2 w-44 rounded-lg border border-border bg-popover p-1 shadow-lg"
                  role="menu"
                >
                  <button
                    type="button"
                    onClick={triggerImagePick}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
                  >
                    <ImageIcon className="h-4 w-4" /> {t("attach_image")}
                  </button>
                  <button
                    type="button"
                    onClick={triggerFilePick}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
                  >
                    <FileText className="h-4 w-4" /> {t("attach_document")}
                  </button>
                </div>
              )}
              {showEmoji && (
                <div className="absolute bottom-full left-0 right-0 z-[2] mb-2 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                  <EmojiPicker
                    onEmojiClick={(e) => {
                      setDraft((d) => d + e.emoji);
                    }}
                    emojiStyle={native ? EmojiStyle.APPLE : EmojiStyle.NATIVE}
                    theme={Theme.AUTO}
                    width={emojiPickerWidth}
                    height={Math.min(320, Math.round(window.innerHeight * 0.38))}
                    lazyLoadEmojis
                    searchPlaceHolder={t("emoji_search")}
                    previewConfig={{ showPreview: false }}
                  />
                </div>
              )}
              <div className="relative z-[3] flex items-end gap-2">
                <button
                  type="button"
                  disabled={!active || uploading}
                  onClick={() => {
                    setShowEmoji(false);
                    setShowAttachMenu((v) => !v);
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                  aria-label={t("attach_aria")}
                  aria-expanded={showAttachMenu}
                >
                  {uploading ? (
                    <span className="flex flex-col items-center gap-0.5">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {uploadProgress != null && uploadProgress > 0 && (
                        <span className="text-[9px] font-medium tabular-nums">{uploadProgress}%</span>
                      )}
                    </span>
                  ) : (
                    <Paperclip className="h-4 w-4" strokeWidth={1.75} />
                  )}
                </button>

                <button
                  type="button"
                  disabled={!active || uploading}
                  onClick={() => {
                    setShowAttachMenu(false);
                    setShowEmoji((v) => !v);
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                  aria-label={t("emoji_aria")}
                  aria-expanded={showEmoji}
                >
                  <Smile className="h-4 w-4" strokeWidth={1.75} />
                </button>

                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); }
                  }}
                  rows={1}
                  placeholder={
                    uploading && uploadProgress != null && uploadProgress > 0
                      ? `${uploadProgress}%…`
                      : active
                        ? t("placeholder_active", { name: active.full_name })
                        : t("placeholder_inactive")
                  }
                  maxLength={2000}
                  disabled={!active || sending || uploading}
                  className="min-h-[40px] max-h-32 flex-1 resize-none rounded-2xl border border-border bg-card px-4 py-2.5 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                />
                <button
                  onClick={sendText}
                  disabled={!draft.trim() || !active || sending || uploading}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pastel-blue-foreground text-card shadow-soft transition-[var(--transition-smooth)] hover:opacity-90 disabled:opacity-40"
                  aria-label={t("send_aria")}
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
            <DialogTitle>{t("dialog_new_title")}</DialogTitle>
            <DialogDescription>
              {t("dialog_new_desc")}
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={newChatSearch}
              onChange={(e) => setNewChatSearch(e.target.value)}
              type="text"
              placeholder={t("dialog_search_placeholder")}
              className="h-10 w-full rounded-full border border-border bg-card pl-10 pr-4 text-sm shadow-soft outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <ul className="flex max-h-80 flex-col overflow-y-auto sidebar-scroll">
            {newChatCandidates.length === 0 && (
              <li className="p-6 text-center text-xs text-muted-foreground">
                {t("dialog_no_contacts")}
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
            <Button variant="ghost" onClick={() => setShowNewChat(false)}>{t("close")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Chat;
