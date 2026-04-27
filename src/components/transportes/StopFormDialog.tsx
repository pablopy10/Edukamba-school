import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type StopRow = {
  id: string;
  route_id: string;
  name: string;
  address: string | null;
  pickup_time: string | null;
  dropoff_time: string | null;
  position: number;
  notes: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  routeId: string;
  initial?: StopRow | null;
  onSaved: () => void;
};

export const StopFormDialog = ({ open, onOpenChange, schoolId, routeId, initial, onSaved }: Props) => {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    address: "",
    pickup_time: "",
    dropoff_time: "",
    position: 1,
    notes: "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: initial?.name ?? "",
        address: initial?.address ?? "",
        pickup_time: initial?.pickup_time ?? "",
        dropoff_time: initial?.dropoff_time ?? "",
        position: initial?.position ?? 1,
        notes: initial?.notes ?? "",
      });
    }
  }, [open, initial]);

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Nome da paragem obrigatório");
      return;
    }
    setSaving(true);
    const payload = {
      school_id: schoolId,
      route_id: routeId,
      name: form.name.trim(),
      address: form.address.trim() || null,
      pickup_time: form.pickup_time || null,
      dropoff_time: form.dropoff_time || null,
      position: Number(form.position) || 1,
      notes: form.notes.trim() || null,
    };
    const { error } = initial
      ? await supabase.from("transport_stops").update(payload).eq("id", initial.id)
      : await supabase.from("transport_stops").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("Erro a guardar: " + error.message);
      return;
    }
    toast.success(initial ? "Paragem atualizada" : "Paragem criada");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Editar paragem" : "Nova paragem"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Nome *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Praça da Independência" />
          </div>
          <div className="md:col-span-2">
            <Label>Morada</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div>
            <Label>Hora de recolha</Label>
            <Input type="time" value={form.pickup_time} onChange={(e) => setForm({ ...form, pickup_time: e.target.value })} />
          </div>
          <div>
            <Label>Hora de regresso</Label>
            <Input type="time" value={form.dropoff_time} onChange={(e) => setForm({ ...form, dropoff_time: e.target.value })} />
          </div>
          <div>
            <Label>Ordem</Label>
            <Input type="number" min={1} value={form.position} onChange={(e) => setForm({ ...form, position: Number(e.target.value) })} />
          </div>
          <div className="md:col-span-2">
            <Label>Notas</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "A guardar..." : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};