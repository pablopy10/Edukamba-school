import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";
import {
  FileSignature,
  FileDown,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Send,
  User,
  Power,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SignatureCanvas } from "@/components/documents/SignatureCanvas";
import { DocumentUpload } from "@/components/documents/DocumentUpload";
import { notifyModuleAuthorizationAssignees } from "@/lib/notifications/notifyModuleAuthorizationAssignees";
import { downloadModuleAuthorizationPdf } from "@/lib/authorizations/moduleAuthorizationPdf";
import { isModuleAuthorizationStaffViewerRole } from "@/lib/schoolStaffRoles";
import { useAcademicYear } from "@/context/AcademicYearContext";

/** Módulos alinhados à coluna SQL `module`. */
export type AuthorizationModuleKind =
  | "extracurricular"
  | "transport"
  | "meal"
  | "event"
  | "enrollment";

export type AuthorizationFieldType =
  | "text"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "checkbox_group"
  | "signature"
  | "file";

export type AuthorizationFieldDef = {
  id: string;
  type: AuthorizationFieldType;
  label: string;
  required?: boolean;
  options?: string[];
  helper?: string;
};

type TemplateRecipientMode = "classroom_homeroom_teachers" | "named_student_assignee";

type StudentDetailed = {
  id: string;
  full_name: string;
  parent_id: string | null;
  classroom_id: string | null;
  classroom: { id: string; name: string; homeroom_teacher_id: string | null } | null;
};

type NamedDraftRow = { rowKey: string; student_id: string; assignee_pick: "__" | string };

type TemplateRow = {
  id: string;
  school_id: string;
  module: string;
  title: string;
  description: string | null;
  fields: AuthorizationFieldDef[] | unknown;
  is_active: boolean;
  created_at: string;
  recipient_mode?: TemplateRecipientMode | string;
  recipient_classroom_ids?: string[] | unknown;
};

type SubmissionRow = {
  id: string;
  template_id: string;
  student_id: string;
  submitted_by: string;
  responses: Record<string, unknown>;
  signature_data: string | null;
  attachment_urls: { url?: string; name?: string; field_id?: string }[] | null;
  created_at: string;
  student?: { full_name: string } | null;
  submitter?: { full_name: string } | null;
  template?: { title: string; module: string; fields?: unknown; description?: string | null } | null;
};

/** Liga os controlos de preenchimento a um conjunto de estado (formulário novo vs. correção pela escola). */
type ModuleAuthFieldDraftBindings = {
  values: Record<string, unknown>;
  setValues: Dispatch<SetStateAction<Record<string, unknown>>>;
  signatures: Record<string, string>;
  setSignatures: Dispatch<SetStateAction<Record<string, string>>>;
  busy: boolean;
  domNs: string;
};

/** Prepara valores e assinaturas para reabrir uma submissão existente como rascunho editável. */
function buildCorrectionDraftFromSubmission(defs: AuthorizationFieldDef[], sub: SubmissionRow): {
  values: Record<string, unknown>;
  signatures: Record<string, string>;
} {
  const values: Record<string, unknown> = { ...(sub.responses ?? {}) };

  const pool = [...(sub.attachment_urls ?? [])];
  const takeAttachmentForField = (fieldId: string) => {
    const exactIx = pool.findIndex((a) => a.field_id === fieldId);
    if (exactIx >= 0) {
      const [picked] = pool.splice(exactIx, 1);
      return picked ?? null;
    }
    const legacyIx = pool.findIndex((a) => !(a.field_id && String(a.field_id).trim().length));
    if (legacyIx >= 0) {
      const [picked] = pool.splice(legacyIx, 1);
      return picked ?? null;
    }
    return null;
  };

  for (const ff of defs.filter((d) => d.type === "file")) {
    const hasObj =
      values[ff.id] && typeof values[ff.id] === "object" && "url" in (values[ff.id] as object);
    const urlFromResp =
      hasObj && typeof (values[ff.id] as { url?: unknown }).url === "string"
        ? String((values[ff.id] as { url: string }).url).trim()
        : "";
    if (urlFromResp) continue;

    const att = takeAttachmentForField(ff.id);
    if (!att?.url || !String(att.url).trim()) continue;
    const idx = defs.filter((d) => d.type === "file").findIndex((d) => d.id === ff.id);
    values[ff.id] = {
      url: String(att.url).trim(),
      name: att.name?.trim()?.length ? att.name!.trim() : `anexo_${idx >= 0 ? idx + 1 : 1}`,
    };
  }

  const sigDefs = defs.filter((d) => d.type === "signature");
  const signatures: Record<string, string> = {};
  for (const sf of sigDefs) {
    const raw = values[sf.id];
    if (typeof raw === "string" && raw.trim().startsWith("data:image")) {
      signatures[sf.id] = raw.trim();
    }
  }
  if (sigDefs.length > 0 && Object.keys(signatures).length === 0) {
    const legacy = typeof sub.signature_data === "string" ? sub.signature_data.trim() : "";
    if (legacy.startsWith("data:image")) {
      signatures[sigDefs[0]!.id] = legacy;
    }
  }

  return { values, signatures };
}

type Props = {
  module: AuthorizationModuleKind;
  schoolId: string | null;
  userId: string | null;
  role: string | null;
  isParent: boolean;
  childIds: string[];
  canManageTemplates: boolean;
};

/** Título canónico em PT na base de dados (filtro de submissões e modelo público). */
const MODULE_PUBLICATION_TEMPLATE_TITLE: Record<AuthorizationModuleKind, string> = {
  extracurricular: "Formulário de Atividades extracurriculares",
  transport: "Formulário de Transportes",
  meal: "Formulário de Refeições",
  event: "Formulário de Eventos escolares",
  enrollment: "Formulário de Matrículas",
};

function normalizeRecipientMode(raw: unknown): TemplateRecipientMode {
  return raw === "named_student_assignee" ? "named_student_assignee" : "classroom_homeroom_teachers";
}

function parseTemplateClassroomIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

function assigneePickToProfileId(pick: string): string | null {
  if (!pick || pick === "__") return null;
  if (pick.startsWith("parent:")) return pick.slice("parent:".length) || null;
  if (pick.startsWith("direct:")) return pick.slice("direct:".length) || null;
  return null;
}

function parseFields(raw: unknown): AuthorizationFieldDef[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === "object" && "id" in x && "type" in x) as AuthorizationFieldDef[];
}

/** Opções tal como aparecem no editor (uma por linha); mantém entradas vazias para o Enter criar nova linha. */
function optionsFromMultiline(raw: string): string[] {
  return raw.splitr("\n").map((line) => line.trim());
}

function nonEmptyOptions(f: AuthorizationFieldDef): string[] {
  return (f.options ?? []).map((o) => String(o).trim()).filter((o) => o.length > 0);
}

/** Gravação: remove linhas em branco e normaliza texto. */
function normalizeFieldForPersist(f: AuthorizationFieldDef): AuthorizationFieldDef {
  if (f.type !== "select" && f.type !== "radio" && f.type !== "checkbox_group") return f;
  const opts = nonEmptyOptions(f);
  return { ...f, options: opts };
}

