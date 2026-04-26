import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle } from "lucide-react";

export type ScheduleRecord = {
  id?: string;
  classroom_id: string | null;
  subject_id: string | null;
  teacher_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  shift: "MORNING" | "AFTERNOON" | "EVENING" | null;
  notes: string | null;
};

type Option = { id: string; name: string };
type TimeSlotOption = { start_time: string; end_time: string; label: string | null; is_break: boolean; shift: string };

const DAYS = [
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

const SHIFTS: { value: ScheduleRecord["shift"]; label: string }[] = [
  { value: "MORNING", label: "Manhã" },
  { value: "AFTERNOON", label: "Tarde" },
  { value: "EVENING", label: "Noite" },
];

const trimTime = (t: string) => t?.slice(0, 5) ?? "";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string | null;
  classrooms: Option[];
  subjects: Option[];
  teachers: Option[];
  timeSlots: TimeSlotOption[];
  initial?: Partial<ScheduleRecord> | null;
  onSaved: () => void;
};

export const ScheduleFormDialog = ({
  open,
  onOpenChange,
  schoolId,
  classrooms,
  subjects,
  teachers,
  timeSlots,
  initial,
  onSaved,
}: Props) => {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ScheduleRecord>({
    classroom_id: null,
    subject_id: null,
    teacher_id: null,
    day_of_week: 1,
    start_time: "08:00",
    end_time: "09:00",
    room: "",
    shift: "MORNING",
    notes: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      id: initial?.id,
      classroom_id: initial?.classroom_id ?? null,
      subject_id: initial?.subject_id ?? null,
      teacher_id: initial?.teacher_id ?? null,
      day_of_week: initial?.day_of_week ?? 1,
      start_time: trimTime(initial?.start_time ?? "08:00"),
      end_time: trimTime(initial?.end_time ?? "09:00"),
      room: initial?.room ?? "",
      shift: (initial?.shift as ScheduleRecord["shift"]) ?? "MORNING",
      notes: initial?.notes ?? "",
    });
  }, [open, initial]);

  const slotsForShift = useMemo(
    () => timeSlots.filter((s) => s.shift === form.shift && !s.is_break),
    [timeSlots, form.shift],
  );

  const update = <K extends keyof ScheduleRecord>(key: K, value: ScheduleRecord[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const applySlot = (start: string, end: string) => {
    setForm((f) => ({ ...f, start_time: trimTime(start), end_time: trimTime(end) }));
  };

  const handleSave = async () => {
    if (!schoolId) {
      toast({ title: "Erro", description: "Escola não encontrada.", variant: "destructive" });
      return;
    }
    if (!form.classroom_id || !form.subject_id || !form.teacher_id) {
      toast({ title: "Campos obrigatórios", description: "Selecione turma, disciplina e professor.", variant: "destructive" });
      return;
    }
    if (form.start_time >= form.end_time) {
      toast({ title: "Hora inválida", description: "A hora de fim deve ser depois do início.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const payload = {
      school_id: schoolId,
      classroom_id: form.classroom_id,
      subject_id: form.subject_id,
      teacher_id: form.teacher_id,
      day_of_week: form.day_of_week,
      start_time: form.start_time,
      end_time: form.end_time,
      room: form.room?.trim() || null,
      shift: form.shift,
      notes: form.notes?.trim() || null,
    };

    const { error } = form.id
      ? await supabase.from("schedules").update(payload).eq("id", form.id)
      : await supabase.from("schedules").insert(payload);

    setSaving(false);

    if (error) {
      const msg = error.message?.includes("Conflito")
        ? error.message
        : `Erro ao guardar: ${error.message}`;
      toast({ title: "Conflito de horário", description: msg, variant: "destructive" });
      return;
    }

    toast({ title: form.id ? "Aula atualizada" : "Aula criada", description: "Horário guardado com sucesso." });
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar aula" : "Nova aula"}</DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Turma *</Label>
            <Select value={form.classroom_id ?? ""} onValueChange={(v) => update("classroom_id", v)}>
              <SelectTrigger><SelectValue placeholder="Escolher turma" /></SelectTrigger>
              <SelectContent>
                {classrooms.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Disciplina *</Label>
            <Select value={form.subject_id ?? ""} onValueChange={(v) => update("subject_id", v)}>
              <SelectTrigger><SelectValue placeholder="Escolher disciplina" /></SelectTrigger>
              <SelectContent>
                {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Professor *</Label>
            <Select value={form.teacher_id ?? ""} onValueChange={(v) => update("teacher_id", v)}>
              <SelectTrigger><SelectValue placeholder="Escolher professor" /></SelectTrigger>
              <SelectContent>
                {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Dia da semana *</Label>
            <Select value={String(form.day_of_week)} onValueChange={(v) => update("day_of_week", Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DAYS.map((d) => <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Turno</Label>
            <Select value={form.shift ?? "MORNING"} onValueChange={(v) => update("shift", v as ScheduleRecord["shift"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SHIFTS.map((s) => <SelectItem key={s.value} value={s.value!}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Sala</Label>
            <Input value={form.room ?? ""} onChange={(e) => update("room", e.target.value)} placeholder="Ex: Sala 12" />
          </div>

          {slotsForShift.length > 0 && (
            <div className="space-y-2 sm:col-span-2">
              <Label>Bloco horário (rápido)</Label>
              <div className="flex flex-wrap gap-2">
                {slotsForShift.map((s, i) => {
                  const start = trimTime(s.start_time);
                  const end = trimTime(s.end_time);
                  const active = form.start_time === start && form.end_time === end;
                  return (
                    <button
                      type="button"
                      key={`${s.start_time}-${i}`}
                      onClick={() => applySlot(s.start_time, s.end_time)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-foreground hover:bg-accent"
                      }`}
                    >
                      {s.label ? `${s.label} · ` : ""}{start}–{end}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Início *</Label>
            <Input type="time" value={form.start_time} onChange={(e) => update("start_time", e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Fim *</Label>
            <Input type="time" value={form.end_time} onChange={(e) => update("end_time", e.target.value)} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Notas</Label>
            <Textarea value={form.notes ?? ""} onChange={(e) => update("notes", e.target.value)} rows={2} />
          </div>
        </div>

        <div className="flex shrink-0 items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>O sistema deteta automaticamente conflitos de turma, professor e sala.</span>
        </div>

        <DialogFooter className="shrink-0 gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {form.id ? "Guardar alterações" : "Criar aula"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};