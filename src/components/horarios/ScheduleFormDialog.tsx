import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle } from "lucide-react";
import { sortByName } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export type ScheduleRecord = {
  id?: string;
  classroom_id: string | null;
  subject_id: string | null;
  teacher_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  shift: "MORNING" | "AFTERNOON" | "EVENING" | null;
  notes: string | null;
};

type Option = { id: string; name: string; subjectId?: string | null };
type TimeSlotOption = { start_time: string; end_time: string; label: string | null; is_break: boolean; shift: string };

const FORM_DOW_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

const trimTime = (t: string) => t?.slice(0, 5) ?? "";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string | null;
  academicYearId?: string | null;
  classrooms: Option[];
  subjects: Option[];
  teachers: Option[];
  timeSlots: TimeSlotOption[];
  initial?: Partial<ScheduleRecord> | null;
  onSaved: () => void;
};

export const ScheduleFormDialog = ({
  open,
  onOpenChange,
  schoolId,
  academicYearId,
  classrooms,
  subjects,
  teachers,
  timeSlots,
  initial,
  onSaved,
}: Props) => {
  const { t } = useTranslation("pages", { keyPrefix: "horarios.schedule_form" });
  const { t: th } = useTranslation("pages", { keyPrefix: "horarios" });

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ScheduleRecord>({
    classroom_id: null,
    subject_id: null,
    teacher_id: null,
    day_of_week: 1,
    start_time: "08:00",
    end_time: "09:00",
    room: "",
    shift: "MORNING",
    notes: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      id: initial?.id,
      classroom_id: initial?.classroom_id ?? null,
      subject_id: initial?.subject_id ?? null,
      teacher_id: initial?.teacher_id ?? null,
      day_of_week: initial?.day_of_week ?? 1,
      start_time: trimTime(initial?.start_time ?? "08:00"),
      end_time: trimTime(initial?.end_time ?? "09:00"),
      room: initial?.room ?? "",
      shift: (initial?.shift as ScheduleRecord["shift"]) ?? "MORNING",
      notes: initial?.notes ?? "",
    });
  }, [open, initial]);

  const slotsForShift = useMemo(
    () => timeSlots.filter((s) => s.shift === form.shift && !s.is_break),
    [timeSlots, form.shift],
  );

  const filteredTeachers = useMemo(() => {
    if (!form.subject_id) return [] as Option[];
    return teachers.filter((t) => t.subjectId === form.subject_id);
  }, [teachers, form.subject_id]);

  const update = <K extends keyof ScheduleRecord>(key: K, value: ScheduleRecord[K]) =>
    setForm((f) => {
      const next = { ...f, [key]: value } as ScheduleRecord;
      // Reset teacher if subject changes and current teacher doesn't teach the new subject
      if (key === "subject_id") {
        const stillValid = teachers.some(
          (t) => t.id === f.teacher_id && t.subjectId === value,
        );
        if (!stillValid) next.teacher_id = null;
      }
      return next;
    });

  const applySlot = (start: string, end: string) => {
    setForm((f) => ({ ...f, start_time: trimTime(start), end_time: trimTime(end) }));
  };

  const handleSave = async () => {
    if (!schoolId) {
      toast({ title: th("toast_error"), description: t("toast_school_missing"), variant: "destructive" });
      return;
    }
    if (!form.classroom_id || !form.subject_id || !form.teacher_id) {
      toast({ title: t("toast_required"), description: t("toast_required_desc"), variant: "destructive" });
      return;
    }
    if (form.start_time >= form.end_time) {
      toast({ title: t("toast_bad_time"), description: t("toast_bad_time_desc"), variant: "destructive" });
      return;
    }

    setSaving(true);
    const payload = {
      school_id: schoolId,
      academic_year_id: academicYearId ?? null,
      classroom_id: form.classroom_id,
      subject_id: form.subject_id,
      teacher_id: form.teacher_id,
      day_of_week: form.day_of_week,
      start_time: form.start_time,
      end_time: form.end_time,
      room: form.room?.trim() || null,
      shift: form.shift,
      notes: form.notes?.trim() || null,
    };

    const { error } = form.id
      ? await supabase.from("schedules").update(payload).eq("id", form.id)
      : await supabase.from("schedules").insert(payload);

    setSaving(false);

    if (error) {
      const raw = error.message ?? "";
      const looksConflict = /\b(conflito|conflict)\b/i.test(raw);
      toast({
        title: looksConflict ? t("toast_conflict_title") : t("toast_saved_error"),
        description: looksConflict ? raw : t("error_save_prefix", { message: raw }),
        variant: "destructive",
      });
      return;
    }

    toast({
      title: form.id ? t("toast_updated") : t("toast_created"),
      description: t("toast_saved_hint"),
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
            <Select value={form.subject_id ?? ""} onValueChange={(v) => update("subject_id", v)}>
              <SelectTrigger><SelectValue placeholder={t("subject_ph")} /></SelectTrigger>
              <SelectContent>
                {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("teacher_label")}</Label>
            <Select
              value={form.teacher_id ?? ""}
              onValueChange={(v) => update("teacher_id", v)}
              disabled={!form.subject_id || filteredTeachers.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !form.subject_id
                      ? t("teacher_ph_select_subject")
                      : filteredTeachers.length === 0
                        ? t("teacher_ph_none")
                        : t("teacher_ph")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {filteredTeachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("dow_label")}</Label>
            <Select value={String(form.day_of_week)} onValueChange={(v) => update("day_of_week", Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FORM_DOW_ORDER.map((dow) => (
                  <SelectItem key={dow} value={String(dow)}>{th(`dow.${dow}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("shift_label")}</Label>
            <Select value={form.shift ?? "MORNING"} onValueChange={(v) => update("shift", v as ScheduleRecord["shift"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["MORNING", "AFTERNOON", "EVENING"] as const).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "MORNING" ? th("shift_morning") : s === "AFTERNOON" ? th("shift_afternoon") : th("shift_evening")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("room_label")}</Label>
            <Input value={form.room ?? ""} onChange={(e) => update("room", e.target.value)} placeholder={t("room_placeholder")} />
          </div>

          {slotsForShift.length > 0 && (
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("slots_quick_label")}</Label>
              <div className="flex flex-wrap gap-2">
                {slotsForShift.map((s, i) => {
                  const start = trimTime(s.start_time);
                  const end = trimTime(s.end_time);
                  const active = form.start_time === start && form.end_time === end;
                  return (
                    <button
                      type="button"
                      key={`${s.start_time}-${i}`}
                      onClick={() => applySlot(s.start_time, s.end_time)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-foreground hover:bg-accent"
                      }`}
                    >
                      {s.label ? `${s.label} · ` : ""}{start}–{end}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>{t("start_label")}</Label>
            <Input type="time" value={form.start_time} onChange={(e) => update("start_time", e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>{t("end_label")}</Label>
            <Input type="time" value={form.end_time} onChange={(e) => update("end_time", e.target.value)} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>{t("notes_label")}</Label>
            <Textarea value={form.notes ?? ""} onChange={(e) => update("notes", e.target.value)} rows={2} />
          </div>
        </div>

        <div className="flex shrink-0 items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t("hint_conflicts")}</span>
        </div>

        <DialogFooter className="shrink-0 gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>{th("btn_cancel")}</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {form.id ? t("submit_edit") : t("submit_create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};