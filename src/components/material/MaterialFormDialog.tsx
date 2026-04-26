import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type MaterialRow = {
  id: string;
  school_id: string | null;
  name: string;
  category: string;
  sku: string | null;
  quantity: number;
  min_quantity: number;
  unit: string;
  location: string | null;
  description: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  schoolId: string | null;
  material: MaterialRow | null;
  onSaved: () => void;
}

const categories = [
  { v: "papelaria", l: "Papelaria" },
  { v: "laboratorio", l: "Laboratório" },
  { v: "artes", l: "Artes" },
  { v: "desporto", l: "Desporto" },
  { v: "tecnologia", l: "Tecnologia" },
];

export const MaterialFormDialog = ({ open, onOpenChange, schoolId, material, onSaved }: Props) => {
  const isEdit = !!material;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "papelaria",
    sku: "",
    quantity: 0,
    min_quantity: 0,
    unit: "un",
    location: "",
    description: "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: material?.name ?? "",
        category: material?.category ?? "papelaria",
        sku: material?.sku ?? "",
        quantity: material?.quantity ?? 0,
        min_quantity: material?.min_quantity ?? 0,
        unit: material?.unit ?? "un",
        location: material?.location ?? "",
        description: material?.description ?? "",
      });
    }
  }, [open, material]);

  const submit = async () => {
    if (!form.name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    if (!schoolId) {
      toast({ title: "Sem escola associada", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      school_id: schoolId,
      name: form.name.trim(),
      category: form.category,
      sku: form.sku.trim() || null,
      quantity: Number(form.quantity) || 0,
      min_quantity: Number(form.min_quantity) || 0,
      unit: form.unit.trim() || "un",
      location: form.location.trim() || null,
      description: form.description.trim() || null,
    };
    const { error } = isEdit
      ? await supabase.from("materials").update(payload).eq("id", material!.id)
      : await supabase.from("materials").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao guardar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: isEdit ? "Material atualizado" : "Material adicionado" });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Material" : "Novo Material"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Nome *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Categoria</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>SKU</Label>
            <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </div>
          <div>
            <Label>Quantidade (Stock)</Label>
            <Input type="number" min={0} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Stock mínimo</Label>
            <Input type="number" min={0} value={form.min_quantity} onChange={(e) => setForm({ ...form, min_quantity: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Unidade</Label>
            <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="un, kits, frascos..." />
          </div>
          <div>
            <Label>Localização</Label>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Ex: Armazém A · Prateleira 2" />
          </div>
          <div className="sm:col-span-2">
            <Label>Descrição</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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