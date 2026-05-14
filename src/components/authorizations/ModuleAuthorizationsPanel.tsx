import { useCallback, useEffect, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import {
  FileSignature,
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
import { useTeacherModuleAuthStudentIds } from "@/hooks/useHomeroomStudentIds";

/** Módulos alinhados à coluna SQL `module`. */
export type AuthorizationModuleKind = "extracurricular" | "transport" | "meal";

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
  template?: { title: string; module: string } | null;
};

type Props = {
  module: AuthorizationModuleKind;
  schoolId: string | null;
  userId: string | null;
  role: string | null;
  isParent: boolean;
  childIds: string[];
  canManageTemplates: boolean;
};

const MODULE_LABEL: Record<AuthorizationModuleKind, string> = {
  extracurricular: "Extracurriculares",
  transport: "Transporte",
  meal: "Refeições",
};

const RECIPIENT_MODE_META: Record<TemplateRecipientMode, { title: string; hint: string }> = {
  classroom_homeroom_teachers: {
    title: "Educadores das turmas seleccionadas",
    hint:
      "Todos os directores de turma e todos os professores com aulas dessas turmas no horário recebem notificação e podem responder.",
  },
  named_student_assignee: {
    title: "Educador de cada aluno (nominal)",
    hint: "Indique por linha um aluno e o educador (perfil professor) que deve receber e preencher o formulário para esse aluno.",
  },
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
  if (pick.startsWith("direct:")) return pick.slice("direct:".length) || null;
  return null;
}

function templateRecipientSummary(t: TemplateRow): string {
  const mode = normalizeRecipientMode(t.recipient_mode);
  if (mode === "named_student_assignee") return "Destinatários nomeados";
  return `${parseTemplateClassroomIds(t.recipient_classroom_ids).length} turma(s)`;
}

const FIELD_TYPE_META: Record<AuthorizationFieldType, { label: string }> = {
  text: { label: "Texto curto" },
  textarea: { label: "Texto longo" },
  select: { label: "Lista (dropdown)" },
  radio: { label: "Opção única (rádio)" },
  checkbox: { label: "Caixa única (sim/não)" },
  checkbox_group: { label: "Várias opções (caixas)" },
  signature: { label: "Assinatura" },
  file: { label: "Anexo (ficheiro)" },
};

function parseFields(raw: unknown): AuthorizationFieldDef[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === "object" && "id" in x && "type" in x) as AuthorizationFieldDef[];
}

