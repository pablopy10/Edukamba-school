import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

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

  useEffect(() => {
    if (open) {
      setName(subject?.name ?? "");
      setCode(subject?.code ?? "");
    }
  }, [open, subject]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
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
        toast({ title: "Disciplina actualizada" });
      } else {
        const { data: userRes } = await supabase.auth.getUser();
        const { data: profile } = await supabase
          .from("profiles").select("school_id").eq("id", userRes.user?.id ?? "").maybeSingle();
        const schoolId = profile?.school_id;
        if (!schoolId) throw new Error("Escola não encontrada para o utilizador.");

        const { error } = await supabase.from("subjects").insert({
          name: name.trim(),
          code: code.trim() || null,
          school_id: schoolId,
        });
        if (error) throw error;
        toast({ title: "Disciplina criada" });
      }
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Disciplina" : "Nova Disciplina"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Actualize os dados da disciplina." : "Adicione uma nova disciplina à escola."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label htmlFor="sn">Nome da disciplina</Label>
            <Input id="sn" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Matemática" />
          </div>
          <div>
            <Label htmlFor="sc">Código</Label>
            <Input id="sc" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex.: MAT-101" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Guardar" : "Criar disciplina"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};