export function ModuleAuthorizationsPanel({
  module,
  schoolId,
  userId,
  role,
  isParent,
  childIds,
  canManageTemplates,
}: Props) {
  const { t: tr, i18n } = useTranslation("pages", { keyPrefix: "module_authorizations" });
  const { selectedYearId, selectedYear } = useAcademicYear();

  const dateLocaleTag =
    i18n.language?.startsWith("fr") ? "fr-FR" : i18n.language?.startsWith("pt") ? "pt-PT" : "en-GB";
  const moduleLabel = tr(`module_${module}`);
  const publicationTitleDisplay = tr(`publication_title_${module}`);

  const fieldTypeLabel = useCallback(
    (type: AuthorizationFieldType) => tr(`field_type_${type}`),
    [tr],
  );

  const summarizeRecipient = useCallback(
    (row: TemplateRow) => {
      const mode = normalizeRecipientMode(row.recipient_mode);
      if (mode === "named_student_assignee") return tr("recipient_summary_named");
      const count = parseTemplateClassroomIds(row.recipient_classroom_ids).length;
      return tr("recipient_summary_classes", { count });
    },
    [tr],
  );

  const recipientModes: TemplateRecipientMode[] = ["classroom_homeroom_teachers", "named_student_assignee"];
  const recipientModeTitle = (m: TemplateRecipientMode) =>
    m === "classroom_homeroom_teachers" ? tr("recipient_mode_classroom_title") : tr("recipient_mode_named_title");
  const recipientModeHint = (m: TemplateRecipientMode) =>
    m === "classroom_homeroom_teachers" ? tr("recipient_mode_classroom_hint") : tr("recipient_mode_named_hint");
  const fieldTypes: AuthorizationFieldType[] = [
    "text",
    "textarea",
    "select",
    "radio",
    "checkbox",
    "checkbox_group",
    "signature",
    "file",
  ];

  const [innerTab, setInnerTab] = useState<"preencher" | "historico">("preencher");
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [studentsDetailed, setStudentsDetailed] = useState<StudentDetailed[]>([]);
  const [classroomsForSchool, setClassroomsForSchool] = useState<Array<{ id: string; name: string }>>([]);
  const [myNamedTargeting, setMyNamedTargeting] = useState<Array<{ template_id: string; student_id: string }>>([]);
  const [loading, setLoading] = useState(true);

  const [tplDialog, setTplDialog] = useState(false);
  const [editingTpl, setEditingTpl] = useState<TemplateRow | null>(null);
  const [tplTitle, setTplTitle] = useState("");
  const [tplDesc, setTplDesc] = useState("");
  const [tplFields, setTplFields] = useState<AuthorizationFieldDef[]>([]);
  const [tplSaving, setTplSaving] = useState(false);
  const [tplRecipientMode, setTplRecipientMode] = useState<TemplateRecipientMode>("classroom_homeroom_teachers");
  const [tplClassroomIds, setTplClassroomIds] = useState<Set<string>>(new Set());
  const [tplNamedDrafts, setTplNamedDrafts] = useState<NamedDraftRow[]>([{ rowKey: nanoid(), student_id: "", assignee_pick: "__" }]);
  const [deleteTplId, setDeleteTplId] = useState<string | null>(null);

  const [fillTemplateId, setFillTemplateId] = useState<string>("");
  const [fillStudentId, setFillStudentId] = useState<string>("");
  const [fillValues, setFillValues] = useState<Record<string, unknown>>({});
  const [fillSignatures, setFillSignatures] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const [viewSub, setViewSub] = useState<SubmissionRow | null>(null);
  const [schoolDisplayName, setSchoolDisplayName] = useState<string | null>(null);

  const [staffEditOpen, setStaffEditOpen] = useState(false);
  const [staffEditSub, setStaffEditSub] = useState<SubmissionRow | null>(null);
  const [staffEditVals, setStaffEditVals] = useState<Record<string, unknown>>({});
  const [staffEditSigs, setStaffEditSigs] = useState<Record<string, string>>({});
  const [staffEditSaving, setStaffEditSaving] = useState(false);

  const canStaffCorrectSubmittedAuth = useMemo(() => isModuleAuthorizationStaffViewerRole(role), [role]);

  const allowedStudentIds = useMemo(() => {
    if (!role || role === "STUDENT") return [];
    if (isParent) return childIds;
    if (role === "TEACHER") return [];
    return studentsDetailed.map((s) => s.id);
  }, [role, isParent, childIds, studentsDetailed]);

  const loadAll = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const { data: tData, error: tErr } = await supabase
        .from("module_authorization_templates")
        .selectr("*")
        .eq("school_id", schoolId)
        .eq("module", module)
        .order("created_at", { ascending: false });

      if (tErr?.message?.includes("does not exist")) {
        setTemplates([]);
      } else if (tErr) {
        toast.error(tErr.message);
        setTemplates([]);
      } else {
        setTemplates((tData ?? []) as TemplateRow[]);
      }

      const [{ data: sData }, classroomsRes, namedMineRes, schoolRes] = await Promise.all([
        supabase
          .from("students")
          .select(
            `
            id,
            full_name,
            parent_id,
            classroom_id,
            classroom:classrooms(id, name, homeroom_teacher_id)
          `,
          )
          .eq("school_id", schoolId)
          .order("full_name"),
        canManageTemplates && selectedYearId
          ? supabase
              .from("classrooms")
              .selectr("id, name")
              .eq("school_id", schoolId)
              .eq("academic_year_id", selectedYearId)
              .order("name")
          : Promise.resolve({ data: [], error: null }),
        userId
          ? supabase.from("module_authorization_named_recipients").selectr("template_id, student_id").eq("assignee_profile_id", userId)
          : Promise.resolve({ data: [], error: null }),
        supabase.from("schools").selectr("name").eq("id", schoolId).maybeSingle(),
      ]);

      const schoolNameRaw = schoolRes?.data?.name;
      setSchoolDisplayName(typeof schoolNameRaw === "string" && schoolNameRaw.trim() ? schoolNameRaw.trim() : null);

      setStudentsDetailed(((sData ?? []) as StudentDetailed[]) ?? []);
      if (canManageTemplates) {
        setClassroomsForSchool((classroomsRes.data as { id: string; name: string }[]) ?? []);
      } else {
        setClassroomsForSchool([]);
      }
      setMyNamedTargeting(((namedMineRes.data ?? []) as { template_id: string; student_id: string }[]) ?? []);

      const publicationTitle = MODULE_PUBLICATION_TEMPLATE_TITLE[module];
      const { data: subData, error: subErr } = await supabase
        .from("module_authorization_submissions")
        .select(
          "id, template_id, student_id, submitted_by, responses, signature_data, attachment_urls, created_at, student:students(full_name), submitter:submitted_by(full_name), template:module_authorization_templates!module_authorization_submissions_template_id_fkey!inner(title, module, fields, description)",
        )
        .eq("school_id", schoolId)
        .eq("template.module", module)
        .eq("template.title", publicationTitle)
        .order("created_at", { ascending: false })
        .limit(200);

      if (subErr?.message?.includes("does not exist")) {
        setSubmissions([]);
      } else if (subErr) {
        toast.error(subErr.message);
        setSubmissions([]);
      } else {
        setSubmissions((subData ?? []) as unknown as SubmissionRow[]);
      }
    } finally {
      setLoading(false);
    }
  }, [schoolId, module, canManageTemplates, userId, selectedYearId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const publicationTemplateTitle = MODULE_PUBLICATION_TEMPLATE_TITLE[module];

  const activeTemplates = useMemo(
    () =>
      templates.filter(
        (t) =>
          t.title.trim() === publicationTemplateTitle &&
          t.is_active &&
          parseFields(t.fields).length > 0,
      ),
    [templates, publicationTemplateTitle],
  );

  const selectedTemplate = useMemo(
    () => activeTemplates.find((t) => t.id === fillTemplateId) ?? null,
    [activeTemplates, fillTemplateId],
  );

  const selectedFields = useMemo(
    () => parseFields(selectedTemplate?.fields ?? null),
    [selectedTemplate],
  );

  useEffect(() => {
    if (!fillTemplateId) return;
    if (!activeTemplates.some((t) => t.id === fillTemplateId)) {
      setFillTemplateId("");
      setFillStudentId("");
      setFillValues({});
      setFillSignatures({});
    }
  }, [fillTemplateId, activeTemplates]);

  const handleDownloadBlankTemplatePdf = useCallback(
    async (t: TemplateRow) => {
      const fds = parseFields(t.fields);
      if (!fds.length) {
        toast.error(tr("toast_no_fields_export"));
        return;
      }
      try {
        await downloadModuleAuthorizationPdf(
          {
            mode: "blank",
            moduleAreaLabel: moduleLabel,
            schoolName: schoolDisplayName,
            templateTitle: t.title,
            templateDescription: t.description,
            fields: fds,
          },
          t.title,
        );
        toast.success(tr("toast_pdf_downloaded"));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tr("toast_pdf_error"));
      }
    },
    [module, moduleLabel, schoolDisplayName, tr],
  );

  const handleDownloadSubmissionPdf = useCallback(
    async (s: SubmissionRow) => {
      const tmplRow = templates.find((x) => x.id === s.template_id);
      const fieldsDefs = parseFields((tmplRow?.fields ?? s.template?.fields) ?? []);
      if (!fieldsDefs.length) {
        toast.error(tr("toast_no_fields_pdf"));
        return;
      }
      const tmplTitle = tmplRow?.title ?? s.template?.title ?? tr("authorization_fallback");
      const tmplDesc = tmplRow?.description ?? s.template?.description ?? null;
      try {
        const resp =
          typeof s.responses === "object" && s.responses !== null && !Array.isArray(s.responses)
            ? (s.responses as Record<string, unknown>)
            : {};
        await downloadModuleAuthorizationPdf(
          {
            mode: "response",
            moduleAreaLabel: moduleLabel,
            schoolName: schoolDisplayName,
            templateTitle: tmplTitle,
            templateDescription: tmplDesc,
            fields: fieldsDefs,
            studentName: s.student?.full_name ?? undefined,
            submittedByLabel: s.submitter?.full_name ?? undefined,
            submittedAtIso: s.created_at,
            responses: resp,
            legacySignatureDataUrl: s.signature_data,
            attachments: s.attachment_urls,
          },
          tmplTitle,
        );
        toast.success(tr("toast_pdf_downloaded"));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tr("toast_pdf_error"));
      }
    },
    [module, moduleLabel, schoolDisplayName, templates, tr],
  );

  const openNewTemplate = () => {
    setEditingTpl(null);
    setTplTitle(MODULE_PUBLICATION_TEMPLATE_TITLE[module]);
    setTplDesc("");
    setTplFields([]);
    setTplRecipientMode("classroom_homeroom_teachers");
    setTplClassroomIds(new Set());
    setTplNamedDrafts([{ rowKey: nanoid(), student_id: "", assignee_pick: "__" }]);
    setTplDialog(true);
  };

  const openEditTemplate = (t: TemplateRow) => {
    if (!schoolId) return;
    setEditingTpl(t);
    setTplTitle(t.title);
    setTplDesc(t.description ?? "");
    setTplFields(parseFields(t.fields));
    setTplRecipientMode(normalizeRecipientMode(t.recipient_mode));
    setTplClassroomIds(new Set(parseTemplateClassroomIds(t.recipient_classroom_ids)));
    setTplDialog(true);
    setTplNamedDrafts([{ rowKey: nanoid(), student_id: "", assignee_pick: "__" }]);
    void (async () => {
      const { data: namedRows, error: namedErr } = await supabase
        .from("module_authorization_named_recipients")
        .selectr("student_id, assignee_profile_id")
        .eq("template_id", t.id);
      if (namedErr?.message?.includes("does not exist") || !namedRows?.length) {
        setTplNamedDrafts([{ rowKey: nanoid(), student_id: "", assignee_pick: "__" }]);
        return;
      }
      setTplNamedDrafts(
        namedRows.map((row: { student_id: string; assignee_profile_id: string }) => {
          const st = studentsDetailed.find((s) => s.id === row.student_id);
          const pick =
            st?.parent_id && st.parent_id === row.assignee_profile_id
              ? `parent:${row.assignee_profile_id}`
              : `direct:${row.assignee_profile_id}`;
          return {
            rowKey: nanoid(),
            student_id: row.student_id,
            assignee_pick: pick,
          };
        }),
      );
    })();
  };

  const addField = (type: AuthorizationFieldType) => {
    setTplFields((prev) => [
      ...prev,
      {
        id: nanoid(),
        type,
        label: fieldTypeLabel(type),
        required: false,
        options:
          type === "select" || type === "radio" || type === "checkbox_group"
            ? [tr("default_option_a"), tr("default_option_b")]
            : undefined,
      },
    ]);
  };

  const removeField = (id: string) => setTplFields((prev) => prev.filter((f) => f.id !== id));

  const persistNamedRecipients = async (
    templateId: string,
    pairs: Array<{ student_id: string; assignee_profile_id: string }>,
  ) => {
    const { error: delErr } = await supabase.from("module_authorization_named_recipients").delete().eq("template_id", templateId);
    if (delErr) {
      toast.error(delErr.message);
      throw delErr;
    }
    if (pairs.length === 0) return;
    const { error } = await supabase.from("module_authorization_named_recipients").insert(
      pairs.map((r) => ({
        template_id: templateId,
        student_id: r.student_id,
        assignee_profile_id: r.assignee_profile_id,
      })),
    );
    if (error) {
      toast.error(error.message);
      throw error;
    }
  };

  const saveTemplate = async () => {
    if (!schoolId || !tplTitle.trim()) {
      toast.error(tr("toast_title_required"));
      return;
    }
    if (tplFields.length === 0) {
      toast.error(tr("toast_add_field"));
      return;
    }
    const fieldsToSave = tplFields.map(normalizeFieldForPersist);
    for (const f of fieldsToSave) {
      if (f.type === "select" || f.type === "radio" || f.type === "checkbox_group") {
        const opts = f.options ?? [];
        if (opts.length < 2) {
          toast.error(tr("toast_field_min_options", { label: f.label }));
          return;
        }
      }
    }
    if (tplRecipientMode === "classroom_homeroom_teachers" && tplClassroomIds.size === 0) {
      toast.error(tr("toast_pick_classroom"));
      return;
    }

    const namedPairs: Array<{ student_id: string; assignee_profile_id: string }> = [];
    if (tplRecipientMode === "named_student_assignee") {
      const seenKeys = new Set<string>();
      for (const row of tplNamedDrafts) {
        if (!row.student_id) continue;
        const st = studentsDetailed.find((s) => s.id === row.student_id);
        if (!st?.parent_id) {
          toast.error(tr("toast_student_needs_guardian"));
          return;
        }
        const pid = assigneePickToProfileId(row.assignee_pick);
        if (!pid || pid !== st.parent_id) {
          toast.error(tr("toast_confirm_guardian"));
          return;
        }
        const k = `${row.student_id}:${pid}`;
        if (seenKeys.has(k)) continue;
        seenKeys.add(k);
        namedPairs.push({ student_id: row.student_id, assignee_profile_id: pid });
      }
      if (namedPairs.length === 0) {
        toast.error(tr("toast_add_named_row"));
        return;
      }
    }

    const recipientPayload = {
      recipient_mode: tplRecipientMode,
      recipient_classroom_ids:
        tplRecipientMode === "classroom_homeroom_teachers" ? Array.from(tplClassroomIds) : ([] as string[]),
    };

    setTplSaving(true);
    try {
      const base = {
        title: tplTitle.trim(),
        description: tplDesc.trim() || null,
        fields: fieldsToSave as unknown as never,
      };
      if (editingTpl) {
        const { error } = await supabase
          .from("module_authorization_templates")
          .update({ ...base, ...recipientPayload } as never)
          .eq("id", editingTpl.id);
        if (error) toast.error(error.message);
        else {
          try {
            await persistNamedRecipients(
              editingTpl.id,
              tplRecipientMode === "named_student_assignee" ? namedPairs : [],
            );
          } catch {
            return;
          }
          toast.success(tr("toast_form_updated"));
          setTplDialog(false);
          await loadAll();
          if (canManageTemplates && userId && schoolId && editingTpl.is_active) {
            const nr = await notifyModuleAuthorizationAssignees({
              schoolId,
              actorId: userId,
              module,
              template: {
                id: editingTpl.id,
                title: base.title,
                is_active: true,
                recipient_mode: tplRecipientMode,
                recipient_classroom_ids: recipientPayload.recipient_classroom_ids,
              },
            });
            if (nr.error) toast.warning(tr("toast_notifications_prefix", { error: nr.error }));
            else if (nr.sent > 0) toast.success(tr("toast_notifications_sent", { count: nr.sent }));
          }
        }
      } else {
        const { data: inserted, error } = await supabase
          .from("module_authorization_templates")
          .insert({
            school_id: schoolId,
            module,
            title: base.title,
            description: base.description,
            fields: fieldsToSave as unknown as never,
            is_active: true,
            created_by: userId ?? null,
            ...recipientPayload,
          } as never)
          .selectr("id")
          .single();

        if (error) toast.error(error.message);
        else if (!inserted?.id) toast.error(tr("toast_form_id_error"));
        else {
          try {
            await persistNamedRecipients(
              inserted.id,
              tplRecipientMode === "named_student_assignee" ? namedPairs : [],
            );
          } catch {
            return;
          }
          toast.success(tr("toast_form_created"));
          setTplDialog(false);
          await loadAll();
          if (canManageTemplates && userId && schoolId) {
            const nr = await notifyModuleAuthorizationAssignees({
              schoolId,
              actorId: userId,
              module,
              template: {
                id: inserted.id,
                title: base.title,
                is_active: true,
                recipient_mode: tplRecipientMode,
                recipient_classroom_ids: recipientPayload.recipient_classroom_ids,
              },
            });
            if (nr.error) toast.warning(tr("toast_notifications_prefix", { error: nr.error }));
            else if (nr.sent > 0) toast.success(tr("toast_notifications_sent", { count: nr.sent }));
          }
        }
      }
    } finally {
      setTplSaving(false);
    }
  };

  const confirmDeleteTemplate = async () => {
    if (!deleteTplId) return;
    const { error } = await supabase.from("module_authorization_templates").delete().eq("id", deleteTplId);
    if (error) toast.error(error.message);
    else {
      toast.success(tr("toast_removed"));
      setDeleteTplId(null);
      await loadAll();
    }
  };

  const toggleTemplateActive = async (t: TemplateRow) => {
    const activating = !t.is_active;
    const { error } = await supabase
      .from("module_authorization_templates")
      .update({ is_active: activating })
      .eq("id", t.id);
    if (error) toast.error(error.message);
    else {
      toast.success(activating ? tr("toast_form_activated") : tr("toast_form_deactivated"));
      await loadAll();
      if (activating && canManageTemplates && userId && schoolId && parseFields(t.fields).length > 0) {
        const nr = await notifyModuleAuthorizationAssignees({
          schoolId,
          actorId: userId,
          module,
          template: {
            id: t.id,
            title: t.title,
            is_active: true,
            recipient_mode: t.recipient_mode,
            recipient_classroom_ids: t.recipient_classroom_ids,
          },
        });
        if (nr.error) toast.warning(tr("toast_notifications_prefix", { error: nr.error }));
        else if (nr.sent > 0) toast.success(tr("toast_notifications_sent", { count: nr.sent }));
      }
    }
  };

  const filteredStudentsForFill = useMemo(() => {
    if (!selectedTemplate) return [];
    const mode = normalizeRecipientMode(selectedTemplate.recipient_mode);
    const classIds = new Set(parseTemplateClassroomIds(selectedTemplate.recipient_classroom_ids));
    let pool = studentsDetailed.filter((s) => allowedStudentIds.includes(s.id));

    if (mode === "classroom_homeroom_teachers") {
      pool = pool.filter((s) => !!(s.classroom_id && classIds.has(s.classroom_id)));
    }
    if (mode === "named_student_assignee") {
      const ok = new Set(
        myNamedTargeting.filter((n) => n.template_id === selectedTemplate.id).map((n) => n.student_id),
      );
      pool = pool.filter((s) => ok.has(s.id));
    }
    return [...pool].sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [studentsDetailed, allowedStudentIds, selectedTemplate, myNamedTargeting]);

  const resetFillForm = () => {
    setFillValues({});
    setFillSignatures({});
  };

  useEffect(() => {
    resetFillForm();
  }, [fillTemplateId, fillStudentId]);

  const validateAndSubmit = async () => {
    if (!schoolId || !userId || !selectedTemplate || !fillStudentId) {
      toast.error(tr("toast_pick_form_student"));
      return;
    }
    const errs: string[] = [];
    const mergedResponses: Record<string, unknown> = { ...fillValues };

    for (const f of selectedFields) {
      if (f.type === "signature") {
        const sig = fillSignatures[f.id];
        if (f.required && (!sig || !sig.trim())) errs.push(`${f.label} ${tr("toast_signature_suffix")}`);
        else if (sig) mergedResponses[f.id] = sig;
        continue;
      }
      if (f.type === "file") {
        const v = fillValues[f.id] as { url?: string } | undefined;
        if (f.required && (!v?.url || !String(v.url).trim())) errs.push(f.label);
        continue;
      }
      if (f.type === "checkbox") {
        if (f.required && fillValues[f.id] !== true) errs.push(f.label);
        continue;
      }
      if (f.type === "checkbox_group") {
        const arr = fillValues[f.id] as string[] | undefined;
        if (f.required && (!arr || arr.length === 0)) errs.push(f.label);
        continue;
      }
      const v = fillValues[f.id];
      if (f.required && (v === undefined || v === null || String(v).trim() === "")) errs.push(f.label);
    }

    if (errs.length > 0) {
      toast.error(tr("toast_fill_fields", { fields: errs.join(", ") }));
      return;
    }

    const sigFields = selectedFields.filter((x) => x.type === "signature");
    let primarySignature: string | null = null;
    for (const f of sigFields) {
      const s = fillSignatures[f.id];
      if (s && !primarySignature) primarySignature = s;
    }

    const attachment_urls: { url: string; name: string; field_id: string }[] = [];
    let attachmentCounter = 0;
    for (const f of selectedFields) {
      if (f.type !== "file") continue;
      const v = fillValues[f.id];
      const urlRaw =
        v && typeof v === "object" && "url" in v ? (v as { url?: unknown }).url : undefined;
      if (typeof urlRaw !== "string" || !urlRaw.trim()) continue;
      const nameRaw =
        v && typeof v === "object" && "name" in v ? (v as { name?: unknown }).name : undefined;
      attachmentCounter++;
      attachment_urls.push({
        url: urlRaw.trim(),
        name: typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : `anexo_${attachmentCounter}`,
        field_id: f.id,
      });
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("module_authorization_submissions").insert({
        template_id: selectedTemplate.id,
        school_id: schoolId,
        student_id: fillStudentId,
        submitted_by: userId,
        responses: mergedResponses as never,
        signature_data: primarySignature,
        attachment_urls: attachment_urls as unknown as never,
      });
      if (error) toast.error(error.message);
      else {
        toast.success(tr("toast_authorization_saved"));
        resetFillForm();
        setFillTemplateId("");
        setFillStudentId("");
        setInnerTab("historico");
        await loadAll();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openStaffCorrection = (s: SubmissionRow) => {
    const defs = parseFields(templates.find((x) => x.id === s.template_id)?.fields ?? s.template?.fields ?? []);
    if (!defs.length) {
      toast.error(tr("toast_no_fields_correct"));
      return;
    }
    const { values: initVals, signatures: initSigs } = buildCorrectionDraftFromSubmission(defs, s);
    setStaffEditSub(s);
    setStaffEditVals(initVals);
    setStaffEditSigs(initSigs);
    setStaffEditOpen(true);
    setViewSub(null);
  };

  const closeStaffCorrection = () => {
    setStaffEditOpen(false);
    setStaffEditSub(null);
    setStaffEditVals({});
    setStaffEditSigs({});
  };

  const saveStaffCorrection = async () => {
    if (!schoolId || !staffEditSub) return;
    const defs = parseFields(
      templates.find((x) => x.id === staffEditSub.template_id)?.fields ?? staffEditSub.template?.fields ?? [],
    );
    if (!defs.length) {
      toast.error(tr("toast_no_fields_save_correction"));
      return;
    }
    const errs: string[] = [];
    const mergedResponses: Record<string, unknown> = { ...staffEditVals };
    for (const f of defs) {
      if (f.type === "signature") delete mergedResponses[f.id];
    }

    for (const f of defs) {
      if (f.type === "signature") {
        const sig = staffEditSigs[f.id];
        if (f.required && (!sig || !sig.trim())) errs.push(`${f.label} ${tr("toast_signature_suffix")}`);
        else if (sig) mergedResponses[f.id] = sig;
        continue;
      }
      if (f.type === "file") {
        const v = staffEditVals[f.id] as { url?: string } | undefined;
        if (f.required && (!v?.url || !String(v.url).trim())) errs.push(f.label);
        continue;
      }
      if (f.type === "checkbox") {
        if (f.required && staffEditVals[f.id] !== true) errs.push(f.label);
        continue;
      }
      if (f.type === "checkbox_group") {
        const arr = staffEditVals[f.id] as string[] | undefined;
        if (f.required && (!arr || arr.length === 0)) errs.push(f.label);
        continue;
      }
      const v = staffEditVals[f.id];
      if (f.required && (v === undefined || v === null || String(v).trim() === "")) errs.push(f.label);
    }

    if (errs.length > 0) {
      toast.error(tr("toast_fill_fields", { fields: errs.join(", ") }));
      return;
    }

    const sigFields = defs.filter((x) => x.type === "signature");
    let primarySignature: string | null = null;
    for (const f of sigFields) {
      const sg = staffEditSigs[f.id];
      if (sg && !primarySignature) primarySignature = sg;
    }

    const attachment_urls: { url: string; name: string; field_id: string }[] = [];
    let attachmentCounter = 0;
    for (const f of defs) {
      if (f.type !== "file") continue;
      const fv = staffEditVals[f.id];
      const urlRaw =
        fv && typeof fv === "object" && "url" in fv ? (fv as { url?: unknown }).url : undefined;
      if (typeof urlRaw !== "string" || !urlRaw.trim()) continue;
      const nameRaw = fv && typeof fv === "object" && "name" in fv ? (fv as { name?: unknown }).name : undefined;
      attachmentCounter++;
      attachment_urls.push({
        url: urlRaw.trim(),
        name: typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : `anexo_${attachmentCounter}`,
        field_id: f.id,
      });
    }

    setStaffEditSaving(true);
    try {
      const { error } = await supabase
        .from("module_authorization_submissions")
        .update({
          responses: mergedResponses as never,
          signature_data: primarySignature,
          attachment_urls: attachment_urls as unknown as never,
        })
        .eq("id", staffEditSub.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(tr("toast_correction_saved"));
      closeStaffCorrection();
      await loadAll();
    } finally {
      setStaffEditSaving(false);
    }
  };

  const fillFieldBindings: ModuleAuthFieldDraftBindings = {
    values: fillValues,
    setValues: setFillValues,
    signatures: fillSignatures,
    setSignatures: setFillSignatures,
    busy: submitting,
    domNs: "fill",
  };

  const renderFieldDraft = (f: AuthorizationFieldDef, bindings: ModuleAuthFieldDraftBindings) => {
    const commonLabel = (
      <Label className="text-sm font-medium">
        {f.label}
        {f.required ? <span className="text-destructive"> *</span> : null}
      </Label>
    );

    switch (f.type) {
      case "text":
        return (
          <div key={f.id} className="grid gap-2">
            {commonLabel}
            <Input
              value={(bindings.values[f.id] as string) ?? ""}
              onChange={(e) => bindings.setValues((prev) => ({ ...prev, [f.id]: e.target.value }))}
              placeholder={f.helper ?? ""}
            />
          </div>
        );
      case "textarea":
        return (
          <div key={f.id} className="grid gap-2">
            {commonLabel}
            <Textarea
              rows={4}
              value={(bindings.values[f.id] as string) ?? ""}
              onChange={(e) => bindings.setValues((prev) => ({ ...prev, [f.id]: e.target.value }))}
              placeholder={f.helper ?? ""}
            />
          </div>
        );
      case "select": {
        const choiceOpts = nonEmptyOptions(f);
        return (
          <div key={f.id} className="grid gap-2">
            {commonLabel}
            <Select
              value={(bindings.values[f.id] as string) ?? ""}
              onValueChange={(v) => bindings.setValues((prev) => ({ ...prev, [f.id]: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder={tr("choose_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {choiceOpts.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      }
      case "radio": {
        const choiceOpts = nonEmptyOptions(f);
        return (
          <div key={f.id} className="grid gap-2">
            {commonLabel}
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-3">
              {choiceOpts.map((opt) => (
                <label key={opt} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`radio-${bindings.domNs}-${f.id}`}
                    checked={bindings.values[f.id] === opt}
                    onChange={() => bindings.setValues((prev) => ({ ...prev, [f.id]: opt }))}
                    className="h-4 w-4 accent-primary"
                  />
                  {opt}
                </label>
              ))}
            </div>
          </div>
        );
      }
      case "checkbox":
        return (
          <div key={f.id} className="flex items-center gap-2">
            <Checkbox
              id={`chk-${bindings.domNs}-${f.id}`}
              checked={bindings.values[f.id] === true}
              onCheckedChange={(c) => bindings.setValues((prev) => ({ ...prev, [f.id]: c === true }))}
            />
            <Label htmlFor={`chk-${bindings.domNs}-${f.id}`} className="text-sm font-medium cursor-pointer">
              {f.label}
              {f.required ? <span className="text-destructive"> *</span> : null}
            </Label>
          </div>
        );
      case "checkbox_group": {
        const choiceOpts = nonEmptyOptions(f);
        return (
          <div key={f.id} className="grid gap-2">
            {commonLabel}
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-3">
              {choiceOpts.map((opt) => {
                const set = new Set((bindings.values[f.id] as string[] | undefined) ?? []);
                const on = set.has(opt);
                return (
                  <label key={opt} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={on}
                      onCheckedChange={(c) => {
                        const next = new Set(set);
                        if (c === true) next.add(opt);
                        else next.delete(opt);
                        bindings.setValues((prev) => ({ ...prev, [f.id]: [...next] }));
                      }}
                    />
                    {opt}
                  </label>
                );
              })}
            </div>
          </div>
        );
      }
      case "signature":
        return (
          <div key={f.id} className="grid gap-2">
            {commonLabel}
            <SignatureCanvas
              disabled={bindings.busy}
              existingDataUrl={bindings.signatures[f.id] ?? null}
              onClear={() =>
                bindings.setSignatures((prev) => {
                  const next = { ...prev };
                  delete next[f.id];
                  return next;
                })
              }
              onSave={(dataUrl) => bindings.setSignatures((prev) => ({ ...prev, [f.id]: dataUrl }))}
              className={cn("rounded-2xl border border-border bg-card p-3")}
            />
          </div>
        );
      case "file":
        return (
          <div key={f.id} className="grid gap-2">
            {commonLabel}
            <DocumentUpload
              schoolId={schoolId}
              accept="image/*,.pdf,.doc,.docx"
              currentUrl={(bindings.values[f.id] as { url?: string })?.url}
              currentFileName={(bindings.values[f.id] as { name?: string })?.name}
              onUpload={(url, fileName) => bindings.setValues((prev) => ({ ...prev, [f.id]: { url, name: fileName } }))}
              onClear={() =>
                bindings.setValues((prev) => {
                  const n = { ...prev };
                  delete n[f.id];
                  return n;
                })
              }
              className="rounded-2xl"
            />
          </div>
        );
      default:
        return null;
    }
  };

  const staffCorrectionDefs =
    staffEditOpen && staffEditSub
      ? parseFields(
          templates.find((x) => x.id === staffEditSub.template_id)?.fields ?? staffEditSub.template?.fields ?? [],
        )
      : [];

  const staffFieldBindings: ModuleAuthFieldDraftBindings | null =
    staffEditOpen && staffEditSub
      ? {
          values: staffEditVals,
          setValues: setStaffEditVals,
          signatures: staffEditSigs,
          setSignatures: setStaffEditSigs,
          busy: staffEditSaving,
          domNs: "staff-corr",
        }
      : null;

  if (!schoolId) return <p className="text-sm text-muted-foreground">{tr("loading_school")}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-card/60 p-4 shadow-soft">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <FileSignature className="h-5 w-5 text-primary" />
            {tr("panel_title", { module: moduleLabel })}
          </h2>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            {tr("panel_intro", { module: moduleLabel })}
          </p>
        </div>
        {canManageTemplates ? (
          <Button type="button" size="sm" className="gap-2" onClick={openNewTemplate}>
            <Plus className="h-4 w-4" /> {tr("new_form_button")}
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <>
          {canManageTemplates && templates.length > 0 ? (
            <Card className="overflow-hidden border-border shadow-card">
              <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
                <h3 className="text-sm font-semibold text-foreground">{tr("school_forms_title")}</h3>
                <span className="text-xs text-muted-foreground gap-1 inline-flex items-center">
                  <ClipboardList className="h-3.5 w-3.5" /> {tr("active_inactive_hint")}
                </span>
              </div>
              <ScrollArea className="max-h-56">
                <ul className="divide-y divide-border">
                  {templates.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                      <Badge variant={t.is_active ? "default" : "secondary"}>{t.is_active ? tr("badge_active") : tr("badge_inactive")}</Badge>
                      <span className="flex-1 font-medium">{t.title}</span>
                      <span className="text-muted-foreground">{tr("fields_count", { count: parseFields(t.fields).length })}</span>
                      <Badge variant="outline" className="border-dashed text-[10px] font-normal sm:text-xs">{summarizeRecipient(t)}</Badge>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title={tr("pdf_blank_title")}
                          type="button"
                          onClick={() => handleDownloadBlankTemplatePdf(t)}
                          disabled={parseFields(t.fields).length === 0}
                        >
                          <FileDown className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title={t.is_active ? tr("deactivate_form_title") : tr("activate_form_title")}
                          type="button"
                          onClick={() => void toggleTemplateActive(t)}
                        >
                          <Power className={cn("h-4 w-4", t.is_active ? "text-pastel-green-foreground" : "text-muted-foreground")} />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" type="button" onClick={() => openEditTemplate(t)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" type="button" onClick={() => setDeleteTplId(t.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </Card>
          ) : null}

          <Tabs value={innerTab} onValueChange={(v) => setInnerTab(v as typeof innerTab)}>
            <TabsList className="h-auto flex-wrap gap-1">
              <TabsTrigger value="preencher" className="gap-2">
                <Send className="h-4 w-4" /> {tr("tab_fill")}
              </TabsTrigger>
              <TabsTrigger value="historico" className="gap-2">
                <User className="h-4 w-4" /> {tr("tab_recent_history")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="preencher" className="mt-4 space-y-4">
              {activeTemplates.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                  {canManageTemplates ? (
                    tr("fill_empty_staff", { title: publicationTitleDisplay })
                  ) : (
                    tr("fill_empty_user", { title: publicationTitleDisplay })
                  )}
                </p>
              ) : (
                <Card className="border-border bg-card p-5 shadow-card">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>{tr("label_form")}</Label>
                      <Select value={fillTemplateId} onValueChange={setFillTemplateId}>
                        <SelectTrigger>
                          <SelectValue placeholder={tr("choose_placeholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {activeTemplates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>{tr("label_student")}</Label>
                      <Select value={fillStudentId} onValueChange={setFillStudentId} disabled={filteredStudentsForFill.length === 0}>
                        <SelectTrigger>
                          <SelectValue placeholder={filteredStudentsForFill.length === 0 ? tr("no_students_available") : tr("choose_student")} />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredStudentsForFill.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {selectedTemplate?.description ? (
                    <p className="mt-4 text-xs text-muted-foreground">{selectedTemplate.description}</p>
                  ) : null}
                  <div className="mt-6 space-y-4 border-t border-border pt-6">
                    {selectedFields.map((f) => renderFieldDraft(f, fillFieldBindings))}
                  </div>
                  <div className="mt-6 flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => resetFillForm()} disabled={submitting}>
                      {tr("clear")}
                    </Button>
                    <Button
                      type="button"
                      className="gap-2 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/90"
                      onClick={() => void validateAndSubmit()}
                      disabled={submitting || !fillTemplateId || !fillStudentId}
                    >
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      {tr("submit_authorization")}
                    </Button>
                  </div>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="historico" className="mt-4">
              {canManageTemplates && !canStaffCorrectSubmittedAuth && submissions.length > 0 ? (
                <p className="mb-3 rounded-xl border border-border bg-muted/25 px-4 py-2 text-xs text-muted-foreground">
                  {tr("history_edit_permission_hint")}
                </p>
              ) : null}
              {submissions.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{tr("history_empty")}</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-border shadow-card">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3">{tr("col_date")}</th>
                        <th className="px-4 py-3">{tr("col_form")}</th>
                        <th className="px-4 py-3">{tr("col_student")}</th>
                        {canManageTemplates ? <th className="px-4 py-3">{tr("col_by")}</th> : null}
                        <th className="px-4 py-3 text-right">{tr("col_actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissions.slice(0, 80).map((s) => (
                        <tr key={s.id} className="border-t border-border bg-card hover:bg-muted/20">
                          <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                            {new Date(s.created_at).toLocaleString(dateLocaleTag)}
                          </td>
                          <td className="px-4 py-2 font-medium">{s.template?.title ?? "—"}</td>
                          <td className="px-4 py-2">{s.student?.full_name ?? "—"}</td>
                          {canManageTemplates ? <td className="px-4 py-2">{s.submitter?.full_name ?? "—"}</td> : null}
                          <td className="whitespace-nowrap px-4 py-2 text-right">
                            <div className="flex flex-wrap justify-end gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="h-8 gap-1 text-xs"
                                title={tr("pdf_submission_title")}
                                onClick={() => handleDownloadSubmissionPdf(s)}
                              >
                                <FileDown className="h-3.5 w-3.5" /> {tr("pdf_short")}
                              </Button>
                              <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setViewSub(s)}>
                                {tr("view_answers")}
                              </Button>
                              {canStaffCorrectSubmittedAuth ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  className="h-8 gap-1 text-xs"
                                  title={tr("edit_answers_audit_title")}
                                  onClick={() => openStaffCorrection(s)}
                                >
                                  <Pencil className="h-3.5 w-3.5" /> {tr("edit_answers")}
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      <Dialog open={tplDialog} onOpenChange={setTplDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingTpl ? tr("dialog_edit_form") : tr("dialog_new_form")}</DialogTitle>
            <DialogDescription>{tr("dialog_form_desc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>{tr("label_title")}</Label>
              <Input value={tplTitle} onChange={(e) => setTplTitle(e.target.value)} placeholder={tr("title_placeholder")} />
            </div>
            <div className="grid gap-2">
              <Label>{tr("label_description_optional")}</Label>
              <Textarea rows={3} value={tplDesc} onChange={(e) => setTplDesc(e.target.value)} placeholder={tr("description_placeholder")} />
            </div>

            {canManageTemplates ? (
              <div className="grid gap-2 rounded-xl border border-border bg-muted/20 p-3">
                <Label className="text-sm font-semibold">{tr("recipient_section_title")}</Label>
                <p className="text-[11px] text-muted-foreground">{tr("recipient_section_intro")}</p>
                <div className="flex flex-col gap-2">
                  {recipientModes.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTplRecipientMode(m)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-left transition-[var(--transition-smooth)]",
                        tplRecipientMode === m ? "border-primary bg-primary/10 shadow-sm" : "border-border hover:bg-muted/50",
                      )}
                    >
                      <span className="text-sm font-medium">{recipientModeTitle(m)}</span>
                      <span className="mt-1 block text-xs leading-snug text-muted-foreground">{recipientModeHint(m)}</span>
                    </button>
                  ))}
                </div>

                {tplRecipientMode === "classroom_homeroom_teachers" ? (
                  <div className="mt-1 space-y-2">
                    <p className="text-[11px] text-muted-foreground">
                      {tr("classroom_year_hint", {
                        yearSuffix: selectedYear?.label ? tr("year_suffix", { label: selectedYear.label }) : "",
                      })}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={classroomsForSchool.length === 0}
                        onClick={() =>
                          setTplClassroomIds(new Set(classroomsForSchool.map((c) => c.id)))
                        }
                      >
                        {tr("select_all_classrooms")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={tplClassroomIds.size === 0}
                        onClick={() => setTplClassroomIds(new Set())}
                      >
                        {tr("clear_selection")}
                      </Button>
                    </div>
                    <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border border-border bg-background/80 p-2">
                      {!selectedYearId ? (
                        <p className="text-xs text-muted-foreground">
                          {tr("pick_year_header")}
                        </p>
                      ) : classroomsForSchool.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {tr("no_classrooms_year", { year: selectedYear.label })}
                        </p>
                      ) : (
                        classroomsForSchool.map((c) => (
                          <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                            <Checkbox
                              checked={tplClassroomIds.has(c.id)}
                              onCheckedChange={(chk) =>
                                setTplClassroomIds((prev) => {
                                  const next = new Set(prev);
                                  if (chk === true) next.add(c.id);
                                  else next.delete(c.id);
                                  return next;
                                })
                              }
                            />
                            <span>{c.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}

                {tplRecipientMode === "named_student_assignee" ? (
                  <div className="mt-3 space-y-3">
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        onClick={() =>
                          setTplNamedDrafts((prev) => [
                            ...prev,
                            { rowKey: nanoid(), student_id: "", assignee_pick: "__" },
                          ])
                        }
                      >
                        <Plus className="h-3 w-3" /> {tr("add_recipient")}
                      </Button>
                    </div>
                    {tplNamedDrafts.map((row) => {
                      const st = studentsDetailed.find((s) => s.id === row.student_id);
                      const encOpts: Array<{ value: string; label: string }> = [];
                      if (st?.parent_id)
                        encOpts.push({ value: `parent:${st.parent_id}`, label: tr("guardian_associated_label") });
                      const selectValue = encOpts.some((o) => o.value === row.assignee_pick) ? row.assignee_pick : "__";
                      return (
                        <Card key={row.rowKey} className="border-border bg-card p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
                            <Badge variant="secondary" className="text-[10px]">
                              {tr("badge_named_recipient")}
                            </Badge>
                            {tplNamedDrafts.length > 1 ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[11px] text-destructive"
                                onClick={() =>
                                  setTplNamedDrafts((prev) =>
                                    prev.length <= 1 ? prev : prev.filter((x) => x.rowKey !== row.rowKey),
                                  )
                                }
                              >
                                {tr("remove_row")}
                              </Button>
                            ) : null}
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="grid gap-2">
                              <Label className="text-xs">{tr("label_student")}</Label>
                              <Select
                                value={row.student_id || "__"}
                                onValueChange={(v) => {
                                  const sid = v === "__" ? "" : v;
                                  setTplNamedDrafts((prev) =>
                                    prev.map((x) => (x.rowKey === row.rowKey ? { ...x, student_id: sid, assignee_pick: "__" } : x)),
                                  );
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder={tr("choose_student")} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__">—</SelectItem>
                                  {studentsDetailed.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                      {s.full_name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid gap-2">
                              <Label className="text-xs">{tr("label_guardian_notified")}</Label>
                              <Select
                                value={selectValue}
                                onValueChange={(v) =>
                                  setTplNamedDrafts((prev) =>
                                    prev.map((x) => (x.rowKey === row.rowKey ? { ...x, assignee_pick: v } : x)),
                                  )
                                }
                                disabled={!row.student_id || encOpts.length === 0}
                              >
                                <SelectTrigger>
                                  <SelectValue
                                    placeholder={
                                      !row.student_id
                                        ? tr("pick_student_first")
                                        : encOpts.length === 0
                                          ? tr("no_guardian_for_student")
                                          : tr("confirm_guardian")
                                    }
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__">—</SelectItem>
                                  {encOpts.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                      {o.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 pt-2">
              {fieldTypes.map((ft) => (
                <Button key={ft} type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={() => addField(ft)}>
                  + {fieldTypeLabel(ft)}
                </Button>
              ))}
            </div>

            <div className="space-y-3 pt-2">
              {tplFields.map((f) => (
                <Card key={f.id} className="space-y-3 border-border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline">{fieldTypeLabel(f.type)}</Badge>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-destructive" onClick={() => removeField(f.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs">{tr("field_label")}</Label>
                    <Input
                      value={f.label}
                      onChange={(e) =>
                        setTplFields((prev) => prev.map((x) => (x.id === f.id ? { ...x, label: e.target.value } : x)))
                      }
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`req-${f.id}`}
                      checked={!!f.required}
                      onCheckedChange={(c) =>
                        setTplFields((prev) => prev.map((x) => (x.id === f.id ? { ...x, required: c === true } : x)))
                      }
                    />
                    <Label htmlFor={`req-${f.id}`} className="cursor-pointer text-xs">
                      {tr("required")}
                    </Label>
                  </div>
                  {(f.type === "select" || f.type === "radio" || f.type === "checkbox_group") && (
                    <div className="grid gap-2">
                      <Label className="text-xs">{tr("options_one_per_line")}</Label>
                      <Textarea
                        rows={3}
                        value={(f.options ?? []).join("\n")}
                        onChange={(e) =>
                          setTplFields((prev) =>
                            prev.map((x) => (x.id === f.id ? { ...x, options: optionsFromMultiline(e.target.value) } : x)),
                          )
                        }
                      />
                    </div>
                  )}
                  <div className="grid gap-2">
                    <Label className="text-xs">{tr("helper_optional")}</Label>
                    <Input
                      value={f.helper ?? ""}
                      onChange={(e) =>
                        setTplFields((prev) => prev.map((x) => (x.id === f.id ? { ...x, helper: e.target.value } : x)))
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      setTplFields((prev) => {
                        const cp = [...prev];
                        const i = cp.findIndex((x) => x.id === f.id);
                        if (i <= 0) return prev;
                        [cp[i - 1], cp[i]] = [cp[i], cp[i - 1]];
                        return cp;
                      });
                    }}
                  >
                    {tr("move_up")}
                  </Button>
                </Card>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTplDialog(false)}>
              {tr("cancel")}
            </Button>
            <Button type="button" className="gap-2 bg-pastel-blue text-pastel-blue-foreground" onClick={() => void saveTemplate()} disabled={tplSaving}>
              {tplSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {tr("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTplId} onOpenChange={(o) => !o && setDeleteTplId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("delete_form_title")}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive" onClick={() => void confirmDeleteTemplate()}>
              {tr("remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!viewSub} onOpenChange={(o) => !o && setViewSub(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tr("submission_dialog_title")}</DialogTitle>
            <DialogDescription>
              {viewSub?.template?.title} · {viewSub?.student?.full_name ?? ""}
              {viewSub ? ` · ${new Date(viewSub.created_at).toLocaleString(dateLocaleTag)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {viewSub &&
              (() => {
                const defs = parseFields(
                  templates.find((x) => x.id === viewSub.template_id)?.fields ?? viewSub.template?.fields ?? [],
                );
                const resp = (viewSub.responses ?? {}) as Record<string, unknown>;
                const sawSignatureInResponses = defs.some(
                  (f) => f.type === "signature" && typeof resp[f.id] === "string",
                );
                const els = defs.map((f) => (
                  <div key={f.id} className="rounded-xl border border-border bg-muted/20 p-3">
                    <p className="text-xs font-semibold text-muted-foreground">{f.label}</p>
                    <div className="mt-1 break-words">
                      {f.type === "signature" && typeof resp[f.id] === "string" ? (
                        <img src={resp[f.id] as string} alt={tr("signature_alt")} className="max-h-24 rounded border bg-white p-1" />
                      ) : f.type === "file" &&
                        resp[f.id] &&
                        typeof resp[f.id] === "object" &&
                        (resp[f.id] as { url?: string }).url ? (
                        <a
                          href={(resp[f.id] as { url: string }).url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline"
                        >
                          {(resp[f.id] as { name?: string }).name ?? tr("view_file")}
                        </a>
                      ) : f.type === "checkbox_group" && Array.isArray(resp[f.id]) ? (
                        (resp[f.id] as string[]).join(", ")
                      ) : resp[f.id] !== undefined && resp[f.id] !== null ? (
                        String(resp[f.id])
                      ) : (
                        "—"
                      )}
                    </div>
                  </div>
                ));
                const legacySig =
                  viewSub.signature_data && !sawSignatureInResponses ? (
                    <div className="rounded-xl border border-border p-3">
                      <p className="text-xs font-semibold text-muted-foreground">{tr("signature_record")}</p>
                      <img src={viewSub.signature_data} alt={tr("signature_alt")} className="mt-2 max-h-28 rounded bg-white p-1" />
                    </div>
                  ) : null;
                return (
                  <>
                    {els}
                    {legacySig}
                    {Array.isArray(viewSub.attachment_urls) && viewSub.attachment_urls.length > 0 ? (
                      <div className="rounded-xl border border-border p-3 text-xs">
                        <p className="font-semibold text-muted-foreground">{tr("attachments")}</p>
                        <ul className="mt-2 list-disc pl-5">
                          {viewSub.attachment_urls.map((a, i) => (
                            <li key={`${a.url}-${i}`}>
                              {a.url ? (
                                <a href={a.url} target="_blank" rel="noreferrer" className="text-primary underline">
                                  {a.name ?? tr("file_fallback")}
                                </a>
                              ) : (
                                "—"
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                );
              })()}
          </div>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            {canStaffCorrectSubmittedAuth && viewSub ? (
              <Button
                type="button"
                variant="secondary"
                className="gap-2 sm:mr-auto"
                title={tr("edit_answers_admin_title")}
                onClick={() => {
                  openStaffCorrection(viewSub);
                }}
              >
                <Pencil className="h-4 w-4" /> {tr("edit_answers")}
              </Button>
            ) : (
              <span />
            )}
            <Button
              type="button"
              variant="outline"
              className="gap-2 sm:ml-auto"
              onClick={() => {
                if (viewSub) handleDownloadSubmissionPdf(viewSub);
              }}
            >
              <FileDown className="h-4 w-4" /> {tr("pdf_with_answers")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={staffEditOpen}
        onOpenChange={(o) => {
          if (!o) closeStaffCorrection();
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{tr("staff_correction_title")}</DialogTitle>
            <DialogDescription>{tr("staff_correction_desc")}</DialogDescription>
          </DialogHeader>
          {staffEditSub && staffFieldBindings ? (
            <div className="space-y-4 text-sm">
              <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs leading-relaxed">
                <p className="font-semibold text-foreground">{tr("submission_context")}</p>
                <p className="mt-1 text-muted-foreground">
                  {tr("originally_by")} <strong className="text-foreground">{staffEditSub.submitter?.full_name ?? "—"}</strong>
                  · {tr("student_label")} <strong className="text-foreground">{staffEditSub.student?.full_name ?? "—"}</strong>
                  · {new Date(staffEditSub.created_at).toLocaleString(dateLocaleTag)}
                </p>
              </div>
              <div className="space-y-4 border-t border-border pt-4">
                {staffCorrectionDefs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{tr("no_field_structure")}</p>
                ) : (
                  staffCorrectionDefs.map((f) => renderFieldDraft(f, staffFieldBindings))
                )}
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={staffEditSaving} onClick={() => closeStaffCorrection()}>
              {tr("cancel")}
            </Button>
            <Button type="button" className="gap-2 bg-pastel-blue text-pastel-blue-foreground" onClick={() => void saveStaffCorrection()} disabled={staffEditSaving || staffCorrectionDefs.length === 0}>
              {staffEditSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />} {tr("save_corrections")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