function stringifyOptions(lines: string) {
  return lines
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
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
  const [innerTab, setInnerTab] = useState<"preencher" | "historico">("preencher");
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [studentsDetailed, setStudentsDetailed] = useState<StudentDetailed[]>([]);
  const [classroomsForSchool, setClassroomsForSchool] = useState<Array<{ id: string; name: string }>>([]);
  const [educatorsForSchool, setEducatorsForSchool] = useState<Array<{ id: string; full_name: string | null }>>([]);
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

  const { ids: teacherModuleAuthStudentIds } = useTeacherModuleAuthStudentIds(schoolId, role, userId);

  const allowedStudentIds = useMemo(() => {
    if (!role || role === "STUDENT") return [];
    if (isParent) return childIds;
    if (role === "TEACHER") return teacherModuleAuthStudentIds;
    return studentsDetailed.map((s) => s.id);
  }, [role, isParent, childIds, teacherModuleAuthStudentIds, studentsDetailed]);

  const loadAll = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const { data: tData, error: tErr } = await supabase
        .from("module_authorization_templates")
        .select("*")
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

      const [{ data: sData }, classroomsRes, educatorsRes, namedMineRes] = await Promise.all([
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
        canManageTemplates
          ? supabase.from("classrooms").select("id, name").eq("school_id", schoolId).order("name")
          : Promise.resolve({ data: [], error: null }),
        canManageTemplates
          ? supabase.from("profiles").select("id, full_name").eq("school_id", schoolId).eq("role", "TEACHER").order("full_name")
          : Promise.resolve({ data: [], error: null }),
        userId
          ? supabase.from("module_authorization_named_recipients").select("template_id, student_id").eq("assignee_profile_id", userId)
          : Promise.resolve({ data: [], error: null }),
      ]);

      setStudentsDetailed(((sData ?? []) as StudentDetailed[]) ?? []);
      if (canManageTemplates) {
        setClassroomsForSchool((classroomsRes.data as { id: string; name: string }[]) ?? []);
        if (educatorsRes.error) setEducatorsForSchool([]);
        else setEducatorsForSchool(((educatorsRes.data ?? []) as { id: string; full_name: string | null }[]) ?? []);
      } else {
        setClassroomsForSchool([]);
        setEducatorsForSchool([]);
      }
      setMyNamedTargeting(((namedMineRes.data ?? []) as { template_id: string; student_id: string }[]) ?? []);

      const { data: subData, error: subErr } = await supabase
        .from("module_authorization_submissions")
        .select(
          "id, template_id, student_id, submitted_by, responses, signature_data, attachment_urls, created_at, student:students(full_name), submitter:submitted_by(full_name), template:template_id(title, module)",
        )
        .eq("school_id", schoolId)
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
  }, [schoolId, module, canManageTemplates, userId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const activeTemplates = useMemo(
    () => templates.filter((t) => t.is_active && parseFields(t.fields).length > 0),
    [templates],
  );

  const selectedTemplate = useMemo(
    () => activeTemplates.find((t) => t.id === fillTemplateId) ?? null,
    [activeTemplates, fillTemplateId],
  );

  const selectedFields = useMemo(
    () => parseFields(selectedTemplate?.fields ?? null),
    [selectedTemplate],
  );

  const openNewTemplate = () => {
    setEditingTpl(null);
    setTplTitle("");
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
        .select("student_id, assignee_profile_id")
        .eq("template_id", t.id);
      if (namedErr?.message?.includes("does not exist") || !namedRows?.length) {
        setTplNamedDrafts([{ rowKey: nanoid(), student_id: "", assignee_pick: "__" }]);
        return;
      }
      setTplNamedDrafts(
        namedRows.map((row: { student_id: string; assignee_profile_id: string }) => ({
          rowKey: nanoid(),
          student_id: row.student_id,
          assignee_pick: `direct:${row.assignee_profile_id}`,
        })),
      );
    })();
  };

  const addField = (type: AuthorizationFieldType) => {
    setTplFields((prev) => [
      ...prev,
      {
        id: nanoid(),
        type,
        label: FIELD_TYPE_META[type].label,
        required: false,
        options:
          type === "select" || type === "radio" || type === "checkbox_group" ? ["Opção A", "Opção B"] : undefined,
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
      toast.error("Indique o título.");
      return;
    }
    if (tplFields.length === 0) {
      toast.error("Adicione pelo menos um campo.");
      return;
    }
    if (tplRecipientMode === "classroom_homeroom_teachers" && tplClassroomIds.size === 0) {
      toast.error("Seleccione pelo menos uma turma.");
      return;
    }

    const namedPairs: Array<{ student_id: string; assignee_profile_id: string }> = [];
    if (tplRecipientMode === "named_student_assignee") {
      const educatorIds = new Set(educatorsForSchool.map((e) => e.id));
      if (educatorIds.size === 0) {
        toast.error("Não há educadores (perfil professor) registados nesta escola.");
        return;
      }
      const seenKeys = new Set<string>();
      for (const row of tplNamedDrafts) {
        if (!row.student_id) continue;
        const pid = assigneePickToProfileId(row.assignee_pick);
        if (!pid || !educatorIds.has(pid)) {
          toast.error("Em cada linha com aluno, escolha um educador válido (perfil professor).");
          return;
        }
        const k = `${row.student_id}:${pid}`;
        if (seenKeys.has(k)) continue;
        seenKeys.add(k);
        namedPairs.push({ student_id: row.student_id, assignee_profile_id: pid });
      }
      if (namedPairs.length === 0) {
        toast.error("Adicione pelo menos uma linha com aluno e educador (perfil professor) escolhido.");
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
        fields: tplFields as unknown as never,
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
          toast.success("Formulário actualizado.");
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
            if (nr.error) toast.warning(`Notificações: ${nr.error}`);
            else if (nr.sent > 0)
              toast.success(`${nr.sent} notificação(ões) enviadas (email e push segundo preferências dos educadores).`);
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
            fields: tplFields as unknown as never,
            is_active: true,
            created_by: userId ?? null,
            ...recipientPayload,
          } as never)
          .select("id")
          .single();

        if (error) toast.error(error.message);
        else if (!inserted?.id) toast.error("Não foi possível obter o id do formulário.");
        else {
          try {
            await persistNamedRecipients(
              inserted.id,
              tplRecipientMode === "named_student_assignee" ? namedPairs : [],
            );
          } catch {
            return;
          }
          toast.success("Formulário criado.");
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
            if (nr.error) toast.warning(`Notificações: ${nr.error}`);
            else if (nr.sent > 0)
              toast.success(`${nr.sent} notificação(ões) enviadas (email e push segundo preferências dos educadores).`);
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
      toast.success("Removido.");
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
      toast.success(activating ? "Formulário activado." : "Formulário desactivado.");
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
        if (nr.error) toast.warning(`Notificações: ${nr.error}`);
        else if (nr.sent > 0)
          toast.success(`${nr.sent} notificação(ões) enviadas (email e push segundo preferências dos educadores).`);
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
      toast.error("Escolha o formulário e o aluno.");
      return;
    }
    const errs: string[] = [];
    const mergedResponses: Record<string, unknown> = { ...fillValues };

    for (const f of selectedFields) {
      if (f.type === "signature") {
        const sig = fillSignatures[f.id];
        if (f.required && (!sig || !sig.trim())) errs.push(`${f.label} (assinatura)`);
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
      toast.error(`Preencha: ${errs.join(", ")}`);
      return;
    }

    const sigFields = selectedFields.filter((x) => x.type === "signature");
    let primarySignature: string | null = null;
    for (const f of sigFields) {
      const s = fillSignatures[f.id];
      if (s && !primarySignature) primarySignature = s;
    }

    const attachment_urls = selectedFields
      .filter((f) => f.type === "file")
      .map((f) => fillValues[f.id])
      .filter((v): v is { url: string; name?: string } =>
        !!(v && typeof v === "object" && "url" in v && typeof (v as { url: unknown }).url === "string"),
      )
      .map((v, i) => ({
        url: v.url,
        name: v.name ?? `anexo_${i + 1}`,
      }));

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
        toast.success("Autorização registada.");
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

  const renderFieldInput = (f: AuthorizationFieldDef) => {
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
              value={(fillValues[f.id] as string) ?? ""}
              onChange={(e) => setFillValues((prev) => ({ ...prev, [f.id]: e.target.value }))}
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
              value={(fillValues[f.id] as string) ?? ""}
              onChange={(e) => setFillValues((prev) => ({ ...prev, [f.id]: e.target.value }))}
              placeholder={f.helper ?? ""}
            />
          </div>
        );
      case "select":
        return (
          <div key={f.id} className="grid gap-2">
            {commonLabel}
            <Select
              value={(fillValues[f.id] as string) ?? ""}
              onValueChange={(v) => setFillValues((prev) => ({ ...prev, [f.id]: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Escolha…" />
              </SelectTrigger>
              <SelectContent>
                {(f.options ?? []).map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      case "radio":
        return (
          <div key={f.id} className="grid gap-2">
            {commonLabel}
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-3">
              {(f.options ?? []).map((opt) => (
                <label key={opt} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`radio-${f.id}`}
                    checked={fillValues[f.id] === opt}
                    onChange={() => setFillValues((prev) => ({ ...prev, [f.id]: opt }))}
                    className="h-4 w-4 accent-primary"
                  />
                  {opt}
                </label>
              ))}
            </div>
          </div>
        );
      case "checkbox":
        return (
          <div key={f.id} className="flex items-center gap-2">
            <Checkbox
              id={`chk-${f.id}`}
              checked={fillValues[f.id] === true}
              onCheckedChange={(c) => setFillValues((prev) => ({ ...prev, [f.id]: c === true }))}
            />
            <Label htmlFor={`chk-${f.id}`} className="text-sm font-medium cursor-pointer">
              {f.label}
              {f.required ? <span className="text-destructive"> *</span> : null}
            </Label>
          </div>
        );
      case "checkbox_group":
        return (
          <div key={f.id} className="grid gap-2">
            {commonLabel}
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-3">
              {(f.options ?? []).map((opt) => {
                const set = new Set((fillValues[f.id] as string[] | undefined) ?? []);
                const on = set.has(opt);
                return (
                  <label key={opt} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={on}
                      onCheckedChange={(c) => {
                        const next = new Set(set);
                        if (c === true) next.add(opt);
                        else next.delete(opt);
                        setFillValues((prev) => ({ ...prev, [f.id]: [...next] }));
                      }}
                    />
                    {opt}
                  </label>
                );
              })}
            </div>
          </div>
        );
      case "signature":
        return (
          <div key={f.id} className="grid gap-2">
            {commonLabel}
            <SignatureCanvas
              disabled={submitting}
              existingDataUrl={fillSignatures[f.id] ?? null}
              onClear={() =>
                setFillSignatures((prev) => {
                  const next = { ...prev };
                  delete next[f.id];
                  return next;
                })
              }
              onSave={(dataUrl) => setFillSignatures((prev) => ({ ...prev, [f.id]: dataUrl }))}
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
              currentUrl={(fillValues[f.id] as { url?: string })?.url}
              currentFileName={(fillValues[f.id] as { name?: string })?.name}
              onUpload={(url, fileName) => setFillValues((prev) => ({ ...prev, [f.id]: { url, name: fileName } }))}
              onClear={() =>
                setFillValues((prev) => {
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

  if (!schoolId) return <p className="text-sm text-muted-foreground">A carregar escola…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-card/60 p-4 shadow-soft">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <FileSignature className="h-5 w-5 text-primary" />
            Autorizações ({MODULE_LABEL[module]})
          </h2>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            A escola configura formulários e define o envio apenas a educadores: por turmas seleccionadas (directores e
            professorado no horário dessas turmas) ou um educador concreto por aluno. As submissões ficam registadas aqui dentro
            de {MODULE_LABEL[module]}.
          </p>
        </div>
        {canManageTemplates ? (
          <Button type="button" size="sm" className="gap-2" onClick={openNewTemplate}>
            <Plus className="h-4 w-4" /> Novo formulário
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
                <h3 className="text-sm font-semibold text-foreground">Formulários da escola</h3>
                <span className="text-xs text-muted-foreground gap-1 inline-flex items-center">
                  <ClipboardList className="h-3.5 w-3.5" /> Activo/inactivo
                </span>
              </div>
              <ScrollArea className="max-h-56">
                <ul className="divide-y divide-border">
                  {templates.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                      <Badge variant={t.is_active ? "default" : "secondary"}>{t.is_active ? "Activo" : "Inactivo"}</Badge>
                      <span className="flex-1 font-medium">{t.title}</span>
                      <span className="text-muted-foreground">{parseFields(t.fields).length} campo(s)</span>
                      <Badge variant="outline" className="border-dashed text-[10px] font-normal sm:text-xs">{templateRecipientSummary(t)}</Badge>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title={t.is_active ? "Desactivar formulário" : "Activar formulário"}
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
                <Send className="h-4 w-4" /> Preencher
              </TabsTrigger>
              <TabsTrigger value="historico" className="gap-2">
                <User className="h-4 w-4" /> Histórico recente
              </TabsTrigger>
            </TabsList>

            <TabsContent value="preencher" className="mt-4 space-y-4">
              {activeTemplates.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                  {canManageTemplates
                    ? "Ainda não há formulários activos. Crie o primeiro formulário com campos à medida da escola."
                    : "A escola ainda não configurou formulários para este separador."}
                </p>
              ) : (
                <Card className="border-border bg-card p-5 shadow-card">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Formulário</Label>
                      <Select value={fillTemplateId} onValueChange={setFillTemplateId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Escolher…" />
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
                      <Label>Aluno</Label>
                      <Select value={fillStudentId} onValueChange={setFillStudentId} disabled={filteredStudentsForFill.length === 0}>
                        <SelectTrigger>
                          <SelectValue placeholder={filteredStudentsForFill.length === 0 ? "Sem alunos disponíveis" : "Escolher aluno"} />
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
                    {selectedFields.map((f) => renderFieldInput(f))}
                  </div>
                  <div className="mt-6 flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => resetFillForm()} disabled={submitting}>
                      Limpar
                    </Button>
                    <Button
                      type="button"
                      className="gap-2 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/90"
                      onClick={() => void validateAndSubmit()}
                      disabled={submitting || !fillTemplateId || !fillStudentId}
                    >
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Submeter autorização
                    </Button>
                  </div>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="historico" className="mt-4">
              {submissions.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sem submissões ainda dentro do seu acesso.</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-border shadow-card">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3">Data</th>
                        <th className="px-4 py-3">Formulário</th>
                        <th className="px-4 py-3">Aluno</th>
                        {canManageTemplates ? <th className="px-4 py-3">Por</th> : null}
                        <th className="px-4 py-3 text-right">—</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissions.slice(0, 80).map((s) => (
                        <tr key={s.id} className="border-t border-border bg-card hover:bg-muted/20">
                          <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                            {new Date(s.created_at).toLocaleString("pt-PT")}
                          </td>
                          <td className="px-4 py-2 font-medium">{s.template?.title ?? "—"}</td>
                          <td className="px-4 py-2">{s.student?.full_name ?? "—"}</td>
                          {canManageTemplates ? <td className="px-4 py-2">{s.submitter?.full_name ?? "—"}</td> : null}
                          <td className="px-4 py-2 text-right">
                            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setViewSub(s)}>
                              Ver respostas
                            </Button>
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
            <DialogTitle>{editingTpl ? "Editar formulário" : "Novo formulário"}</DialogTitle>
            <DialogDescription>
              Defina o título, o envio aos educadores e os campos. Para dropdown, rádio e várias caixas use uma linha por
              opção.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>Título</Label>
              <Input value={tplTitle} onChange={(e) => setTplTitle(e.target.value)} placeholder="Ex.: Autorização de transporte escolar" />
            </div>
            <div className="grid gap-2">
              <Label>Descrição (opcional)</Label>
              <Textarea rows={3} value={tplDesc} onChange={(e) => setTplDesc(e.target.value)} placeholder="Instruções breves…" />
            </div>

            {canManageTemplates ? (
              <div className="grid gap-2 rounded-xl border border-border bg-muted/20 p-3">
                <Label className="text-sm font-semibold">Envio aos educadores</Label>
                <p className="text-[11px] text-muted-foreground">
                  O formulário notifica apenas educadores (perfil professor). Pode enviar por turmas (directores de turma +
                  professores com aulas nessas turmas no horário) ou definir linha a linha o educador responsável por cada aluno.
                </p>
                <div className="flex flex-col gap-2">
                  {(Object.keys(RECIPIENT_MODE_META) as TemplateRecipientMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTplRecipientMode(m)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-left transition-[var(--transition-smooth)]",
                        tplRecipientMode === m ? "border-primary bg-primary/10 shadow-sm" : "border-border hover:bg-muted/50",
                      )}
                    >
                      <span className="text-sm font-medium">{RECIPIENT_MODE_META[m].title}</span>
                      <span className="mt-1 block text-xs leading-snug text-muted-foreground">{RECIPIENT_MODE_META[m].hint}</span>
                    </button>
                  ))}
                </div>

                {tplRecipientMode === "classroom_homeroom_teachers" ? (
                  <div className="mt-1 max-h-44 space-y-2 overflow-y-auto rounded-lg border border-border bg-background/80 p-2">
                    {classroomsForSchool.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sem turmas registadas nesta escola.</p>
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
                        <Plus className="h-3 w-3" /> Destinatário
                      </Button>
                    </div>
                    {tplNamedDrafts.map((row) => {
                      const educatorOpts = educatorsForSchool.map((p) => ({
                        value: `direct:${p.id}`,
                        label: (p.full_name ?? "").trim() || "Sem nome",
                      }));
                      const selectValue =
                        row.assignee_pick.startsWith("direct:") && educatorOpts.some((o) => o.value === row.assignee_pick)
                          ? row.assignee_pick
                          : "__";
                      return (
                        <Card key={row.rowKey} className="border-border bg-card p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
                            <Badge variant="secondary" className="text-[10px]">
                              Destinatário nominal
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
                                Remover linha
                              </Button>
                            ) : null}
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="grid gap-2">
                              <Label className="text-xs">Aluno</Label>
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
                                  <SelectValue placeholder="Escolher aluno" />
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
                              <Label className="text-xs">Educador (notificado)</Label>
                              <Select
                                value={selectValue}
                                onValueChange={(v) =>
                                  setTplNamedDrafts((prev) =>
                                    prev.map((x) => (x.rowKey === row.rowKey ? { ...x, assignee_pick: v } : x)),
                                  )
                                }
                                disabled={!row.student_id || educatorOpts.length === 0}
                              >
                                <SelectTrigger>
                                  <SelectValue
                                    placeholder={
                                      !row.student_id
                                        ? "Escolha o aluno primeiro"
                                        : educatorOpts.length === 0
                                          ? "Sem educadores registados nesta escola"
                                          : "Escolher educador"
                                    }
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__">—</SelectItem>
                                  {educatorOpts.map((o) => (
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
              {(Object.keys(FIELD_TYPE_META) as AuthorizationFieldType[]).map((ft) => (
                <Button key={ft} type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={() => addField(ft)}>
                  + {FIELD_TYPE_META[ft].label}
                </Button>
              ))}
            </div>

            <div className="space-y-3 pt-2">
              {tplFields.map((f) => (
                <Card key={f.id} className="space-y-3 border-border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline">{FIELD_TYPE_META[f.type]?.label ?? f.type}</Badge>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-destructive" onClick={() => removeField(f.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs">Etiqueta do campo</Label>
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
                      Obrigatório
                    </Label>
                  </div>
                  {(f.type === "select" || f.type === "radio" || f.type === "checkbox_group") && (
                    <div className="grid gap-2">
                      <Label className="text-xs">Opções (uma por linha)</Label>
                      <Textarea
                        rows={3}
                        value={(f.options ?? []).join("\n")}
                        onChange={(e) =>
                          setTplFields((prev) =>
                            prev.map((x) => (x.id === f.id ? { ...x, options: stringifyOptions(e.target.value) } : x)),
                          )
                        }
                      />
                    </div>
                  )}
                  <div className="grid gap-2">
                    <Label className="text-xs">Texto de ajuda (opcional)</Label>
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
                    Subir
                  </Button>
                </Card>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTplDialog(false)}>
              Cancelar
            </Button>
            <Button type="button" className="gap-2 bg-pastel-blue text-pastel-blue-foreground" onClick={() => void saveTemplate()} disabled={tplSaving}>
              {tplSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTplId} onOpenChange={(o) => !o && setDeleteTplId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover formulário?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive" onClick={() => void confirmDeleteTemplate()}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!viewSub} onOpenChange={(o) => !o && setViewSub(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Submissão</DialogTitle>
            <DialogDescription>
              {viewSub?.template?.title} · {viewSub?.student?.full_name ?? ""}
              {viewSub ? ` · ${new Date(viewSub.created_at).toLocaleString("pt-PT")}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {viewSub &&
              (() => {
                const defs = parseFields(templates.find((x) => x.id === viewSub.template_id)?.fields ?? []);
                const resp = (viewSub.responses ?? {}) as Record<string, unknown>;
                const sawSignatureInResponses = defs.some(
                  (f) => f.type === "signature" && typeof resp[f.id] === "string",
                );
                const els = defs.map((f) => (
                  <div key={f.id} className="rounded-xl border border-border bg-muted/20 p-3">
                    <p className="text-xs font-semibold text-muted-foreground">{f.label}</p>
                    <div className="mt-1 break-words">
                      {f.type === "signature" && typeof resp[f.id] === "string" ? (
                        <img src={resp[f.id] as string} alt="Assinatura" className="max-h-24 rounded border bg-white p-1" />
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
                          {(resp[f.id] as { name?: string }).name ?? "Ver ficheiro"}
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
                      <p className="text-xs font-semibold text-muted-foreground">Assinatura (registo)</p>
                      <img src={viewSub.signature_data} alt="Assinatura" className="mt-2 max-h-28 rounded bg-white p-1" />
                    </div>
                  ) : null;
                return (
                  <>
                    {els}
                    {legacySig}
                    {Array.isArray(viewSub.attachment_urls) && viewSub.attachment_urls.length > 0 ? (
                      <div className="rounded-xl border border-border p-3 text-xs">
                        <p className="font-semibold text-muted-foreground">Anexos</p>
                        <ul className="mt-2 list-disc pl-5">
                          {viewSub.attachment_urls.map((a, i) => (
                            <li key={`${a.url}-${i}`}>
                              {a.url ? (
                                <a href={a.url} target="_blank" rel="noreferrer" className="text-primary underline">
                                  {a.name ?? "ficheiro"}
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
