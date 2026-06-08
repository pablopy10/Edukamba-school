import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sortByName } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle } from "lucide-react";
import { useAcademicYear } from "@/context/AcademicYearContext";

export type AssessmentRecord = {
  id?: string;
  title: string;
  type: string;
  classroom_id: string | null;
  subject_id: string | null;
  teacher_id: string | null;
  date: string;
  start_time: string;
  end_time: string;
  room: string | null;
  weight: number;
  description: string | null;
  term_id: string | null;
};

type Option = { id: string; name: string };
type TeacherOption = { id: string; name: string; subject_id?: string | null };

const TYPE_VALUES = ["teste", "exame", "trabalho", "oral", "continua"] as const;

const trimTime = (t: string) => (t ? t.slice(0, 5) : "");

type ConflictCode = "classroom" | "room";

type Conflict = { id: string; title: string; codes: ConflictCode[] };

type Term = { id: string; term_number: number; name: string; start_date: string; end_date: string };
type Holiday = { id: string; name: string; start_date: string; end_date: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string | null;
  classrooms: Option[];
  subjects: Option[];
  teachers: TeacherOption[];
  initial?: Partial<AssessmentRecord> | null;
  onSaved: () => void;
  /** When set, locks the teacher field to this profile id (used for TEACHER role). */
  lockTeacherId?: string | null;
  /** When set, locks the subject field to this subject id (used for TEACHER role). */
  lockSubjectId?: string | null;
};

const empty: AssessmentRecord = {
  title: "",
  type: "teste",
  classroom_id: null,
  subject_id: null,
  teacher_id: null,
  date: new Date().toISOString().slice(0, 10),
  start_time: "08:00",
  end_time: "09:30",
  room: "",
  weight: 0,
  description: "",
  term_id: null,
};

