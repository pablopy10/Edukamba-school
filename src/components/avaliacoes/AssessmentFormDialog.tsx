import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sortByName } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle } from "lucide-react";
import { useAcademicYear } from "@/context/AcademicYearContext";

export type AssessmentRecord = {
  id?: string;
  title: string;
  type: string;
  classroom_id: string | null;
  subject_id: string | null;
  teacher_id: string | null;
  date: string;
  start_time: string;
  end_time: string;
  room: string | null;
  weight: number;
  description: string | null;
  term_id: string | null;
};

type Option = { id: string; name: string };

const TYPES = [
  { value: "teste", label: "Teste" },
  { value: "exame", label: "Exame" },
  { value: "trabalho", label: "Trabalho de Grupo" },
  { value: "oral", label: "Oral" },
];

const trimTime = (t: string) => (t ? t.slice(0, 5) : "");

type Conflict = { id: string; title: string; reason: string };

type Term = { id: string; term_number: number; name: string; start_date: string; end_date: string };
type Holiday = { id: string; name: string; start_date: string; end_date: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string | null;
  classrooms: Option[];
  subjects: Option[];
  teachers: Option[];
  initial?: Partial<AssessmentRecord> | null;
  onSaved: () => void;
  /** When set, locks the teacher field to this profile id (used for TEACHER role). */
  lockTeacherId?: string | null;
  /** When set, locks the subject field to this subject id (used for TEACHER role). */
  lockSubjectId?: string | null;
};

const empty: AssessmentRecord = {
  title: "",
  type: "teste",
  classroom_id: null,
  subject_id: null,
  teacher_id: null,
  date: new Date().toISOString().slice(0, 10),
  start_time: "08:00",
  end_time: "09:30",
  room: "",
  weight: 0,
  description: "",
  term_id: null,
};

