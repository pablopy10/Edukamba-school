import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type LessonLogRow = {
  id: string;
  subject_id: string;
  classroom_id: string;
  lesson_date: string;
  summary: string;
  homework: string | null;
  teacher_id: string;
  academic_year_id: string | null;
  subject_lesson_materials?: Array<{
    id: string;
    title: string;
    link_url: string | null;
    content_text: string | null;
    sort_order: number;
  }>;
};

type ClassroomOption = { id: string; name: string };

type MaterialDraft = { title: string; link_url: string; content_text: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  schoolId: string;
  academicYearId: string | null;
  classrooms: ClassroomOption[];
  editing: LessonLogRow | null;
  defaultClassroomId?: string;
  onSaved: () => void;
};

const emptyMaterial = (): MaterialDraft => ({ title: "", link_url: "", content_text: "" });

export function LessonLogFormDialog({
  open,
  onOpenChange,
  subjectId,
  schoolId,
  academicYearId,
  classrooms,
  editing,
  defaultClassroomId,
  onSaved,
}: Props) {
  const { t } = useTranslation("pages", { keyPrefix: "disciplina_detalhe" });
  const [classroomId, setClassroomId] = useState("");
  const [lessonDate, setLessonDate] = useState(new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState("");
  const [homework, setHomework] = useState("");
  const [materials, setMaterials] = useState<MaterialDraft[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setClassroomId(editing.classroom_id);
      setLessonDate(editing.lesson_date.slice(0, 10));
      setSummary(editing.summary);
      setHomework(editing.homework ?? "");
      setMaterials(
        (editing.subject_lesson_materials ?? []).length > 0
          ? (editing.subject_lesson_materials ?? []).map((m) => ({
              title: m.title,
              link_url: m.link_url ?? "",
              content_text: m.content_text ?? "",
            }))
          : [emptyMaterial()],
      );
    } else {
      setClassroomId(defaultClassroomId ?? classrooms[0]?.id ?? "");
      setLessonDate(new Date().toISOString().slice(0, 10));
      setSummary("");
      setHomework("");
      setMaterials([emptyMaterial()]);
    }
  }, [open, editing, classrooms, defaultClassroomId]);

  const updateMaterial = (idx: number, patch: Partial<MaterialDraft>) => {
    setMaterials((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  };

  const save = async () => {
    if (!classroomId || !summary.trim()) {
      toast({ title: t("toast_required"), variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const teacherId = userData.user?.id;
    if (!teacherId) {
      toast({ title: t("toast_session"), variant: "destructive" });
      setSaving(false);
      return;
    }

    const payload = {
      school_id: schoolId,
      subject_id: subjectId,
      classroom_id: classroomId,
      academic_year_id: academicYearId,
      lesson_date: lessonDate,
      summary: summary.trim(),
      homework: homework.trim() || null,
      teacher_id: teacherId,
    };

    let logId = editing?.id ?? "";

    if (editing) {
      const { error } = await supabase.from("subject_lesson_logs").update(payload).eq("id", editing.id);
      if (error) {
        toast({ title: t("toast_save_error"), description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      logId = editing.id;
      await supabase.from("subject_lesson_materials").delete().eq("lesson_log_id", logId);
    } else {
      const { data: ins, error } = await supabase
        .from("subject_lesson_logs")
        .insert(payload)
        .select("id")
        .single();
      if (error) {
        toast({ title: t("toast_save_error"), description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      logId = ins?.id ?? "";
    }

    const matRows = materials
      .filter((m) => m.title.trim())
      .map((m, i) => ({
        lesson_log_id: logId,
        title: m.title.trim(),
        link_url: m.link_url.trim() || null,
        content_text: m.content_text.trim() || null,
        sort_order: i,
      }));

    if (matRows.length > 0) {
      const { error: mErr } = await supabase.from("subject_lesson_materials").insert(matRows);
      if (mErr) {
        toast({ title: t("toast_materials_error"), description: mErr.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    toast({ title: editing ? t("toast_updated") : t("toast_created") });
    setSaving(false);
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? t("form_edit_title") : t("form_new_title")}</DialogTitle>
          <DialogDescription>{t("form_desc")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>{t("form_classroom")}</Label>
            <Select value={classroomId} onValueChange={setClassroomId} disabled={!!editing}>
              <SelectTrigger>
                <SelectValue placeholder={t("form_classroom_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {classrooms.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>{t("form_date")}</Label>
            <Input type="date" value={lessonDate} onChange={(e) => setLessonDate(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>{t("form_summary")}</Label>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={t("form_summary_placeholder")}
              rows={4}
            />
          </div>
          <div className="grid gap-2">
            <Label>{t("form_homework")}</Label>
            <Textarea
              value={homework}
              onChange={(e) => setHomework(e.target.value)}
              placeholder={t("form_homework_placeholder")}
              rows={2}
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t("form_materials")}</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => setMaterials((prev) => [...prev, emptyMaterial()])}
              >
                <Plus className="h-3.5 w-3.5" />
                {t("form_add_material")}
              </Button>
            </div>
            {materials.map((m, idx) => (
              <div key={idx} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("form_material_n", { n: idx + 1 })}
                  </span>
                  {materials.length > 1 && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => setMaterials((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <Input
                  value={m.title}
                  onChange={(e) => updateMaterial(idx, { title: e.target.value })}
                  placeholder={t("form_material_title")}
                />
                <Input
                  value={m.link_url}
                  onChange={(e) => updateMaterial(idx, { link_url: e.target.value })}
                  placeholder={t("form_material_link")}
                />
                <Textarea
                  value={m.content_text}
                  onChange={(e) => updateMaterial(idx, { content_text: e.target.value })}
                  placeholder={t("form_material_text")}
                  rows={2}
                />
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
