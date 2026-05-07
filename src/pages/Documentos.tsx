import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FolderOpen, Plus, Search, Loader2, FileSignature, FileText, Info,
  CheckCircle2, Clock, XCircle, Pencil, Trash2, AlertTriangle, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { isSchoolManagementRole } from "@/lib/schoolStaffRoles";
import { showPageKpiCards } from "@/lib/nativeApp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type DocCategory = "assinatura" | "formulario" | "informativo";
type DocStatus = "active" | "archived";
type DocTarget = "PARENT" | "TEACHER" | "ALL";
type RequestStatus = "pending" | "signed" | "submitted" | "declined";

type Document = {
  id: string;
  school_id: string | null;
  title: string;
  description: string | null;
  category: DocCategory;
  file_url: string | null;
  created_by: string | null;
  target_role: DocTarget;
  required: boolean;
  expires_at: string | null;
  status: DocStatus;
  created_at: string;
  updated_at: string;
};

type DocumentRequest = {
  id: string;
  document_id: string;
  recipient_profile_id: string | null;
  student_id: string | null;
  status: RequestStatus;
  notes: string | null;
  responded_at: string | null;
  created_at: string;
  document?: Document;
  student?: { full_name: string } | null;
};

type DocWithStats = Document & {
  total: number;
  pending: number;
  signed: number;
};

const CATEGORY_META: Record<DocCategory, { label: string; icon: typeof FileSignature; color: string }> = {
  assinatura: { label: "Assinatura", icon: FileSignature, color: "bg-pastel-blue text-pastel-blue-foreground" },
  formulario: { label: "Formulário", icon: FileText, color: "bg-pastel-yellow text-pastel-yellow-foreground" },
  informativo: { label: "Informativo", icon: Info, color: "bg-pastel-green text-pastel-green-foreground" },
};

const TARGET_LABEL: Record<DocTarget, string> = {
  PARENT: "Encarregados de educação",
  TEACHER: "Professores",
  ALL: "Todos",
};

const REQUEST_STATUS_META: Record<RequestStatus, { label: string; icon: typeof CheckCircle2; color: string }> = {
  pending: { label: "Pendente", icon: Clock, color: "bg-pastel-yellow text-pastel-yellow-foreground" },
  signed: { label: "Assinado", icon: CheckCircle2, color: "bg-pastel-green text-pastel-green-foreground" },
  submitted: { label: "Submetido", icon: CheckCircle2, color: "bg-pastel-blue text-pastel-blue-foreground" },
  declined: { label: "Recusado", icon: XCircle, color: "bg-pastel-pink text-pastel-pink-foreground" },
};

const emptyForm = {
  title: "",
  description: "",
  category: "assinatura" as DocCategory,
  target_role: "PARENT" as DocTarget,
  required: false,
  expires_at: "",
  file_url: "",
};

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
};

const isExpired = (expires_at: string | null) => {
  if (!expires_at) return false;
  return new Date(expires_at) < new Date();
};

