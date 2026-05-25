import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { dateLocaleTag } from "@/lib/i18nDateLocale";
import {
  FolderOpen, Plus, Search, Loader2, FileSignature, FileText, Info,
  CheckCircle2, Clock, XCircle, Pencil, Trash2, AlertTriangle, ExternalLink,
  Send, Users, Eye, Settings2,
} from "lucide-react";
import { DocumentUpload } from "@/components/documents/DocumentUpload";
import { PdfFieldEditor, type FieldDef } from "@/components/documents/PdfFieldEditor";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { toast } from "@/hooks/use-toast";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { isSchoolManagementRole } from "@/lib/schoolStaffRoles";
import { showPageKpiCards } from "@/lib/nativeApp";
import { effectiveSchoolIdFromProfile } from "@/lib/effectiveTenant";
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
  pdf_template_url: string | null;
  content_text: string | null;
  signature_fields: FieldDef[] | null;
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
  signed_at: string | null;
  signer_name: string | null;
  signature_data: string | null;
  signed_pdf_url: string | null;
  created_at: string;
  document?: Document;
  student?: { full_name: string } | null;
  recipient?: { full_name: string } | null;
};

type Classroom = { id: string; name: string };

type DocWithStats = Document & {
  total: number;
  pending: number;
  signed: number;
};

const emptyForm = {
  title: "",
  description: "",
  content_text: "",
  category: "assinatura" as DocCategory,
  target_role: "PARENT" as DocTarget,
  required: false,
  expires_at: "",
  pdf_template_url: "",
  pdf_template_name: "",
  signature_fields: null as FieldDef[] | null,
};

const isExpired = (expires_at: string | null) => {
  if (!expires_at) return false;
  return new Date(expires_at) < new Date();
};

