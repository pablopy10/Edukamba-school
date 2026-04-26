import { useEffect, useState } from "react";
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

const TYPES = [
  { value: "Básico", label: "Básico" },
  { value: "Médio", label: "Médio" },
  { value: "Avançado", label: "Avançado" },
];

export const CourseFormDialog = ({ open, onOpenChange, course, onSaved }: Props) => {
  const isEdit = !!course;
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      setName(course?.name ?? "");
      setType(course?.type ?? "");
      setDescription(course?.description ?? "");
    }
  }, [open, course]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
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
        toast({ title: "Curso actualizado" });
      } else {
        const { data: userRes } = await supabase.auth.getUser();
        const { data: profile } = await supabase
          .from("profiles").select("school_id").eq("id", userRes.user?.id ?? "").maybeSingle();
        const schoolId = profile?.school_id;
        if (!schoolId) throw new Error("Escola não encontrada para o utilizador.");

        const { error } = await supabase.from("courses").insert({
          name: name.trim(),
          type: type || null,
          description: description || null,
          school_id: schoolId,
        });
        if (error) throw error;
        toast({ title: "Curso criado" });
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
          <DialogTitle>{isEdit ? "Editar Curso" : "Novo Curso"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Actualize os dados do curso." : "Adicione um novo curso à escola."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label htmlFor="cn">Nome do curso</Label>
            <Input id="cn" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Ciências Naturais" />
          </div>
          <div>
            <Label>Nível</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue placeholder="Seleccionar nível..." /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="cd">Descrição</Label>
            <Textarea id="cd" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Breve descrição do curso..." rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Guardar" : "Criar curso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};