export default function Documentos() {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const { schoolId: ctxSchoolId } = useAcademicYear();
  const isPrivileged = isSchoolManagementRole(role);

  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocWithStats[]>([]);
  const [myRequests, setMyRequests] = useState<DocumentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"todos" | "pendentes">("todos");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Document | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteDoc, setDeleteDoc] = useState<Document | null>(null);

  // Load school_id from profile
  const loadSchool = useCallback(async () => {
    if (!user?.id) return null;
    const sid = ctxSchoolId ?? null;
    if (sid) { setSchoolId(sid); return sid; }
    const { data } = await supabase.from("profiles").select("school_id").eq("id", user.id).maybeSingle();
    const s = data?.school_id ?? null;
    setSchoolId(s);
    return s;
  }, [user?.id, ctxSchoolId]);

  const loadDocuments = useCallback(async (sid: string) => {
    const { data, error } = await supabase
      .from("documents")
      .select("*, document_requests(id, status)")
      .eq("school_id", sid)
      .order("created_at", { ascending: false });

    if (error) {
      if (!error.message.includes("does not exist")) {
        toast({ title: "Erro a carregar documentos", description: error.message, variant: "destructive" });
      }
      setDocuments([]);
      return;
    }

    const mapped: DocWithStats[] = (data ?? []).map((d: any) => {
      const reqs: { status: string }[] = d.document_requests ?? [];
      return {
        ...d,
        document_requests: undefined,
        total: reqs.length,
        pending: reqs.filter((r) => r.status === "pending").length,
        signed: reqs.filter((r) => r.status === "signed" || r.status === "submitted").length,
      };
    });
    setDocuments(mapped);
  }, []);

  const loadMyRequests = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from("document_requests")
      .select("*, document:document_id(*), student:student_id(full_name)")
      .eq("recipient_profile_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      if (!error.message.includes("does not exist")) {
        toast({ title: "Erro a carregar pedidos", description: error.message, variant: "destructive" });
      }
      setMyRequests([]);
      return;
    }
    setMyRequests((data ?? []) as DocumentRequest[]);
  }, [user?.id]);

  const load = useCallback(async () => {
    setLoading(true);
    const sid = await loadSchool();
    if (sid) await loadDocuments(sid);
    if (!isPrivileged) await loadMyRequests();
    setLoading(false);
  }, [loadSchool, loadDocuments, loadMyRequests, isPrivileged]);

  useEffect(() => {
    if (roleLoading) return;
    void load();
  }, [roleLoading, load]);

  // Dialog helpers
  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (doc: Document) => {
    setEditing(doc);
    setForm({
      title: doc.title,
      description: doc.description ?? "",
      category: doc.category,
      target_role: doc.target_role,
      required: doc.required,
      expires_at: doc.expires_at ?? "",
      file_url: doc.file_url ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast({ title: "Título obrigatório", variant: "destructive" });
      return;
    }
    if (!schoolId) return;
    setSaving(true);
    const payload = {
      school_id: schoolId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category,
      target_role: form.target_role,
      required: form.required,
      expires_at: form.expires_at || null,
      file_url: form.file_url.trim() || null,
      created_by: user?.id ?? null,
      status: "active" as const,
    };

    const { error } = editing
      ? await supabase.from("documents").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editing.id)
      : await supabase.from("documents").insert(payload);

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao guardar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing ? "Documento actualizado" : "Documento criado" });
    setDialogOpen(false);
    if (schoolId) await loadDocuments(schoolId);
  };

  const handleArchive = async (doc: Document) => {
    const newStatus = doc.status === "active" ? "archived" : "active";
    const { error } = await supabase.from("documents").update({ status: newStatus }).eq("id", doc.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: newStatus === "archived" ? "Documento arquivado" : "Documento reactivado" });
    if (schoolId) await loadDocuments(schoolId);
  };

  const handleDelete = async () => {
    if (!deleteDoc) return;
    const { error } = await supabase.from("documents").delete().eq("id", deleteDoc.id);
    if (error) { toast({ title: "Erro ao eliminar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Documento eliminado" });
    setDeleteDoc(null);
    if (schoolId) await loadDocuments(schoolId);
  };

  const handleRespond = async (reqId: string, status: RequestStatus) => {
    const { error } = await supabase
      .from("document_requests")
      .update({ status, responded_at: new Date().toISOString() })
      .eq("id", reqId);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: status === "signed" ? "Documento assinado" : status === "submitted" ? "Formulário submetido" : "Resposta enviada" });
    await loadMyRequests();
  };

  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter((d) => {
      if (categoryFilter !== "all" && d.category !== categoryFilter) return false;
      if (!q) return true;
      return d.title.toLowerCase().includes(q) || (d.description ?? "").toLowerCase().includes(q);
    });
  }, [documents, search, categoryFilter]);

  const pendingRequests = useMemo(() => myRequests.filter((r) => r.status === "pending"), [myRequests]);

  const kpiCards = [
    { label: "Total", value: documents.length, color: "bg-pastel-blue/20 text-pastel-blue-foreground" },
    { label: "Activos", value: documents.filter((d) => d.status === "active").length, color: "bg-pastel-green/20 text-pastel-green-foreground" },
    { label: "Pendentes de resposta", value: documents.reduce((s, d) => s + d.pending, 0), color: "bg-pastel-yellow/20 text-pastel-yellow-foreground" },
    { label: "Arquivados", value: documents.filter((d) => d.status === "archived").length, color: "bg-muted text-muted-foreground" },
  ];

  return (
    <div className="flex flex-col gap-6 pb-24 lg:pb-8">
      {/* Header */}
      {showPageKpiCards() ? (
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Documentos</h1>
            <p className="text-sm text-muted-foreground">
              Gerencie documentos escolares, peça assinaturas e partilhe formulários.
            </p>
          </div>
          {isPrivileged && (
            <button
              onClick={openCreate}
              className="flex h-11 w-fit shrink-0 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
            >
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              Novo documento
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 pt-2">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-6 w-6 text-pastel-blue-foreground" strokeWidth={1.75} />
            <h1 className="text-xl font-bold text-foreground">Documentos</h1>
          </div>
          {isPrivileged && (
            <button
              onClick={openCreate}
              className="flex h-9 items-center gap-1.5 rounded-full bg-pastel-blue px-4 text-xs font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
              Novo
            </button>
          )}
        </div>
      )}

      {/* KPI cards — admin only */}
      {isPrivileged && showPageKpiCards() && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpiCards.map((k) => (
            <div key={k.label} className={cn("rounded-2xl p-4 shadow-soft", k.color)}>
              <p className="text-2xl font-bold tabular-nums">{k.value}</p>
              <p className="mt-0.5 text-xs font-medium opacity-80">{k.label}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">A carregar…</span>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          {/* Tab bar */}
          {!isPrivileged && (
            <TabsList className="mb-2">
              <TabsTrigger value="todos">Todos</TabsTrigger>
              <TabsTrigger value="pendentes" className="gap-1.5">
                Pendentes
                {pendingRequests.length > 0 && (
                  <span className="rounded-full bg-pastel-yellow px-1.5 py-0.5 text-[10px] font-semibold text-pastel-yellow-foreground">
                    {pendingRequests.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          )}

          {/* ── Aba: Todos (admin) / Todos os docs (parent/teacher) ── */}
          <TabsContent value="todos" className="mt-0 flex flex-col gap-4">
            {/* Search + filters */}
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="relative min-w-[200px] flex-[2]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Pesquisar documento…"
                  className="h-10 w-full rounded-xl border border-border bg-background pl-10 pr-4 text-sm outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="min-w-[160px]">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as categorias</SelectItem>
                    <SelectItem value="assinatura">Assinatura</SelectItem>
                    <SelectItem value="formulario">Formulário</SelectItem>
                    <SelectItem value="informativo">Informativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Document list */}
            {filteredDocs.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card py-20 text-center shadow-soft">
                <FolderOpen className="h-10 w-10 text-muted-foreground/40" strokeWidth={1.25} />
                <p className="text-sm text-muted-foreground">
                  {documents.length === 0
                    ? isPrivileged
                      ? "Ainda não existem documentos. Crie o primeiro!"
                      : "Nenhum documento disponível de momento."
                    : "Nenhum documento corresponde aos filtros."}
                </p>
                {isPrivileged && documents.length === 0 && (
                  <button
                    onClick={openCreate}
                    className="mt-1 flex h-10 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft hover:opacity-90"
                  >
                    <Plus className="h-4 w-4" />
                    Novo documento
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredDocs.map((doc) => {
                  const catMeta = CATEGORY_META[doc.category];
                  const CatIcon = catMeta.icon;
                  const expired = isExpired(doc.expires_at);
                  return (
                    <div
                      key={doc.id}
                      className={cn(
                        "rounded-2xl border border-border bg-card p-4 shadow-soft transition-colors",
                        doc.status === "archived" && "opacity-60",
                      )}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 flex-1 gap-3">
                          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", catMeta.color)}>
                            <CatIcon className="h-5 w-5" strokeWidth={1.75} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold text-foreground">{doc.title}</h3>
                              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", catMeta.color)}>
                                {catMeta.label}
                              </span>
                              {doc.required && (
                                <span className="rounded-full bg-pastel-pink/60 px-2 py-0.5 text-xs font-medium text-pastel-pink-foreground">
                                  Obrigatório
                                </span>
                              )}
                              {doc.status === "archived" && (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                  Arquivado
                                </span>
                              )}
                              {expired && doc.status === "active" && (
                                <span className="flex items-center gap-1 rounded-full bg-pastel-pink/40 px-2 py-0.5 text-xs text-pastel-pink-foreground">
                                  <AlertTriangle className="h-3 w-3" />
                                  Expirado
                                </span>
                              )}
                            </div>
                            {doc.description && (
                              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{doc.description}</p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              <span>Destinatários: <span className="font-medium text-foreground">{TARGET_LABEL[doc.target_role]}</span></span>
                              {doc.expires_at && (
                                <span>Expira: <span className={cn("font-medium", expired ? "text-pastel-pink-foreground" : "text-foreground")}>{formatDate(doc.expires_at)}</span></span>
                              )}
                              <span>Criado: <span className="font-medium text-foreground">{formatDate(doc.created_at)}</span></span>
                            </div>
                            {/* Stats — privileged only */}
                            {isPrivileged && doc.total > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                <span className="rounded-full bg-pastel-yellow/50 px-2.5 py-0.5 text-xs font-medium text-pastel-yellow-foreground">
                                  {doc.pending} pendente{doc.pending !== 1 ? "s" : ""}
                                </span>
                                <span className="rounded-full bg-pastel-green/50 px-2.5 py-0.5 text-xs font-medium text-pastel-green-foreground">
                                  {doc.signed} respondido{doc.signed !== 1 ? "s" : ""}
                                </span>
                                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                                  {doc.total} total
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex shrink-0 items-center gap-1">
                          {doc.file_url && (
                            <a
                              href={doc.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60"
                              title="Abrir ficheiro"
                            >
                              <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
                            </a>
                          )}
                          {isPrivileged && (
                            <>
                              <button
                                onClick={() => openEdit(doc)}
                                title="Editar"
                                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-yellow/50 hover:text-pastel-yellow-foreground"
                              >
                                <Pencil className="h-4 w-4" strokeWidth={1.75} />
                              </button>
                              <button
                                onClick={() => handleArchive(doc)}
                                title={doc.status === "active" ? "Arquivar" : "Reactivar"}
                                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60"
                              >
                                {doc.status === "active"
                                  ? <FolderOpen className="h-4 w-4" strokeWidth={1.75} />
                                  : <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />}
                              </button>
                              <button
                                onClick={() => setDeleteDoc(doc)}
                                title="Eliminar"
                                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-pink/50 hover:text-pastel-pink-foreground"
                              >
                                <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Aba: Pendentes (parent/teacher) ── */}
          {!isPrivileged && (
            <TabsContent value="pendentes" className="mt-0 flex flex-col gap-3">
              {pendingRequests.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card py-20 text-center shadow-soft">
                  <CheckCircle2 className="h-10 w-10 text-pastel-green-foreground/60" strokeWidth={1.25} />
                  <p className="text-sm text-muted-foreground">Não tem documentos pendentes. Tudo em dia!</p>
                </div>
              ) : (
                pendingRequests.map((req) => {
                  const doc = req.document as Document | undefined;
                  if (!doc) return null;
                  const catMeta = CATEGORY_META[doc.category ?? "informativo"];
                  const CatIcon = catMeta.icon;
                  return (
                    <div key={req.id} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 gap-3">
                          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", catMeta.color)}>
                            <CatIcon className="h-5 w-5" strokeWidth={1.75} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold text-foreground">{doc.title}</h3>
                              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", catMeta.color)}>{catMeta.label}</span>
                              {doc.required && (
                                <span className="rounded-full bg-pastel-pink/60 px-2 py-0.5 text-xs font-medium text-pastel-pink-foreground">Obrigatório</span>
                              )}
                            </div>
                            {doc.description && <p className="mt-1 text-sm text-muted-foreground">{doc.description}</p>}
                            {req.student && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Aluno: <span className="font-medium text-foreground">{req.student.full_name}</span>
                              </p>
                            )}
                            {doc.expires_at && (
                              <p className={cn("mt-1 text-xs", isExpired(doc.expires_at) ? "text-pastel-pink-foreground font-medium" : "text-muted-foreground")}>
                                {isExpired(doc.expires_at) ? "⚠ Expirado em " : "Expira em "}{formatDate(doc.expires_at)}
                              </p>
                            )}
                            {doc.file_url && (
                              <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-pastel-blue-foreground hover:underline">
                                <ExternalLink className="h-3 w-3" /> Ver documento
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          {doc.category === "assinatura" && (
                            <button
                              onClick={() => handleRespond(req.id, "signed")}
                              className="flex h-9 items-center gap-1.5 rounded-full bg-pastel-green px-4 text-xs font-semibold text-pastel-green-foreground shadow-soft hover:opacity-90"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Assinar
                            </button>
                          )}
                          {doc.category === "formulario" && (
                            <button
                              onClick={() => handleRespond(req.id, "submitted")}
                              className="flex h-9 items-center gap-1.5 rounded-full bg-pastel-blue px-4 text-xs font-semibold text-pastel-blue-foreground shadow-soft hover:opacity-90"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Submeter
                            </button>
                          )}
                          {doc.category === "informativo" && (
                            <button
                              onClick={() => handleRespond(req.id, "signed")}
                              className="flex h-9 items-center gap-1.5 rounded-full bg-pastel-green px-4 text-xs font-semibold text-pastel-green-foreground shadow-soft hover:opacity-90"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Confirmar leitura
                            </button>
                          )}
                          <button
                            onClick={() => handleRespond(req.id, "declined")}
                            className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-4 text-xs font-semibold text-muted-foreground shadow-soft hover:bg-pastel-pink/20"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Recusar
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </TabsContent>
          )}
        </Tabs>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar documento" : "Novo documento"}</DialogTitle>
            <DialogDescription>
              {editing ? "Actualize os dados do documento." : "Crie um novo documento para partilhar com encarregados ou professores."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Autorização visita de estudo"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Categoria *</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as DocCategory }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="assinatura">Assinatura</SelectItem>
                    <SelectItem value="formulario">Formulário</SelectItem>
                    <SelectItem value="informativo">Informativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Destinatários *</Label>
                <Select value={form.target_role} onValueChange={(v) => setForm((f) => ({ ...f, target_role: v as DocTarget }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PARENT">Encarregados</SelectItem>
                    <SelectItem value="TEACHER">Professores</SelectItem>
                    <SelectItem value="ALL">Todos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Descrição opcional do documento…"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Data de expiração</Label>
                <Input
                  type="date"
                  value={form.expires_at}
                  onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
                />
              </div>
              <div className="flex items-end pb-0.5">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.required}
                    onChange={(e) => setForm((f) => ({ ...f, required: e.target.checked }))}
                    className="h-4 w-4 rounded border-border accent-pastel-blue-foreground"
                  />
                  <span className="font-medium">Obrigatório</span>
                </label>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Link para o ficheiro</Label>
              <Input
                value={form.file_url}
                onChange={(e) => setForm((f) => ({ ...f, file_url: e.target.value }))}
                placeholder="https://…"
                type="url"
              />
              <p className="text-xs text-muted-foreground">URL de um PDF, formulário Google, etc.</p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Guardar alterações" : "Criar documento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteDoc} onOpenChange={(o) => !o && setDeleteDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que quer eliminar <strong>{deleteDoc?.title}</strong>?
              Todos os pedidos de resposta associados serão também eliminados. Esta acção não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
