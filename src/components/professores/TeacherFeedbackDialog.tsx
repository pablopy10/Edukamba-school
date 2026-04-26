import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, ThumbsUp, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export type TeacherFeedbackRecord = {
  id?: string;
  kind: "PRAISE" | "COMPLAINT";
  subject: string;
  description: string | null;
  severity: "LOW" | "NORMAL" | "HIGH";
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string | null;
  teacherProfileId: string;
  teacherName: string;
  initial?: Partial<TeacherFeedbackRecord> | null;
  onSaved: () => void;
};

const empty: TeacherFeedbackRecord = {
  kind: "PRAISE",
  subject: "",
  description: "",
  severity: "NORMAL",
};

export const TeacherFeedbackDialog = ({
  open,
  onOpenChange,
  schoolId,
  teacherProfileId,
  teacherName,
  initial,
  onSaved,
}: Props) => {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TeacherFeedbackRecord>(empty);

  useEffect(() => {
    if (!open) return;
    setForm({
      ...empty,
      ...initial,
      kind: (initial?.kind as TeacherFeedbackRecord["kind"]) ?? "PRAISE",
      subject: initial?.subject ?? "",
      description: initial?.description ?? "",
      severity: (initial?.severity as TeacherFeedbackRecord["severity"]) ?? "NORMAL",
    });
  }, [open, initial]);

  const update = <K extends keyof TeacherFeedbackRecord>(key: K, value: TeacherFeedbackRecord[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if (!schoolId) {
      toast({ title: "Erro", description: "Escola não encontrada.", variant: "destructive" });
      return;
    }
    if (!form.subject.trim()) {
      toast({ title: "Campo obrigatório", description: "Indique o assunto.", variant: "destructive" });
      return;
    }
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id ?? null;
    if (!userId) {
      toast({ title: "Sessão expirada", description: "Inicie sessão novamente.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const payload = {
      school_id: schoolId,
      reporter_id: userId,
      target_type: "TEACHER",
      target_profile_id: teacherProfileId,
      kind: form.kind,
      subject: form.subject.trim(),
      description: form.description?.trim() || null,
      severity: form.kind === "PRAISE" ? "NORMAL" : form.severity,
    };

    const { error } = form.id
      ? await supabase.from("complaints").update(payload).eq("id", form.id)
      : await supabase.from("complaints").insert(payload);

    setSaving(false);

    if (error) {
      toast({ title: "Erro ao guardar", description: error.message, variant: "destructive" });
      return;
    }

    toast({
      title: form.id ? "Avaliação atualizada" : "Avaliação registada",
      description: `${form.kind === "PRAISE" ? "Elogio" : "Reclamação"} sobre ${teacherName}.`,
    });
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar avaliação" : "Avaliar professor"}</DialogTitle>
          <p className="text-sm text-muted-foreground">{teacherName}</p>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label>Tipo *</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => update("kind", "PRAISE")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-all",
                  form.kind === "PRAISE"
                    ? "border-pastel-green bg-pastel-green/40 text-pastel-green-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-pastel-green/60"
                )}
              >
                <ThumbsUp className="h-4 w-4" /> Elogio
              </button>
              <button
                type="button"
                onClick={() => update("kind", "COMPLAINT")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-all",
                  form.kind === "COMPLAINT"
                    ? "border-pastel-pink bg-pastel-pink/40 text-pastel-pink-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-pastel-pink/60"
                )}
              >
                <AlertTriangle className="h-4 w-4" /> Reclamação
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Assunto *</Label>
            <Input
              value={form.subject}
              onChange={(e) => update("subject", e.target.value)}
              placeholder={form.kind === "PRAISE" ? "Ex: Excelente apoio aos alunos" : "Ex: Atraso recorrente"}
            />
          </div>

          {form.kind === "COMPLAINT" && (
            <div className="space-y-2">
              <Label>Gravidade</Label>
              <Select value={form.severity} onValueChange={(v) => update("severity", v as TeacherFeedbackRecord["severity"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Baixa</SelectItem>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                  <SelectItem value="HIGH">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={form.description ?? ""}
              onChange={(e) => update("description", e.target.value)}
              rows={4}
              placeholder="Descreva os detalhes…"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {form.id ? "Guardar alterações" : "Registar avaliação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};