export const AssessmentFormDialog = ({
  open,
  onOpenChange,
  schoolId,
  classrooms,
  subjects,
  teachers,
  initial,
  onSaved,
  lockTeacherId,
  lockSubjectId,
}: Props) => {
  const { t } = useTranslation("pages", { keyPrefix: "avaliacoes.form" });
  const { t: tp } = useTranslation("pages", { keyPrefix: "avaliacoes" });
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AssessmentRecord>(empty);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [termManuallyOverridden, setTermManuallyOverridden] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConflicts([]);
    setTermManuallyOverridden(!!initial?.term_id);
    setForm({
      ...empty,
      ...initial,
      title: initial?.title ?? "",
      type: initial?.type ?? "teste",
      classroom_id: initial?.classroom_id ?? null,
      subject_id: lockSubjectId ?? initial?.subject_id ?? null,
      teacher_id: lockTeacherId ?? initial?.teacher_id ?? null,
      date: initial?.date ?? new Date().toISOString().slice(0, 10),
      start_time: trimTime(initial?.start_time ?? "08:00"),
      end_time: trimTime(initial?.end_time ?? "09:30"),
      room: initial?.room ?? "",
      weight: Number(initial?.weight ?? 0),
      description: initial?.description ?? "",
      term_id: initial?.term_id ?? null,
    });
  }, [open, initial, lockTeacherId, lockSubjectId]);

  // Load terms for the school
  const { selectedYearId } = useAcademicYear();
  useEffect(() => {
    if (!open || !schoolId) return;
    (async () => {
      let q = supabase
        .from("academic_terms")
        .select("id, term_number, name, start_date, end_date")
        .eq("school_id", schoolId)
        .order("term_number");
      if (selectedYearId) q = q.eq("academic_year_id", selectedYearId);
      const { data } = await q;
      setTerms((data ?? []) as Term[]);
      let hq = supabase
        .from("school_holidays")
        .select("id, name, start_date, end_date")
        .eq("school_id", schoolId);
      if (selectedYearId) hq = hq.eq("academic_year_id", selectedYearId);
      const { data: hData } = await hq;
      setHolidays((hData ?? []) as Holiday[]);
    })();
  }, [open, schoolId, selectedYearId]);

  const holidayMatch = holidays.find((h) => form.date >= h.start_date && form.date <= h.end_date);

  // Auto-derive term from date unless user manually overrode it
  useEffect(() => {
    if (!form.date || terms.length === 0 || termManuallyOverridden) return;
    const matched = terms.find((term) => form.date >= term.start_date && form.date <= term.end_date);
    setForm((f) => ({ ...f, term_id: matched?.id ?? null }));
  }, [form.date, terms, termManuallyOverridden]);

  const update = <K extends keyof AssessmentRecord>(key: K, value: AssessmentRecord[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Teacher selected → auto-fill subject (if teacher has one assigned)
  const handleTeacherChange = (teacherId: string) => {
    const teacher = teachers.find((t) => t.id === teacherId);
    setForm((f) => ({
      ...f,
      teacher_id: teacherId,
      subject_id: teacher?.subject_id ? teacher.subject_id : f.subject_id,
    }));
  };

  // Subject selected → filter teachers to those who teach it; auto-select if only one
  const handleSubjectChange = (subjectId: string) => {
    const matchingTeachers = teachers.filter((t) => t.subject_id === subjectId);
    setForm((f) => {
      const currentTeacherStillValid = matchingTeachers.some((t) => t.id === f.teacher_id);
      return {
        ...f,
        subject_id: subjectId,
        teacher_id: currentTeacherStillValid
          ? f.teacher_id
          : matchingTeachers.length === 1
            ? matchingTeachers[0].id
            : null,
      };
    });
  };

  // Always show all options — filtering is not applied, only auto-fill and mismatch warning
  const filteredSubjects = subjects;
  const filteredTeachers = teachers;

  // Detect teacher–subject mismatch (teacher has a subject set but it differs from selected)
  const teacherSubjectMismatch = useMemo(() => {
    if (!form.teacher_id || !form.subject_id || lockTeacherId || lockSubjectId) return false;
    const teacher = teachers.find((t) => t.id === form.teacher_id);
    return !!teacher?.subject_id && teacher.subject_id !== form.subject_id;
  }, [form.teacher_id, form.subject_id, teachers, lockTeacherId, lockSubjectId]);

  // Check for conflicts (does NOT block save)
  useEffect(() => {
    if (!open || !schoolId || !form.date || !form.start_time || !form.end_time) {
      setConflicts([]);
      return;
    }
    if (form.start_time >= form.end_time) {
      setConflicts([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("assessments")
        .select("id, title, classroom_id, room, start_time, end_time")
        .eq("school_id", schoolId)
        .eq("date", form.date);

      if (ctrl.signal.aborted || !data) return;

      const found: Conflict[] = [];
      for (const a of data) {
        if (form.id && a.id === form.id) continue;
        const aStart = trimTime((a.start_time as any) ?? "");
        const aEnd = trimTime((a.end_time as any) ?? "");
        if (!aStart || !aEnd) continue;
        const overlaps = aStart < form.end_time && aEnd > form.start_time;
        if (!overlaps) continue;

        const codes: ConflictCode[] = [];
        if (form.classroom_id && a.classroom_id === form.classroom_id) codes.push("classroom");
        const formRoom = (form.room ?? "").trim().toLowerCase();
        const aRoom = ((a.room as any) ?? "").trim().toLowerCase();
        if (formRoom && aRoom && formRoom === aRoom) codes.push("room");
        if (codes.length > 0) {
          found.push({ id: a.id, title: a.title, codes });
        }
      }
      setConflicts(found);
    }, 350);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [
    open,
    schoolId,
    form.id,
    form.date,
    form.start_time,
    form.end_time,
    form.classroom_id,
    form.room,
  ]);

  const handleSave = async () => {
    if (!schoolId) {
      toast({ title: t("toast_error"), description: t("toast_school_missing"), variant: "destructive" });
      return;
    }
    if (!form.title.trim()) {
      toast({ title: t("toast_title_required"), description: t("toast_title_ph"), variant: "destructive" });
      return;
    }
    if (!form.classroom_id || !form.subject_id || !form.teacher_id) {
      toast({ title: t("toast_title_required"), description: t("toast_select_required_desc"), variant: "destructive" });
      return;
    }
    if (form.start_time >= form.end_time) {
      toast({ title: t("toast_bad_time"), description: t("toast_bad_time_desc"), variant: "destructive" });
      return;
    }
    if (teacherSubjectMismatch) {
      toast({ title: t("toast_subject_mismatch"), description: t("toast_subject_mismatch_desc"), variant: "destructive" });
      return;
    }

    setSaving(true);
    const payload = {
      school_id: schoolId,
      title: form.title.trim(),
      type: form.type,
      classroom_id: form.classroom_id,
      subject_id: form.subject_id,
      teacher_id: form.teacher_id,
      date: form.date,
      start_time: form.start_time,
      end_time: form.end_time,
      room: form.room?.trim() || null,
      weight: Number(form.weight) || 0,
      description: form.description?.trim() || null,
      term_id: form.term_id,
    };

    const { error } = form.id
      ? await supabase.from("assessments").update(payload).eq("id", form.id)
      : await supabase.from("assessments").insert(payload);

    setSaving(false);

    if (error) {
      toast({ title: t("toast_save_error"), description: error.message, variant: "destructive" });
      return;
    }

    toast({
      title: form.id ? t("toast_updated") : t("toast_created"),
      description: conflicts.length > 0 ? t("toast_saved_with_conflicts") : t("toast_saved_ok"),
    });
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>{form.id ? t("title_edit") : t("title_create")}</DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("title_label")}</Label>
            <Input value={form.title} onChange={(e) => update("title", e.target.value)} placeholder={t("title_placeholder")} />
          </div>

          <div className="space-y-2">
            <Label>{t("type_label")}</Label>
            <Select value={form.type} onValueChange={(v) => update("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_VALUES.map((v) => (
                  <SelectItem key={v} value={v}>
                    {tp(`types.${v}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("class_label")}</Label>
            <Select value={form.classroom_id ?? ""} onValueChange={(v) => update("classroom_id", v)}>
              <SelectTrigger><SelectValue placeholder={t("class_ph")} /></SelectTrigger>
              <SelectContent>
                {sortByName(classrooms).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("subject_label")}</Label>
            <Select
              value={form.subject_id ?? ""}
              onValueChange={handleSubjectChange}
              disabled={!!lockSubjectId}
            >
              <SelectTrigger className={teacherSubjectMismatch ? "border-destructive" : ""}>
                <SelectValue placeholder={t("subject_ph")} />
              </SelectTrigger>
              <SelectContent>
                {filteredSubjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("teacher_label")}</Label>
            <Select
              value={form.teacher_id ?? ""}
              onValueChange={handleTeacherChange}
              disabled={!!lockTeacherId}
            >
              <SelectTrigger className={teacherSubjectMismatch ? "border-destructive" : ""}>
                <SelectValue placeholder={t("teacher_ph")} />
              </SelectTrigger>
              <SelectContent>
                {filteredTeachers.length > 0 ? (
                  filteredTeachers.map((tch) => (
                    <SelectItem key={tch.id} value={tch.id}>
                      {tch.name}
                    </SelectItem>
                  ))
                ) : (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    {t("teacher_empty_for_subject")}
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("date_label")}</Label>
            <Input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>{t("start_label")}</Label>
            <Input type="time" value={form.start_time} onChange={(e) => update("start_time", e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>{t("end_label")}</Label>
            <Input type="time" value={form.end_time} onChange={(e) => update("end_time", e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>{t("room_label")}</Label>
            <Input value={form.room ?? ""} onChange={(e) => update("room", e.target.value)} placeholder={t("room_placeholder")} />
          </div>

          <div className="space-y-2">
            <Label>{t("weight_label")}</Label>
            <Input type="number" min={0} max={100} value={form.weight} onChange={(e) => update("weight", Number(e.target.value))} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>
              {t("term_label")}{" "}
              {!termManuallyOverridden && (
                <span className="text-xs font-normal text-muted-foreground">{t("term_auto_suffix")}</span>
              )}
            </Label>
            {terms.length === 0 ? (
              <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">{t("term_hint_settings")}</p>
            ) : (
              <div className="flex items-center gap-2">
                <Select
                  value={form.term_id ?? "auto"}
                  onValueChange={(v) => {
                    if (v === "auto") {
                      setTermManuallyOverridden(false);
                      const matched = terms.find((term) => form.date >= term.start_date && form.date <= term.end_date);
                      update("term_id", matched?.id ?? null);
                    } else {
                      setTermManuallyOverridden(true);
                      update("term_id", v);
                    }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder={t("term_none_ph")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t("term_auto_opt")}</SelectItem>
                    {terms.map((tr) => (
                      <SelectItem key={tr.id} value={tr.id}>{tr.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {termManuallyOverridden && (
                  <span className="rounded-full bg-pastel-yellow/40 px-2 py-1 text-[10px] font-semibold text-pastel-yellow-foreground">
                    {t("manual_badge")}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>{t("description_label")}</Label>
            <Textarea value={form.description ?? ""} onChange={(e) => update("description", e.target.value)} rows={2} />
          </div>

          {teacherSubjectMismatch && (
            <div className="sm:col-span-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs">
              <div className="flex items-center gap-2 font-semibold text-destructive">
                <AlertTriangle className="h-4 w-4" />
                {t("mismatch_banner")}
              </div>
            </div>
          )}

          {conflicts.length > 0 && (
            <div className="sm:col-span-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs">
              <div className="mb-2 flex items-center gap-2 font-semibold text-destructive">
                <AlertTriangle className="h-4 w-4" />
                {t("conflicts_title", { count: conflicts.length })}
              </div>
              <ul className="space-y-1 text-foreground">
                {conflicts.map((c) => {
                  const pieces = c.codes
                    .map((code) =>
                      code === "classroom" ? t("conflict_piece_classroom") : t("conflict_piece_room"),
                    )
                    .join(t("conflict_list_join"));
                  return (
                    <li key={c.id}>{t("conflict_li", { title: c.title, pieces })}</li>
                  );
                })}
              </ul>
              <p className="mt-2 text-muted-foreground">{t("can_save_anyway")}</p>
            </div>
          )}

          {holidayMatch && (
            <div className="sm:col-span-2 rounded-lg border border-pastel-yellow-foreground/30 bg-pastel-yellow/30 p-3 text-xs">
              <div className="mb-1 flex items-center gap-2 font-semibold text-pastel-yellow-foreground">
                <AlertTriangle className="h-4 w-4" />
                {t("holiday_warn_title", { name: holidayMatch.name })}
              </div>
              <p className="text-muted-foreground">{t("holiday_warn_hint")}</p>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("btn_cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {form.id ? t("submit_edit") : t("submit_create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};