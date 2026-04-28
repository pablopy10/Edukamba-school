import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { sortByName } from "@/lib/utils";

export type RequestRow = {
  id: string;
  school_id: string | null;
  material_id: string | null;
  item_name: string;
  category: string;
  quantity: number;
  requester_id: string | null;
  teacher_name: string | null;
  classroom_id: string | null;
  student_id: string | null;
  recipient: string | null;
  description: string | null;
  status: string;
  needed_date: string | null;
};

type ClassroomOpt = { id: string; name: string };
type StudentOpt = { id: string; full_name: string; classroom_id: string | null };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  schoolId: string | null;
  userId: string | null;
  userName: string;
  request: RequestRow | null;
  classrooms: ClassroomOpt[];
  students: StudentOpt[];
  onSaved: () => void;
}

type Target = "turma" | "aluno";

export const MaterialRequestFormDialog = ({
  open, onOpenChange, schoolId, userId, userName, request, classrooms, students, onSaved,
}: Props) => {
  const isEdit = !!request;
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState<Target>("turma");
  const [form, setForm] = useState({
    item_name: "",
    category: "papelaria",
    quantity: 1,
    classroom_id: "" as string,
    student_id: "" as string,
    recipient: "",
    description: "",
    needed_date: "",
  });

  useEffect(() => {
    if (open) {
      const t: Target = request?.student_id ? "aluno" : "turma";
      setTarget(t);
      setForm({
        item_name: request?.item_name ?? "",
        category: request?.category ?? "papelaria",
        quantity: request?.quantity ?? 1,
        classroom_id: request?.classroom_id ?? "",
        student_id: request?.student_id ?? "",
        recipient: request?.recipient ?? "",
        description: request?.description ?? "",
        needed_date: request?.needed_date ?? "",
      });
    }
  }, [open, request]);

  const submit = async () => {
    if (!form.item_name.trim()) {
      toast({ title: "Indique o material", variant: "destructive" });
      return;
    }
    if (!form.needed_date) {
      toast({ title: "Indique o dia em que o aluno deve trazer o material", variant: "destructive" });
      return;
    }
    if (target === "turma" && !form.classroom_id) {
      toast({ title: "Selecione uma turma", variant: "destructive" });
      return;
    }
    if (target === "aluno" && !form.student_id) {
      toast({ title: "Selecione um aluno", variant: "destructive" });
      return;
    }
    if (!schoolId || !userId) {
      toast({ title: "Sessão inválida", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      school_id: schoolId,
      material_id: null,
      item_name: form.item_name.trim(),
      category: form.category,
      quantity: Number(form.quantity) || 1,
      requester_id: userId,
      teacher_name: userName || null,
      classroom_id: target === "turma" ? form.classroom_id : (target === "aluno" ? (students.find(s=>s.id===form.student_id)?.classroom_id ?? null) : null),
      student_id: target === "aluno" ? form.student_id : null,
      recipient: form.recipient.trim() || null,
      description: form.description.trim() || null,
      needed_date: form.needed_date,
    };
    const { error } = isEdit
      ? await supabase.from("material_requests").update(payload).eq("id", request!.id)
      : await supabase.from("material_requests").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao guardar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: isEdit ? "Pedido atualizado" : "Pedido criado" });
    onSaved();
    onOpenChange(false);
  };

  const filteredStudents = target === "aluno" && form.classroom_id
    ? students.filter((s) => s.classroom_id === form.classroom_id)
    : students;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Pedido" : "Novo Pedido de Material"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Material a trazer *</Label>
            <Input
              value={form.item_name}
              onChange={(e) => setForm({ ...form, item_name: e.target.value })}
              placeholder="Ex: Régua de 30cm, livro de Matemática..."
            />
          </div>
          <div>
            <Label>Categoria</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="papelaria">Papelaria</SelectItem>
                <SelectItem value="laboratorio">Laboratório</SelectItem>
                <SelectItem value="artes">Artes</SelectItem>
                <SelectItem value="desporto">Desporto</SelectItem>
                <SelectItem value="tecnologia">Tecnologia</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quantidade *</Label>
            <Input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Dia para trazer *</Label>
            <Input
              type="date"
              value={form.needed_date}
              onChange={(e) => setForm({ ...form, needed_date: e.target.value })}
            />
          </div>
          <div>
            <Label>Destinatário (Educador)</Label>
            <Input value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} placeholder="Ex: Sr. António Silva" />
          </div>

          <div className="sm:col-span-2">
            <Label>Para</Label>
            <div className="mt-1 inline-flex rounded-md border border-input p-1">
              <button
                type="button"
                onClick={() => { setTarget("turma"); setForm((f)=>({...f, student_id: ""})); }}
                className={`px-3 py-1.5 text-sm rounded ${target === "turma" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >Turma</button>
              <button
                type="button"
                onClick={() => setTarget("aluno")}
                className={`px-3 py-1.5 text-sm rounded ${target === "aluno" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >Aluno específico</button>
            </div>
          </div>

          {target === "turma" && (
            <div className="sm:col-span-2">
              <Label>Turma *</Label>
              <Select value={form.classroom_id} onValueChange={(v) => setForm({ ...form, classroom_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar turma..." /></SelectTrigger>
                <SelectContent>
                  {sortByName(classrooms).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {target === "aluno" && (
            <>
              <div>
                <Label>Filtrar por Turma</Label>
                <Select value={form.classroom_id || "all"} onValueChange={(v) => setForm({ ...form, classroom_id: v === "all" ? "" : v, student_id: "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {sortByName(classrooms).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Aluno *</Label>
                <Select value={form.student_id} onValueChange={(v) => setForm({ ...form, student_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar aluno..." /></SelectTrigger>
                  <SelectContent>
                    {filteredStudents.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="sm:col-span-2">
            <Label>Descrição / Motivo (para o educador)</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Explique o motivo do pedido para o encarregado de educação..."
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "A guardar..." : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};