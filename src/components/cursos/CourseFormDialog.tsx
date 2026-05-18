import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export type CourseRow = {
  id: string;
  name: string;
  type: string | null;
  description: string | null;
  school_id: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  course?: CourseRow | null;
  onSaved: () => void;
}

const LEVEL_DB_VALUES = ["Básico", "Médio", "Avançado"] as const;

export const CourseFormDialog = ({ open, onOpenChange, course, onSaved }: Props) => {
  const { t } = useTranslation("pages");
  const isEdit = !!course;
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("");
  const [description, setDescription] = useState("");

  const typeOptions = useMemo(
    () => LEVEL_DB_VALUES.map((value) => ({ value, label: t(`cursos.level.${value}`) })),
    [t],
  );

  useEffect(() => {
    if (open) {
      setName(course?.name ?? "");
      setType(course?.type ?? "");
      setDescription(course?.description ?? "");
    }
  }, [open, course]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({ title: t("cursos.form.toast_name_required"), variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      if (isEdit && course) {
        const { error } = await supabase.from("courses").update({
          name: name.trim(),
          type: type || null,
          description: description || null,
        }).eq("id", course.id);
        if (error) throw error;
        toast({ title: t("cursos.form.toast_updated") });
      } else {
        const { data: userRes } = await supabase.auth.getUser();
        const { data: profile } = await supabase
          .from("profiles").select("school_id").eq("id", userRes.user?.id ?? "").maybeSingle();
        const schoolId = profile?.school_id;
        if (!schoolId) throw new Error(t("cursos.form.toast_school_missing"));

        const { error } = await supabase.from("courses").insert({
          name: name.trim(),
          type: type || null,
          description: description || null,
          school_id: schoolId,
        });
        if (error) throw error;
        toast({ title: t("cursos.form.toast_created") });
      }
      onSaved();
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: t("cursos.form.toast_generic_error"), description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("cursos.form.title_edit") : t("cursos.form.title_create")}</DialogTitle>
          <DialogDescription>
            {isEdit ? t("cursos.form.desc_edit") : t("cursos.form.desc_create")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label htmlFor="cn">{t("cursos.form.name_label")}</Label>
            <Input id="cn" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("cursos.form.name_placeholder")} />
          </div>
          <div>
            <Label>{t("cursos.form.level_label")}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue placeholder={t("cursos.form.level_placeholder")} /></SelectTrigger>
              <SelectContent>
                {typeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="cd">{t("cursos.form.description_label")}</Label>
            <Textarea id="cd" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("cursos.form.description_placeholder")} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>{t("shared.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? t("shared.save") : t("cursos.form.submit_create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