export const AssessmentFormDialog = ({
  open,
  onOpenChange,
  schoolId,
  classrooms,
  subjects,
  teachers,
  initial,
  onSaved,
  lockTeacherId,
  lockSubjectId,
}: Props) => {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AssessmentRecord>(empty);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [termManuallyOverridden, setTermManuallyOverridden] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConflicts([]);
    setTermManuallyOverridden(!!initial?.term_id);
    setForm({
      ...empty,
      ...initial,
      title: initial?.title ?? "",
      type: initial?.type ?? "teste",
      classroom_id: initial?.classroom_id ?? null,
      subject_id: lockSubjectId ?? initial?.subject_id ?? null,
      teacher_id: lockTeacherId ?? initial?.teacher_id ?? null,
      date: initial?.date ?? new Date().toISOString().slice(0, 10),
      start_time: trimTime(initial?.start_time ?? "08:00"),
      end_time: trimTime(initial?.end_time ?? "09:30"),
      room: initial?.room ?? "",
      weight: Number(initial?.weight ?? 0),
      description: initial?.description ?? "",
      term_id: initial?.term_id ?? null,
    });
  }, [open, initial, lockTeacherId, lockSubjectId]);

  // Load terms for the school
  const { selectedYearId } = useAcademicYear();
  useEffect(() => {
    if (!open || !schoolId) return;
    (async () => {
      let q = supabase
        .from("academic_terms")
        .select("id, term_number, name, start_date, end_date")
        .eq("school_id", schoolId)
        .order("term_number");
      if (selectedYearId) q = q.eq("academic_year_id", selectedYearId);
      const { data } = await q;
      setTerms((data ?? []) as Term[]);
      let hq = supabase
        .from("school_holidays")
        .select("id, name, start_date, end_date")
        .eq("school_id", schoolId);
      if (selectedYearId) hq = hq.eq("academic_year_id", selectedYearId);
      const { data: hData } = await hq;
      setHolidays((hData ?? []) as Holiday[]);
    })();
  }, [open, schoolId, selectedYearId]);

  const holidayMatch = holidays.find((h) => form.date >= h.start_date && form.date <= h.end_date);

  // Auto-derive term from date unless user manually overrode it
  useEffect(() => {
    if (!form.date || terms.length === 0 || termManuallyOverridden) return;
    const matched = terms.find((t) => form.date >= t.start_date && form.date <= t.end_date);
    setForm((f) => ({ ...f, term_id: matched?.id ?? null }));
  }, [form.date, terms, termManuallyOverridden]);

  const update = <K extends keyof AssessmentRecord>(key: K, value: AssessmentRecord[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Check for conflicts (does NOT block save)
  useEffect(() => {
    if (!open || !schoolId || !form.date || !form.start_time || !form.end_time) {
      setConflicts([]);
      return;
    }
    if (form.start_time >= form.end_time) {
      setConflicts([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("assessments")
        .select("id, title, classroom_id, room, start_time, end_time")
        .eq("school_id", schoolId)
        .eq("date", form.date);

      if (ctrl.signal.aborted || !data) return;

      const found: Conflict[] = [];
      for (const a of data) {
        if (form.id && a.id === form.id) continue;
        const aStart = trimTime((a.start_time as any) ?? "");
        const aEnd = trimTime((a.end_time as any) ?? "");
        if (!aStart || !aEnd) continue;
        const overlaps = aStart < form.end_time && aEnd > form.start_time;
        if (!overlaps) continue;

        const reasons: string[] = [];
        if (form.classroom_id && a.classroom_id === form.classroom_id) reasons.push("turma");
        const formRoom = (form.room ?? "").trim().toLowerCase();
        const aRoom = ((a.room as any) ?? "").trim().toLowerCase();
        if (formRoom && aRoom && formRoom === aRoom) reasons.push("sala");
        if (reasons.length > 0) {
          found.push({ id: a.id, title: a.title, reason: reasons.join(", ") });
        }
      }
      setConflicts(found);
    }, 350);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [
    open,
    schoolId,
    form.id,
    form.date,
    form.start_time,
    form.end_time,
    form.classroom_id,
    form.room,
  ]);

  const handleSave = async () => {
    if (!schoolId) {
      toast({ title: "Erro", description: "Escola não encontrada.", variant: "destructive" });
      return;
    }
    if (!form.title.trim()) {
      toast({ title: "Campos obrigatórios", description: "Indique um título.", variant: "destructive" });
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
      title: form.title.trim(),
      type: form.type,
      classroom_id: form.classroom_id,
      subject_id: form.subject_id,
      teacher_id: form.teacher_id,
      date: form.date,
      start_time: form.start_time,
      end_time: form.end_time,
      room: form.room?.trim() || null,
      weight: Number(form.weight) || 0,
      description: form.description?.trim() || null,
      term_id: form.term_id,
    };

    const { error } = form.id
      ? await supabase.from("assessments").update(payload).eq("id", form.id)
      : await supabase.from("assessments").insert(payload);

    setSaving(false);

    if (error) {
      toast({ title: "Erro ao guardar", description: error.message, variant: "destructive" });
      return;
    }

    toast({
      title: form.id ? "Avaliação atualizada" : "Avaliação criada",
      description: conflicts.length > 0 ? "Guardado com conflitos detetados." : "Guardado com sucesso.",
    });
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar avaliação" : "Nova avaliação"}</DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Título *</Label>
            <Input value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Ex: Teste de Funções" />
          </div>

          <div className="space-y-2">
            <Label>Tipo *</Label>
            <Select value={form.type} onValueChange={(v) => update("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Turma *</Label>
            <Select value={form.classroom_id ?? ""} onValueChange={(v) => update("classroom_id", v)}>
              <SelectTrigger><SelectValue placeholder="Escolher turma" /></SelectTrigger>
              <SelectContent>
                {sortByName(classrooms).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Disciplina *</Label>
            <Select
              value={form.subject_id ?? ""}
              onValueChange={(v) => update("subject_id", v)}
              disabled={!!lockSubjectId}
            >
              <SelectTrigger><SelectValue placeholder="Escolher disciplina" /></SelectTrigger>
              <SelectContent>
                {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Professor *</Label>
            <Select
              value={form.teacher_id ?? ""}
              onValueChange={(v) => update("teacher_id", v)}
              disabled={!!lockTeacherId}
            >
              <SelectTrigger><SelectValue placeholder="Escolher professor" /></SelectTrigger>
              <SelectContent>
                {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Data *</Label>
            <Input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Início *</Label>
            <Input type="time" value={form.start_time} onChange={(e) => update("start_time", e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Fim *</Label>
            <Input type="time" value={form.end_time} onChange={(e) => update("end_time", e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Sala</Label>
            <Input value={form.room ?? ""} onChange={(e) => update("room", e.target.value)} placeholder="Ex: Sala 12" />
          </div>

          <div className="space-y-2">
            <Label>Peso (%)</Label>
            <Input type="number" min={0} max={100} value={form.weight} onChange={(e) => update("weight", Number(e.target.value))} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>
              Trimestre {!termManuallyOverridden && <span className="text-xs font-normal text-muted-foreground">(automático pela data)</span>}
            </Label>
            {terms.length === 0 ? (
              <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                Configure os trimestres em Definições → Académico para ativar este campo.
              </p>
            ) : (
              <div className="flex items-center gap-2">
                <Select
                  value={form.term_id ?? "auto"}
                  onValueChange={(v) => {
                    if (v === "auto") {
                      setTermManuallyOverridden(false);
                      const matched = terms.find((t) => form.date >= t.start_date && form.date <= t.end_date);
                      update("term_id", matched?.id ?? null);
                    } else {
                      setTermManuallyOverridden(true);
                      update("term_id", v);
                    }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Sem trimestre" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automático pela data</SelectItem>
                    {terms.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {termManuallyOverridden && (
                  <span className="rounded-full bg-pastel-yellow/40 px-2 py-1 text-[10px] font-semibold text-pastel-yellow-foreground">
                    Manual
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Descrição</Label>
            <Textarea value={form.description ?? ""} onChange={(e) => update("description", e.target.value)} rows={2} />
          </div>

          {conflicts.length > 0 && (
            <div className="sm:col-span-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs">
              <div className="mb-2 flex items-center gap-2 font-semibold text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Conflito(s) detetado(s) ({conflicts.length})
              </div>
              <ul className="space-y-1 text-foreground">
                {conflicts.map((c) => (
                  <li key={c.id}>
                    • <span className="font-medium">{c.title}</span> — mesmo(a) {c.reason}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-muted-foreground">Pode guardar mesmo assim.</p>
            </div>
          )}

          {holidayMatch && (
            <div className="sm:col-span-2 rounded-lg border border-pastel-yellow-foreground/30 bg-pastel-yellow/30 p-3 text-xs">
              <div className="mb-1 flex items-center gap-2 font-semibold text-pastel-yellow-foreground">
                <AlertTriangle className="h-4 w-4" />
                Esta data está em período de férias: {holidayMatch.name}
              </div>
              <p className="text-muted-foreground">Pode guardar mesmo assim — a avaliação ficará marcada com aviso.</p>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {form.id ? "Guardar alterações" : "Criar avaliação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};