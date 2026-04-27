import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Student = { id: string; full_name: string };
type Stop = { id: string; name: string };
type Route = { id: string; name: string; monthly_fee: number };

export type TransportEnrollment = {
  id: string;
  route_id: string;
  student_id: string;
  pickup_stop_id: string | null;
  dropoff_stop_id: string | null;
  direction: string;
  start_date: string;
  end_date: string | null;
  monthly_fee_override: number | null;
  status: string;
  notes: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  routes: Route[];
  initial?: TransportEnrollment | null;
  defaultRouteId?: string;
  onSaved: () => void;
};

export const TransportEnrollmentDialog = ({
  open,
  onOpenChange,
  schoolId,
  routes,
  initial,
  defaultRouteId,
  onSaved,
}: Props) => {
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [generateFees, setGenerateFees] = useState(true);

  const [form, setForm] = useState({
    route_id: defaultRouteId ?? "",
    student_id: "",
    pickup_stop_id: "",
    dropoff_stop_id: "",
    direction: "BOTH",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: "",
    monthly_fee_override: "",
    status: "ACTIVE",
    notes: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      route_id: initial?.route_id ?? defaultRouteId ?? "",
      student_id: initial?.student_id ?? "",
      pickup_stop_id: initial?.pickup_stop_id ?? "",
      dropoff_stop_id: initial?.dropoff_stop_id ?? "",
      direction: initial?.direction ?? "BOTH",
      start_date: initial?.start_date ?? new Date().toISOString().slice(0, 10),
      end_date: initial?.end_date ?? "",
      monthly_fee_override: initial?.monthly_fee_override?.toString() ?? "",
      status: initial?.status ?? "ACTIVE",
      notes: initial?.notes ?? "",
    });
    setGenerateFees(!initial);
  }, [open, initial, defaultRouteId]);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("students")
      .select("id, full_name")
      .eq("school_id", schoolId)
      .order("full_name")
      .then(({ data }) => setStudents((data as Student[]) ?? []));
  }, [open, schoolId]);

  useEffect(() => {
    if (!form.route_id) {
      setStops([]);
      return;
    }
    supabase
      .from("transport_stops")
      .select("id, name, position")
      .eq("route_id", form.route_id)
      .order("position")
      .then(({ data }) => setStops(((data as any[]) ?? []).map((s) => ({ id: s.id, name: s.name }))));
  }, [form.route_id]);

  const submit = async () => {
    if (!form.route_id || !form.student_id) {
      toast.error("Selecione rota e aluno");
      return;
    }
    setSaving(true);
    const payload: any = {
      school_id: schoolId,
      route_id: form.route_id,
      student_id: form.student_id,
      pickup_stop_id: form.pickup_stop_id || null,
      dropoff_stop_id: form.dropoff_stop_id || null,
      direction: form.direction,
      start_date: form.start_date,
      end_date: form.end_date || null,
      monthly_fee_override: form.monthly_fee_override ? Number(form.monthly_fee_override) : null,
      status: form.status,
      notes: form.notes.trim() || null,
    };

    let enrollmentId = initial?.id;
    if (initial) {
      const { error } = await supabase.from("transport_enrollments").update(payload).eq("id", initial.id);
      if (error) {
        setSaving(false);
        toast.error("Erro: " + error.message);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("transport_enrollments")
        .insert(payload)
        .select("id")
        .single();
      if (error) {
        setSaving(false);
        toast.error("Erro: " + error.message);
        return;
      }
      enrollmentId = (data as any).id;
    }

    if (generateFees && enrollmentId) {
      const { error: feeErr } = await supabase.rpc("generate_transport_fees", { _enrollment_id: enrollmentId });
      if (feeErr) {
        toast.error("Inscrição guardada, mas erro a gerar mensalidades: " + feeErr.message);
      } else {
        toast.success("Mensalidades de transporte geradas");
      }
    } else {
      toast.success(initial ? "Inscrição atualizada" : "Inscrição criada");
    }

    setSaving(false);
    onSaved();
    onOpenChange(false);
  };

  const selectedRoute = useMemo(() => routes.find((r) => r.id === form.route_id), [routes, form.route_id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar inscrição" : "Inscrever aluno no transporte"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>Rota *</Label>
            <Select value={form.route_id} onValueChange={(v) => setForm({ ...form, route_id: v, pickup_stop_id: "", dropoff_stop_id: "" })}>
              <SelectTrigger><SelectValue placeholder="Escolher rota" /></SelectTrigger>
              <SelectContent>
                {routes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Aluno *</Label>
            <Select value={form.student_id} onValueChange={(v) => setForm({ ...form, student_id: v })}>
              <SelectTrigger><SelectValue placeholder="Escolher aluno" /></SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Direção</Label>
            <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PICKUP">Apenas ida (recolha)</SelectItem>
                <SelectItem value="DROPOFF">Apenas regresso</SelectItem>
                <SelectItem value="BOTH">Ida e regresso</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Estado</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Ativa</SelectItem>
                <SelectItem value="INACTIVE">Inativa</SelectItem>
                <SelectItem value="CANCELLED">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Paragem de recolha</Label>
            <Select value={form.pickup_stop_id} onValueChange={(v) => setForm({ ...form, pickup_stop_id: v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {stops.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Paragem de regresso</Label>
            <Select value={form.dropoff_stop_id} onValueChange={(v) => setForm({ ...form, dropoff_stop_id: v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {stops.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Início</Label>
            <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </div>
          <div>
            <Label>Fim (opcional)</Label>
            <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label>Mensalidade personalizada (deixar vazio para usar a da rota: {selectedRoute?.monthly_fee ?? 0})</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.monthly_fee_override}
              onChange={(e) => setForm({ ...form, monthly_fee_override: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Notas</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
          <div className="md:col-span-2 flex items-center gap-3 rounded-lg bg-muted/40 p-3">
            <Switch checked={generateFees} onCheckedChange={setGenerateFees} />
            <Label>Gerar mensalidades automaticamente após guardar</Label>
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