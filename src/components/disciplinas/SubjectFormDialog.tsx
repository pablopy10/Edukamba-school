import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export type SubjectRow = {
  id: string;
  name: string;
  code: string | null;
  school_id: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subject?: SubjectRow | null;
  onSaved: () => void;
}

export const SubjectFormDialog = ({ open, onOpenChange, subject, onSaved }: Props) => {
  const isEdit = !!subject;
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const { t } = useTranslation("pages", { keyPrefix: "disciplinas.form" });

  useEffect(() => {
    if (open) {
      setName(subject?.name ?? "");
      setCode(subject?.code ?? "");
    }
  }, [open, subject]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({ title: t("toast_name_required"), variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      if (isEdit && subject) {
        const { error } = await supabase.from("subjects").update({
          name: name.trim(),
          code: code.trim() || null,
        }).eq("id", subject.id);
        if (error) throw error;
        toast({ title: t("toast_updated") });
      } else {
        const { data: userRes } = await supabase.auth.getUser();
        const { data: profile } = await supabase
          .from("profiles").select("school_id").eq("id", userRes.user?.id ?? "").maybeSingle();
        const schoolId = profile?.school_id;
        if (!schoolId) throw new Error(t("toast_school_missing"));

        const { error } = await supabase.from("subjects").insert({
          name: name.trim(),
          code: code.trim() || null,
          school_id: schoolId,
        });
        if (error) throw error;
        toast({ title: t("toast_created") });
      }
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: t("toast_generic_error"), description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const titleEdit = t("title_edit");
  const titleCreate = t("title_create");
  const descEdit = t("desc_edit");
  const descCreate = t("desc_create");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? titleEdit : titleCreate}</DialogTitle>
          <DialogDescription>
            {isEdit ? descEdit : descCreate}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label htmlFor="sn">{t("name_label")}</Label>
            <Input id="sn" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("name_placeholder")} />
          </div>
          <div>
            <Label htmlFor="sc">{t("code_label")}</Label>
            <Input id="sc" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("code_placeholder")} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>{t("cancel")}</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? t("submit_edit") : t("submit_create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};