export default function Documentos() {
  const { t, i18n } = useTranslation("pages", { keyPrefix: "documentos" });
  const locale = dateLocaleTag(i18n.language);
  const formatDate = useCallback(
    (iso: string | null) => {
      if (!iso) return t("em_dash");
      return new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
    },
    [locale, t],
  );

  const CATEGORY_META = useMemo(
    (): Record<DocCategory, { label: string; icon: typeof FileSignature; color: string }> => ({
      assinatura: { label: t("category.assinatura"), icon: FileSignature, color: "bg-pastel-blue text-pastel-blue-foreground" },
      formulario: { label: t("category.formulario"), icon: FileText, color: "bg-pastel-yellow text-pastel-yellow-foreground" },
      informativo: { label: t("category.informativo"), icon: Info, color: "bg-pastel-green text-pastel-green-foreground" },
    }),
    [t],
  );

  const TARGET_LABEL = useMemo(
    (): Record<DocTarget, string> => ({
      PARENT: t("target.PARENT"),
      TEACHER: t("target.TEACHER"),
      ALL: t("target.ALL"),
    }),
    [t],
  );

  const REQUEST_STATUS_META = useMemo(
    (): Record<RequestStatus, { label: string; icon: typeof CheckCircle2; color: string }> => ({
      pending: { label: t("request_status.pending"), icon: Clock, color: "bg-pastel-yellow text-pastel-yellow-foreground" },
      signed: { label: t("request_status.signed"), icon: CheckCircle2, color: "bg-pastel-green text-pastel-green-foreground" },
      submitted: { label: t("request_status.submitted"), icon: CheckCircle2, color: "bg-pastel-blue text-pastel-blue-foreground" },
      declined: { label: t("request_status.declined"), icon: XCircle, color: "bg-pastel-pink text-pastel-pink-foreground" },
    }),
    [t],
  );

  const { user } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const { schoolId: ctxSchoolId, selectedYearId } = useAcademicYear();
  const isPrivileged = isSchoolManagementRole(role);
  const navigate = useNavigate();

  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocWithStats[]>([]);
  const [myRequests, setMyRequests] = useState<DocumentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"todos" | "pendentes" | "respostas">("todos");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Document | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteDoc, setDeleteDoc] = useState<Document | null>(null);

  // PDF field editor
  const [fieldEditorOpen, setFieldEditorOpen] = useState(false);

  // Send requests dialog
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendDoc, setSendDoc] = useState<Document | null>(null);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState<string>("all");
  const [sendingRequests, setSendingRequests] = useState(false);

  // Admin requests view
  const [docRequests, setDocRequests] = useState<DocumentRequest[]>([]);
  const [requestsDocId, setRequestsDocId] = useState<string | null>(null);
  const [requestsLoading, setRequestsLoading] = useState(false);

  // Signed document viewer
  const [viewerRequest, setViewerRequest] = useState<DocumentRequest | null>(null);

  // Load school_id from profile
  const loadSchool = useCallback(async () => {
    if (!user?.id) return null;
    const sid = ctxSchoolId ?? null;
    if (sid) { setSchoolId(sid); return sid; }
    const { data } = await supabase
      .from("profiles")
      .select("school_id, support_context_school_id")
      .eq("id", user.id)
      .maybeSingle();
    const s = effectiveSchoolIdFromProfile(data);
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
        toast({ title: t("toast.load_documents_error"), description: error.message, variant: "destructive" });
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
  }, [t]);

  const loadMyRequests = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from("document_requests")
      .select("*, document:document_id(*), student:student_id(full_name)")
      .eq("recipient_profile_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      if (!error.message.includes("does not exist")) {
        toast({ title: t("toast.load_requests_error"), description: error.message, variant: "destructive" });
      }
      setMyRequests([]);
      return;
    }
    setMyRequests((data ?? []) as unknown as DocumentRequest[]);
  }, [user?.id, t]);

  const loadClassrooms = useCallback(async (sid: string, yearId?: string | null) => {
    if (yearId) {
      // Get school's classroom IDs first
      const { data: schoolCls } = await supabase
        .from("classrooms")
        .select("id")
        .eq("school_id", sid);

      const schoolClsIds = (schoolCls ?? []).map((c: any) => c.id as string);
      if (schoolClsIds.length === 0) { setClassrooms([]); return; }

      // Get distinct classroom_ids that have enrollments in the selected year
      const { data: enr } = await supabase
        .from("enrollments")
        .select("classroom_id")
        .eq("academic_year_id", yearId)
        .in("classroom_id", schoolClsIds);

      const distinctIds = [...new Set((enr ?? []).map((e: any) => e.classroom_id as string))];
      if (distinctIds.length === 0) { setClassrooms([]); return; }

      const { data: cls } = await supabase
        .from("classrooms")
        .select("id, name")
        .in("id", distinctIds)
        .order("name");
      setClassrooms((cls ?? []) as Classroom[]);
    } else {
      const { data } = await supabase
        .from("classrooms")
        .select("id, name")
        .eq("school_id", sid)
        .order("name");
      setClassrooms((data ?? []) as Classroom[]);
    }
  }, []);

  const loadDocRequests = useCallback(async (docId: string) => {
    setRequestsLoading(true);
    const { data, error } = await supabase
      .from("document_requests")
      .select("*, student:student_id(full_name), recipient:recipient_profile_id(full_name), signature_data, signed_pdf_url, signed_at, signer_name")
      .eq("document_id", docId)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: t("toast.load_responses_error"), description: error.message, variant: "destructive" });
    }
    setDocRequests((data ?? []) as unknown as DocumentRequest[]);
    setRequestsLoading(false);
  }, [t]);

  const handleOpenSendDialog = async (doc: Document) => {
    setSendDoc(doc);
    setSelectedClassroom("all");
    setSendDialogOpen(true);
    if (schoolId) await loadClassrooms(schoolId, selectedYearId);
  };

  const handleSendRequests = async () => {
    if (!sendDoc || !schoolId) return;
    setSendingRequests(true);

    // 1. Get students (with parent_id) from enrollments filtered by classroom + year
    let query = supabase
      .from("enrollments")
      .select("classroom_id, student:student_id(id, parent_id, full_name)");

    if (selectedClassroom !== "all") {
      query = query.eq("classroom_id", selectedClassroom);
    } else {
      // Filter by school's classrooms
      const classroomIds = classrooms.map((c) => c.id);
      if (classroomIds.length > 0) query = query.in("classroom_id", classroomIds);
    }
    if (selectedYearId) query = query.eq("academic_year_id", selectedYearId);

    const { data: enrollments, error: enrErr } = await query;
    if (enrErr) {
      toast({ title: t("toast.load_students_error"), description: enrErr.message, variant: "destructive" });
      setSendingRequests(false);
      return;
    }

    // 2. Collect unique parent_ids
    const rows = (enrollments ?? []) as { classroom_id: string | null; student: { id: string; parent_id: string | null; full_name: string } | null }[];
    const seen = new Set<string>();
    const requests: { document_id: string; recipient_profile_id: string; student_id: string; classroom_id: string | null; status: string }[] = [];

    for (const row of rows) {
      const student = row.student;
      if (!student) continue;
      const parentId = student.parent_id;
      if (!parentId) continue;
      const key = `${parentId}-${student.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      requests.push({
        document_id: sendDoc.id,
        recipient_profile_id: parentId,
        student_id: student.id,
        classroom_id: row.classroom_id ?? null,
        status: "pending",
      });
    }

    if (requests.length === 0) {
      toast({ title: t("toast.no_guardians_title"), description: t("toast.no_guardians_desc"), variant: "destructive" });
      setSendingRequests(false);
      return;
    }

    const { data: inserted, error: insErr } = await supabase
      .from("document_requests")
      .insert(requests)
      .select("id");
    setSendingRequests(false);

    if (insErr) {
      toast({ title: t("toast.send_requests_error"), description: insErr.message, variant: "destructive" });
      return;
    }

    toast({
      title: t("toast.requests_created", { count: requests.length }),
      description: t("toast.sending_emails"),
    });
    setSendDialogOpen(false);
    if (schoolId) await loadDocuments(schoolId);

    // Fire-and-forget: call email edge function
    const insertedIds = (inserted ?? []).map((r: { id: string }) => r.id);
    if (insertedIds.length > 0) {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const appUrl = window.location.origin;
      supabase.functions
        .invoke("document-sign-request", {
          body: { document_request_ids: insertedIds, app_url: appUrl },
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        .then(({ error: fnErr }) => {
          if (fnErr) console.warn("document-sign-request email error:", fnErr);
          else toast({ title: t("toast.emails_sent") });
        });
    }
  };

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
      content_text: doc.content_text ?? "",
      category: doc.category,
      target_role: doc.target_role,
      required: doc.required,
      expires_at: doc.expires_at ?? "",
      pdf_template_url: doc.pdf_template_url ?? doc.file_url ?? "",
      pdf_template_name: doc.pdf_template_url ? t("dialog.existing_file") : "",
      signature_fields: doc.signature_fields ?? null,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast({ title: t("toast.title_required"), variant: "destructive" });
      return;
    }
    if (!schoolId) return;
    setSaving(true);
    const payload = {
      school_id: schoolId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      content_text: form.content_text.trim() || null,
      category: form.category,
      target_role: form.target_role,
      required: form.required,
      expires_at: form.expires_at || null,
      pdf_template_url: form.pdf_template_url.trim() || null,
      file_url: form.pdf_template_url.trim() || null, // keep file_url in sync
      signature_fields: (form.signature_fields ?? null) as unknown as Json,
      created_by: user?.id ?? null,
      status: "active" as const,
    };

    const { error } = editing
      ? await supabase.from("documents").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editing.id)
      : await supabase.from("documents").insert(payload);

    setSaving(false);
    if (error) {
      toast({ title: t("toast.save_error"), description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing ? t("toast.updated") : t("toast.created") });
    setDialogOpen(false);
    if (schoolId) await loadDocuments(schoolId);
  };

  const handleArchive = async (doc: Document) => {
    const newStatus = doc.status === "active" ? "archived" : "active";
    const { error } = await supabase.from("documents").update({ status: newStatus }).eq("id", doc.id);
    if (error) { toast({ title: t("toast.error"), description: error.message, variant: "destructive" }); return; }
    toast({ title: newStatus === "archived" ? t("toast.archived") : t("toast.reactivated") });
    if (schoolId) await loadDocuments(schoolId);
  };

  const handleDelete = async () => {
    if (!deleteDoc) return;
    const { error } = await supabase.from("documents").delete().eq("id", deleteDoc.id);
    if (error) { toast({ title: t("toast.delete_error"), description: error.message, variant: "destructive" }); return; }
    toast({ title: t("toast.deleted") });
    setDeleteDoc(null);
    if (schoolId) await loadDocuments(schoolId);
  };

  const handleRespond = async (reqId: string, status: RequestStatus) => {
    const { error } = await supabase
      .from("document_requests")
      .update({ status, responded_at: new Date().toISOString() })
      .eq("id", reqId);
    if (error) { toast({ title: t("toast.error"), description: error.message, variant: "destructive" }); return; }
    toast({
      title:
        status === "signed"
          ? t("toast.signed")
          : status === "submitted"
            ? t("toast.submitted")
            : t("toast.response_sent"),
    });
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

  // Build a quick lookup: document_id → my request
  const myRequestByDocId = useMemo(
    () => Object.fromEntries(myRequests.map((r) => [r.document_id, r])),
    [myRequests],
  );

  // Whether this document is addressed to the current user's role
  const isDocForMe = useCallback((doc: Document) => {
    if (doc.target_role === "ALL") return true;
    if (doc.target_role === "PARENT" && role === "PARENT") return true;
    if (doc.target_role === "TEACHER" && role === "TEACHER") return true;
    return false;
  }, [role]);

  // Find or create a document_request for this user, then navigate to sign page
  const handleSignOrCreate = useCallback(async (doc: Document) => {
    if (!user?.id) return;
    const existing = myRequestByDocId[doc.id];
    if (existing) {
      navigate(`/documentos/assinar/${existing.id}`);
      return;
    }
    // Create a request on-the-fly
    const { data, error } = await supabase
      .from("document_requests")
      .insert({ document_id: doc.id, recipient_profile_id: user.id, status: "pending" })
      .select("id")
      .single();
    if (error || !data) {
      toast({ title: t("toast.open_error"), description: error?.message, variant: "destructive" });
      return;
    }
    navigate(`/documentos/assinar/${data.id}`);
  }, [user?.id, myRequestByDocId, navigate]);

  // Auto-switch to "Pendentes" once data loads for non-privileged users with pending items
  useEffect(() => {
    if (!isPrivileged && pendingRequests.length > 0 && activeTab === "todos") {
      setActiveTab("pendentes");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRequests.length, isPrivileged]);

  const kpiCards = useMemo(
    () => [
      { label: t("kpi.total"), value: documents.length, color: "bg-pastel-blue/20 text-pastel-blue-foreground" },
      { label: t("kpi.active"), value: documents.filter((d) => d.status === "active").length, color: "bg-pastel-green/20 text-pastel-green-foreground" },
      { label: t("kpi.pending_response"), value: documents.reduce((s, d) => s + d.pending, 0), color: "bg-pastel-yellow/20 text-pastel-yellow-foreground" },
      { label: t("kpi.archived"), value: documents.filter((d) => d.status === "archived").length, color: "bg-muted text-muted-foreground" },
    ],
    [documents, t],
  );

  return (
    <div className="flex flex-col gap-6 pb-24 lg:pb-8">
      {/* Header */}
      {showPageKpiCards() ? (
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          {isPrivileged && (
            <button
              onClick={openCreate}
              className="flex h-11 w-fit shrink-0 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
            >
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              {t("new_document")}
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 pt-2">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-6 w-6 text-pastel-blue-foreground" strokeWidth={1.75} />
            <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
          </div>
          {isPrivileged && (
            <button
              onClick={openCreate}
              className="flex h-9 items-center gap-1.5 rounded-full bg-pastel-blue px-4 text-xs font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
              {t("new_short")}
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
          <span className="text-sm">{t("loading")}</span>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          {/* Tab bar */}
          <TabsList className="mb-2">
            <TabsTrigger value="todos">{t("tabs.all")}</TabsTrigger>
            {!isPrivileged && (
              <TabsTrigger value="pendentes" className="gap-1.5">
                {t("tabs.pending")}
                {pendingRequests.length > 0 && (
                  <span className="rounded-full bg-pastel-yellow px-1.5 py-0.5 text-[10px] font-semibold text-pastel-yellow-foreground">
                    {pendingRequests.length}
                  </span>
                )}
              </TabsTrigger>
            )}
            {isPrivileged && (
              <TabsTrigger value="respostas" className="gap-1.5">
                {t("tabs.responses")}
                {requestsDocId && docRequests.length > 0 && (
                  <span className="rounded-full bg-pastel-blue/60 px-1.5 py-0.5 text-[10px] font-semibold text-pastel-blue-foreground">
                    {docRequests.length}
                  </span>
                )}
              </TabsTrigger>
            )}
          </TabsList>

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
                  placeholder={t("search_placeholder")}
                  className="h-10 w-full rounded-xl border border-border bg-background pl-10 pr-4 text-sm outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="min-w-[160px]">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder={t("filter_category")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("all_categories")}</SelectItem>
                    <SelectItem value="assinatura">{t("category.assinatura")}</SelectItem>
                    <SelectItem value="formulario">{t("category.formulario")}</SelectItem>
                    <SelectItem value="informativo">{t("category.informativo")}</SelectItem>
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
                    {t("new_document")}
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredDocs.map((doc) => {
                  const catMeta = CATEGORY_META[doc.category];
                  const CatIcon = catMeta.icon;
                  const expired = isExpired(doc.expires_at);
                  // Non-privileged: find this user's request for this document
                  const myReq = !isPrivileged ? myRequestByDocId[doc.id] : undefined;
                  const myReqStatus = myReq?.status as RequestStatus | undefined;
                  const myReqMeta = myReqStatus ? REQUEST_STATUS_META[myReqStatus] : null;
                  const MyReqIcon = myReqMeta?.icon;
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
                                  {t("badge.required")}
                                </span>
                              )}
                              {doc.status === "archived" && (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                  {t("badge.archived")}
                                </span>
                              )}
                              {expired && doc.status === "active" && (
                                <span className="flex items-center gap-1 rounded-full bg-pastel-pink/40 px-2 py-0.5 text-xs text-pastel-pink-foreground">
                                  <AlertTriangle className="h-3 w-3" />
                                  {t("badge.expired")}
                                </span>
                              )}
                            </div>
                            {doc.description && (
                              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{doc.description}</p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              <span>{t("list.recipients")} <span className="font-medium text-foreground">{TARGET_LABEL[doc.target_role]}</span></span>
                              {doc.expires_at && (
                                <span>{t("list.expires")} <span className={cn("font-medium", expired ? "text-pastel-pink-foreground" : "text-foreground")}>{formatDate(doc.expires_at)}</span></span>
                              )}
                              <span>{t("list.created")} <span className="font-medium text-foreground">{formatDate(doc.created_at)}</span></span>
                            </div>
                            {/* Stats — privileged only */}
                            {isPrivileged && doc.total > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                <span className="rounded-full bg-pastel-yellow/50 px-2.5 py-0.5 text-xs font-medium text-pastel-yellow-foreground">
                                  {t("list.pending", { count: doc.pending })}
                                </span>
                                <span className="rounded-full bg-pastel-green/50 px-2.5 py-0.5 text-xs font-medium text-pastel-green-foreground">
                                  {t("list.responded", { count: doc.signed })}
                                </span>
                                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                                  {t("list.total", { count: doc.total })}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex shrink-0 flex-wrap items-center gap-1">
                          {/* ── Non-privileged: sign / status button ── */}
                          {!isPrivileged && doc.status === "active" && !expired && isDocForMe(doc) && (
                            myReqStatus && myReqStatus !== "pending" ? (
                              // Already responded — show status + view icon
                              <div className="flex items-center gap-1.5">
                                {(myReq?.signed_pdf_url || myReq?.signature_data) && (
                                  <button
                                    onClick={() => setViewerRequest(myReq as DocumentRequest)}
                                    className="flex h-8 w-8 items-center justify-center rounded-full text-pastel-blue-foreground transition-colors hover:bg-pastel-blue/20"
                                    title={t("actions.view_signed_doc")}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </button>
                                )}
                                <span className={cn(
                                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
                                  myReqMeta?.color,
                                )}>
                                  {MyReqIcon && <MyReqIcon className="h-3.5 w-3.5" />}
                                  {myReqMeta?.label}
                                </span>
                              </div>
                            ) : (
                              // Pending or no request yet
                              <button
                                onClick={() => void handleSignOrCreate(doc)}
                                className={cn(
                                  "flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-semibold shadow-soft hover:opacity-90",
                                  doc.category === "assinatura"
                                    ? "bg-pastel-green text-pastel-green-foreground"
                                    : doc.category === "formulario"
                                      ? "bg-pastel-blue text-pastel-blue-foreground"
                                      : "bg-pastel-green text-pastel-green-foreground",
                                )}
                              >
                                <FileSignature className="h-3.5 w-3.5" />
                                {doc.category === "assinatura"
                                  ? t("actions.sign")
                                  : doc.category === "formulario"
                                    ? t("actions.fill")
                                    : t("actions.confirm_read")}
                              </button>
                            )
                          )}

                          {doc.file_url && (
                            <a
                              href={doc.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60"
                              title={t("actions.open_file")}
                            >
                              <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
                            </a>
                          )}
                          {isPrivileged && (
                            <>
                              {/* View responses */}
                              {doc.total > 0 && (
                                <button
                                  onClick={async () => {
                                    setRequestsDocId(doc.id);
                                    setActiveTab("respostas");
                                    await loadDocRequests(doc.id);
                                  }}
                                  title={t("actions.view_responses")}
                                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-blue/30 hover:text-pastel-blue-foreground"
                                >
                                  <Eye className="h-4 w-4" strokeWidth={1.75} />
                                </button>
                              )}
                              {/* Send requests to parents */}
                              {doc.status === "active" && (
                                <button
                                  onClick={() => handleOpenSendDialog(doc)}
                                  title={t("actions.send_requests")}
                                  className="flex h-9 items-center gap-1.5 rounded-full bg-pastel-blue/20 px-3 text-xs font-semibold text-pastel-blue-foreground transition-colors hover:bg-pastel-blue/40"
                                >
                                  <Send className="h-3.5 w-3.5" strokeWidth={1.75} />
                                  {t("actions.send")}
                                </button>
                              )}
                              <button
                                onClick={() => openEdit(doc)}
                                title={t("actions.edit")}
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
                                title={t("actions.delete")}
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

          {/* ── Aba: Respostas (admin) ── */}
          {isPrivileged && (
            <TabsContent value="respostas" className="mt-0 flex flex-col gap-3">
              {!requestsDocId ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card py-16 text-center shadow-soft">
                  <Eye className="h-10 w-10 text-muted-foreground/40" strokeWidth={1.25} />
                  <p className="text-sm text-muted-foreground">{t("responses_tab.hint")}</p>
                </div>
              ) : requestsLoading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">{t("loading_responses")}</span>
                </div>
              ) : docRequests.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card py-16 text-center shadow-soft">
                  <Users className="h-10 w-10 text-muted-foreground/40" strokeWidth={1.25} />
                  <p className="text-sm text-muted-foreground">{t("responses_tab.empty")}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="rounded-2xl border border-border bg-card shadow-soft overflow-hidden">
                    <div className="border-b border-border bg-muted/30 px-4 py-3">
                      <p className="text-sm font-semibold text-foreground">
                        {documents.find((d) => d.id === requestsDocId)?.title ?? t("responses_tab.fallback_title")}
                      </p>
                    </div>
                    <div className="divide-y divide-border">
                      {docRequests.map((req) => {
                        const statusMeta = REQUEST_STATUS_META[req.status as RequestStatus] ?? REQUEST_STATUS_META.pending;
                        const StatusIcon = statusMeta.icon;
                        const hasSigned = req.status === "signed" || req.status === "submitted";
                        return (
                          <div key={req.id} className="flex items-center justify-between gap-3 px-4 py-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground">
                                {req.recipient?.full_name ?? req.signer_name ?? t("em_dash")}
                              </p>
                              {req.student && (
                                <p className="text-xs text-muted-foreground">
                                  {t("list.student")} {req.student.full_name}
                                </p>
                              )}
                              {req.signed_at && (
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(req.signed_at)}
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {hasSigned && (req.signed_pdf_url || req.signature_data) && (
                                <button
                                  onClick={() => setViewerRequest(req)}
                                  className="flex h-8 items-center gap-1.5 rounded-full bg-pastel-blue/20 px-3 text-xs font-semibold text-pastel-blue-foreground hover:bg-pastel-blue/40"
                                  title={t("actions.view_signed_doc")}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  {t("actions.view_signature")}
                                </button>
                              )}
                              <span className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", statusMeta.color)}>
                                <StatusIcon className="h-3 w-3" />
                                {statusMeta.label}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>
          )}

          {/* ── Aba: Pendentes (parent/teacher) ── */}
          {!isPrivileged && (
            <TabsContent value="pendentes" className="mt-0 flex flex-col gap-3">
              {pendingRequests.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card py-20 text-center shadow-soft">
                  <CheckCircle2 className="h-10 w-10 text-pastel-green-foreground/60" strokeWidth={1.25} />
                  <p className="text-sm text-muted-foreground">{t("pending_tab.all_done")}</p>
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
                                <span className="rounded-full bg-pastel-pink/60 px-2 py-0.5 text-xs font-medium text-pastel-pink-foreground">{t("badge.required")}</span>
                              )}
                            </div>
                            {doc.description && <p className="mt-1 text-sm text-muted-foreground">{doc.description}</p>}
                            {req.student && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {t("list.student")} <span className="font-medium text-foreground">{req.student.full_name}</span>
                              </p>
                            )}
                            {doc.expires_at && (
                              <p className={cn("mt-1 text-xs", isExpired(doc.expires_at) ? "text-pastel-pink-foreground font-medium" : "text-muted-foreground")}>
                                {isExpired(doc.expires_at) ? t("list.expired_on") : t("list.expires_on")}{formatDate(doc.expires_at)}
                              </p>
                            )}
                            {doc.file_url && (
                              <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-pastel-blue-foreground hover:underline">
                                <ExternalLink className="h-3 w-3" /> {t("actions.view_document")}
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          {/* Navigate to full sign page for signature/formulario */}
                          {(doc.category === "assinatura" || doc.category === "formulario") && (
                            <button
                              onClick={() => navigate(`/documentos/assinar/${req.id}`)}
                              className={cn(
                                "flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-semibold shadow-soft hover:opacity-90",
                                doc.category === "assinatura"
                                  ? "bg-pastel-green text-pastel-green-foreground"
                                  : "bg-pastel-blue text-pastel-blue-foreground",
                              )}
                            >
                              <FileSignature className="h-3.5 w-3.5" />
                              {doc.category === "assinatura" ? t("actions.sign") : t("actions.fill")}
                            </button>
                          )}
                          {doc.category === "informativo" && (
                            <button
                              onClick={() => handleRespond(req.id, "signed")}
                              className="flex h-9 items-center gap-1.5 rounded-full bg-pastel-green px-4 text-xs font-semibold text-pastel-green-foreground shadow-soft hover:opacity-90"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {t("actions.confirm_read")}
                            </button>
                          )}
                          <button
                            onClick={() => handleRespond(req.id, "declined")}
                            className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-4 text-xs font-semibold text-muted-foreground shadow-soft hover:bg-pastel-pink/20"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            {t("actions.decline")}
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
        <DialogContent className="flex max-h-[90vh] max-w-lg flex-col gap-0 p-0">
          <DialogHeader className="shrink-0 border-b border-border px-6 py-5">
            <DialogTitle>{editing ? t("dialog.edit_title") : t("dialog.new_title")}</DialogTitle>
            <DialogDescription>
              {editing ? t("dialog.edit_desc") : t("dialog.new_desc")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
            <div className="space-y-1.5">
              <Label>{t("dialog.title_label")}</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={t("dialog.title_placeholder")}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t("dialog.category_label")}</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as DocCategory }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="assinatura">{t("category.assinatura")}</SelectItem>
                    <SelectItem value="formulario">{t("category.formulario")}</SelectItem>
                    <SelectItem value="informativo">{t("category.informativo")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("dialog.recipients_label")}</Label>
                <div className="flex h-10 items-center rounded-xl border border-border bg-muted/40 px-3 text-sm text-muted-foreground">
                  {t("target.PARENT")}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t("dialog.description_label")}</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={t("dialog.description_placeholder")}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t("dialog.expires_label")}</Label>
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
                  <span className="font-medium">{t("dialog.required_checkbox")}</span>
                </label>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t("dialog.pdf_label")}</Label>
              <DocumentUpload
                schoolId={schoolId}
                currentUrl={form.pdf_template_url || null}
                currentFileName={form.pdf_template_name || null}
                accept=".pdf"
                onUpload={(url, name) => setForm((f) => ({ ...f, pdf_template_url: url, pdf_template_name: name }))}
                onClear={() => setForm((f) => ({ ...f, pdf_template_url: "", pdf_template_name: "", signature_fields: null }))}
              />
              {form.pdf_template_url && (
                <button
                  type="button"
                  onClick={() => setFieldEditorOpen(true)}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-pastel-blue/60 bg-pastel-blue/10 py-2.5 text-sm font-semibold text-pastel-blue-foreground hover:bg-pastel-blue/20"
                >
                  <Settings2 className="h-4 w-4" />
                  {form.signature_fields && form.signature_fields.length > 0
                    ? t("dialog.configure_fields_count", { count: form.signature_fields.length })
                    : t("dialog.configure_fields")}
                </button>
              )}
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border px-6 py-4">
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>{t("dialog.cancel")}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? t("dialog.save") : t("dialog.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Signed document viewer dialog */}
      <Dialog open={!!viewerRequest} onOpenChange={(o) => !o && setViewerRequest(null)}>
        <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col gap-0 p-0">
          <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-pastel-blue-foreground" />
              {t("viewer.title")}
            </DialogTitle>
            <DialogDescription>
              {viewerRequest?.recipient?.full_name ?? viewerRequest?.signer_name ?? t("em_dash")}
              {viewerRequest?.signed_at && (
                <span className="ml-2 text-xs">• {formatDate(viewerRequest.signed_at)}</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
            {/* Signed PDF — full inline viewer */}
            {viewerRequest?.signed_pdf_url ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">{t("viewer.pdf_embedded")}</p>
                  <a
                    href={viewerRequest.signed_pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-full bg-pastel-blue/20 px-3 py-1.5 text-xs font-semibold text-pastel-blue-foreground hover:bg-pastel-blue/40"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t("viewer.open_download")}
                  </a>
                </div>
                <div className="overflow-hidden rounded-xl border border-border" style={{ height: 500 }}>
                  <iframe
                    src={viewerRequest.signed_pdf_url}
                    className="h-full w-full"
                    title={t("viewer.iframe_title")}
                  />
                </div>
              </div>
            ) : viewerRequest?.signature_data ? (
              /* No signed PDF — show the drawn signature image */
              <div className="flex flex-col gap-3">
                <p className="text-sm font-semibold text-foreground">{t("viewer.digital_signature")}</p>
                <div className="flex justify-center rounded-2xl border border-pastel-green/40 bg-pastel-green/10 p-6">
                  <img
                    src={viewerRequest.signature_data}
                    alt={t("viewer.signature_alt")}
                    className="max-h-40 object-contain"
                  />
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  {t("viewer.no_pdf_note")}
                </p>
              </div>
            ) : null}

            {/* Signer info */}
            {viewerRequest?.signer_name && (
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                <p className="text-xs text-muted-foreground">{t("viewer.signed_by")}</p>
                <p className="mt-0.5 text-sm font-semibold text-foreground">{viewerRequest.signer_name}</p>
                {viewerRequest.signed_at && (
                  <p className="text-xs text-muted-foreground">{formatDate(viewerRequest.signed_at)}</p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* PDF Field Editor dialog */}
      <Dialog open={fieldEditorOpen} onOpenChange={setFieldEditorOpen}>
        <DialogContent className="max-w-5xl p-0" style={{ height: "90vh", display: "flex", flexDirection: "column" }}>
          <DialogHeader className="sr-only">
            <DialogTitle>{t("dialog.field_editor_sr")}</DialogTitle>
          </DialogHeader>
          {form.pdf_template_url && (
            <div className="flex flex-1 flex-col overflow-hidden">
              <PdfFieldEditor
                pdfUrl={form.pdf_template_url}
                initialFields={form.signature_fields ?? []}
                onSave={(fields) => {
                  setForm((f) => ({ ...f, signature_fields: fields }));
                  setFieldEditorOpen(false);
                  toast({ title: t("toast.fields_saved", { count: fields.length }) });
                }}
                onCancel={() => setFieldEditorOpen(false)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Send requests dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              {t("send_dialog.title")}
            </DialogTitle>
            <DialogDescription>
              {t("send_dialog.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("send_dialog.document_label")}</p>
              <p className="mt-1 text-sm font-medium text-foreground">{sendDoc?.title}</p>
            </div>

            <div className="space-y-1.5">
              <Label>{t("send_dialog.classroom_label")}</Label>
              <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
                <SelectTrigger>
                  <SelectValue placeholder={t("send_dialog.classroom_placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <span className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5" />
                      {t("send_dialog.all_classrooms")}
                    </span>
                  </SelectItem>
                  {classrooms.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {selectedYearId ? t("send_dialog.enrollment_hint_year") : t("send_dialog.enrollment_hint")}
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setSendDialogOpen(false)} disabled={sendingRequests}>
              {t("dialog.cancel")}
            </Button>
            <Button onClick={handleSendRequests} disabled={sendingRequests}>
              {sendingRequests ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("send_dialog.sending")}</>
              ) : (
                <><Send className="mr-2 h-4 w-4" /> {t("send_dialog.submit")}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteDoc} onOpenChange={(o) => !o && setDeleteDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete_dialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("delete_dialog.description", { title: deleteDoc?.title ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("delete_dialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("delete_dialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
