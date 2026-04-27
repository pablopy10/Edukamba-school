import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type RouteRow = {
  id: string;
  name: string;
  description: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  vehicle_plate: string | null;
  vehicle_model: string | null;
  capacity: number;
  shift: string;
  monthly_fee: number;
  is_active: boolean;
  notes: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  initial?: RouteRow | null;
  onSaved: () => void;
};

export const RouteFormDialog = ({ open, onOpenChange, schoolId, initial, onSaved }: Props) => {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    driver_name: "",
    driver_phone: "",
    vehicle_plate: "",
    vehicle_model: "",
    capacity: 20,
    shift: "BOTH",
    monthly_fee: 0,
    is_active: true,
    notes: "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: initial?.name ?? "",
        description: initial?.description ?? "",
        driver_name: initial?.driver_name ?? "",
        driver_phone: initial?.driver_phone ?? "",
        vehicle_plate: initial?.vehicle_plate ?? "",
        vehicle_model: initial?.vehicle_model ?? "",
        capacity: initial?.capacity ?? 20,
        shift: initial?.shift ?? "BOTH",
        monthly_fee: initial?.monthly_fee ?? 0,
        is_active: initial?.is_active ?? true,
        notes: initial?.notes ?? "",
      });
    }
  }, [open, initial]);

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Nome da rota é obrigatório");
      return;
    }
    setSaving(true);
    const payload = {
      school_id: schoolId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      driver_name: form.driver_name.trim() || null,
      driver_phone: form.driver_phone.trim() || null,
      vehicle_plate: form.vehicle_plate.trim() || null,
      vehicle_model: form.vehicle_model.trim() || null,
      capacity: Number(form.capacity) || 0,
      shift: form.shift,
      monthly_fee: Number(form.monthly_fee) || 0,
      is_active: form.is_active,
      notes: form.notes.trim() || null,
    };
    const { error } = initial
      ? await supabase.from("transport_routes").update(payload).eq("id", initial.id)
      : await supabase.from("transport_routes").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("Erro a guardar rota: " + error.message);
      return;
    }
    toast.success(initial ? "Rota atualizada" : "Rota criada");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar rota" : "Nova rota de transporte"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Nome da rota *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Giro Talatona — Maianga" />
          </div>
          <div className="md:col-span-2">
            <Label>Descrição</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
          <div>
            <Label>Motorista</Label>
            <Input value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} />
          </div>
          <div>
            <Label>Telefone do motorista</Label>
            <Input value={form.driver_phone} onChange={(e) => setForm({ ...form, driver_phone: e.target.value })} />
          </div>
          <div>
            <Label>Matrícula do veículo</Label>
            <Input value={form.vehicle_plate} onChange={(e) => setForm({ ...form, vehicle_plate: e.target.value })} />
          </div>
          <div>
            <Label>Modelo do veículo</Label>
            <Input value={form.vehicle_model} onChange={(e) => setForm({ ...form, vehicle_model: e.target.value })} />
          </div>
          <div>
            <Label>Capacidade</Label>
            <Input type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Período</Label>
            <Select value={form.shift} onValueChange={(v) => setForm({ ...form, shift: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MORNING">Manhã</SelectItem>
                <SelectItem value="AFTERNOON">Tarde</SelectItem>
                <SelectItem value="BOTH">Manhã e Tarde</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Mensalidade (AOA)</Label>
            <Input type="number" min={0} step="0.01" value={form.monthly_fee} onChange={(e) => setForm({ ...form, monthly_fee: Number(e.target.value) })} />
          </div>
          <div className="flex items-center gap-3 pt-6">
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            <Label>Rota ativa</Label>
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