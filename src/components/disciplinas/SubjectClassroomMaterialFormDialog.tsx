import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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

export type SubjectClassroomMaterialRow = {
  id: string;
  subject_id: string;
  classroom_id: string;
  academic_year_id: string | null;
  title: string;
  notes: string | null;
  link_url: string | null;
  sort_order: number;
  created_by: string | null;
};

type ClassroomOption = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  schoolId: string;
  academicYearId: string | null;
  classrooms: ClassroomOption[];
  editing: SubjectClassroomMaterialRow | null;
  defaultClassroomId?: string;
  onSaved: () => void;
};

export function SubjectClassroomMaterialFormDialog({
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
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setClassroomId(editing.classroom_id);
      setTitle(editing.title);
      setNotes(editing.notes ?? "");
      setLinkUrl(editing.link_url ?? "");
    } else {
      setClassroomId(defaultClassroomId ?? classrooms[0]?.id ?? "");
      setTitle("");
      setNotes("");
      setLinkUrl("");
    }
  }, [open, editing, classrooms, defaultClassroomId]);

  const save = async () => {
    if (!classroomId || !title.trim()) {
      toast({ title: t("material_toast_required"), variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      toast({ title: t("toast_session"), variant: "destructive" });
      setSaving(false);
      return;
    }

    const payload = {
      school_id: schoolId,
      subject_id: subjectId,
      classroom_id: classroomId,
      academic_year_id: academicYearId,
      title: title.trim(),
      notes: notes.trim() || null,
      link_url: linkUrl.trim() || null,
      created_by: userId,
    };

    if (editing) {
      const { error } = await supabase
        .from("subject_classroom_materials")
        .update({
          title: payload.title,
          notes: payload.notes,
          link_url: payload.link_url,
        })
        .eq("id", editing.id);
      if (error) {
        toast({ title: t("material_toast_save_error"), description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("subject_classroom_materials").insert(payload);
      if (error) {
        toast({ title: t("material_toast_save_error"), description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    toast({ title: editing ? t("material_toast_updated") : t("material_toast_created") });
    setSaving(false);
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? t("material_form_edit_title") : t("material_form_new_title")}</DialogTitle>
          <DialogDescription>{t("material_form_desc")}</DialogDescription>
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
            <Label>{t("material_form_title")}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("material_form_title_placeholder")}
            />
          </div>
          <div className="grid gap-2">
            <Label>{t("material_form_notes")}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("material_form_notes_placeholder")}
              rows={3}
            />
          </div>
          <div className="grid gap-2">
            <Label>{t("material_form_link")}</Label>
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder={t("material_form_link_placeholder")}
            />
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
