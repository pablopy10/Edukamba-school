import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type ActivityRow = {
  id: string;
  school_id: string | null;
  academic_year_id: string | null;
  name: string;
  category: string;
  responsible: string | null;
  location: string | null;
  start_time: string | null;
  end_time: string | null;
  capacity: number;
  description: string | null;
  is_recurring: boolean;
  weekdays: number[] | null;
  start_date: string | null;
  end_date: string | null;
  single_date: string | null;
};

const CATEGORIES = [
  { value: "musica", label: "Música" },
  { value: "desporto", label: "Desporto" },
  { value: "arte", label: "Arte" },
  { value: "tecnologia", label: "Tecnologia" },
  { value: "academico", label: "Académico" },
  { value: "teatro", label: "Teatro" },
];

const WEEKDAYS = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string | null;
  academicYear: { id: string; start_date: string; end_date: string } | null;
  activity: ActivityRow | null;
  onSaved: () => void;
};

export function ActivityFormDialog({ open, onOpenChange, schoolId, academicYear, activity, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "academico",
    responsible: "",
    location: "",
    start_time: "",
    end_time: "",
    capacity: 20,
    description: "",
    is_recurring: true,
    weekdays: [] as number[],
    single_date: "",
    start_date: "",
    end_date: "",
  });

  useEffect(() => {
    if (!open) return;
    if (activity) {
      setForm({
        name: activity.name ?? "",
        category: activity.category ?? "academico",
        responsible: activity.responsible ?? "",
        location: activity.location ?? "",
        start_time: activity.start_time?.slice(0, 5) ?? "",
        end_time: activity.end_time?.slice(0, 5) ?? "",
        capacity: activity.capacity ?? 20,
        description: activity.description ?? "",
        is_recurring: activity.is_recurring,
        weekdays: activity.weekdays ?? [],
        single_date: activity.single_date ?? "",
        start_date: activity.start_date ?? "",
        end_date: activity.end_date ?? "",
      });
    } else {
      const today = new Date().toISOString().slice(0, 10);
      setForm({
        name: "",
        category: "academico",
        responsible: "",
        location: "",
        start_time: "",
        end_time: "",
        capacity: 20,
        description: "",
        is_recurring: true,
        weekdays: [],
        single_date: today,
        start_date: academicYear?.start_date ?? today,
        end_date: academicYear?.end_date ?? today,
      });
    }
  }, [open, activity, academicYear]);

  const toggleWeekday = (d: number) => {
    setForm((f) => ({
      ...f,
      weekdays: f.weekdays.includes(d) ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d].sort(),
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Indique o nome da atividade.");
      return;
    }
    if (!schoolId) {
      toast.error("Escola não identificada.");
      return;
    }
    if (form.is_recurring) {
      if (form.weekdays.length === 0) {
        toast.error("Selecione pelo menos um dia da semana.");
        return;
      }
      if (!form.start_date || !form.end_date) {
        toast.error("Indique o período de validade.");
        return;
      }
    } else if (!form.single_date) {
      toast.error("Indique a data da atividade.");
      return;
    }

    setSaving(true);
    const payload = {
      school_id: schoolId,
      academic_year_id: academicYear?.id ?? null,
      name: form.name.trim(),
      category: form.category,
      responsible: form.responsible.trim() || null,
      location: form.location.trim() || null,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      capacity: form.capacity,
      description: form.description.trim() || null,
      is_recurring: form.is_recurring,
      weekdays: form.is_recurring ? form.weekdays : [],
      start_date: form.is_recurring ? form.start_date : null,
      end_date: form.is_recurring ? form.end_date : null,
      single_date: form.is_recurring ? null : form.single_date,
    };

    const { error } = activity
      ? await supabase.from("extracurricular_activities").update(payload).eq("id", activity.id)
      : await supabase.from("extracurricular_activities").insert(payload);

    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(activity ? "Atividade atualizada." : "Atividade criada.");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{activity ? "Editar atividade" : "Nova atividade"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="name">Nome *</Label>
            <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Categoria *</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="capacity">Capacidade</Label>
              <Input
                id="capacity"
                type="number"
                min={1}
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="responsible">Responsável</Label>
              <Input id="responsible" value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="location">Local</Label>
              <Input id="location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="start">Hora de início</Label>
              <Input id="start" type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="end">Hora de fim</Label>
              <Input id="end" type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
            <div>
              <Label className="text-sm font-semibold">Atividade recorrente</Label>
              <p className="text-xs text-muted-foreground">
                {form.is_recurring
                  ? "Repete-se nos dias da semana selecionados até ao fim do ano letivo."
                  : "Acontece numa data única."}
              </p>
            </div>
            <Switch checked={form.is_recurring} onCheckedChange={(v) => setForm({ ...form, is_recurring: v })} />
          </div>

          {form.is_recurring ? (
            <>
              <div className="grid gap-2">
                <Label>Dias da semana *</Label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((d) => {
                    const active = form.weekdays.includes(d.value);
                    return (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => toggleWeekday(d.value)}
                        className={cn(
                          "h-9 min-w-12 rounded-full border px-3 text-xs font-semibold transition-colors",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-muted-foreground hover:bg-accent",
                        )}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="start_date">Início *</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="end_date">Fim (último dia do ano letivo) *</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="single_date">Data *</Label>
              <Input
                id="single_date"
                type="date"
                value={form.single_date}
                onChange={(e) => setForm({ ...form, single_date: e.target.value })}
              />
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "A guardar..." : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}