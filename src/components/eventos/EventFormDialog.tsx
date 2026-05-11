import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { decodeEventAudience, encodeEventAudience, type EventAudiencePreset } from "@/lib/eventAudience";
import { cn } from "@/lib/utils";
import { isNativeMobileApp } from "@/lib/nativeApp";

export type EventRow = {
  id: string;
  title: string;
  type: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  organizer: string | null;
  audience: string | null;
  description: string | null;
  school_id: string | null;
  created_by: string | null;
};

const EVENT_TYPES = [
  { value: "academico", label: "Académico" },
  { value: "cultural", label: "Cultural" },
  { value: "desportivo", label: "Desportivo" },
  { value: "reuniao", label: "Reunião" },
  { value: "comunicado", label: "Comunicado" },
];

type ClassroomOpt = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string | null;
  event: EventRow | null;
  defaultDate?: string | null;
  onSaved: () => void;
};

export function EventFormDialog({ open, onOpenChange, schoolId, event, defaultDate, onSaved }: Props) {
  const native = isNativeMobileApp();
  const { selectedYearId } = useAcademicYear();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    type: "academico",
    event_date: "",
    start_time: "",
    end_time: "",
    location: "",
    organizer: "",
    description: "",
  });
  const [audiencePreset, setAudiencePreset] = useState<EventAudiencePreset>("all");
  const [audienceClassroomId, setAudienceClassroomId] = useState("");
  const [classrooms, setClassrooms] = useState<ClassroomOpt[]>([]);

  useEffect(() => {
    if (!open) return;
    if (event) {
      const decoded = decodeEventAudience(event.audience);
      setForm({
        title: event.title ?? "",
        type: event.type ?? "academico",
        event_date: event.event_date ?? "",
        start_time: event.start_time?.slice(0, 5) ?? "",
        end_time: event.end_time?.slice(0, 5) ?? "",
        location: event.location ?? "",
        organizer: event.organizer ?? "",
        description: event.description ?? "",
      });
      setAudiencePreset(decoded.preset);
      setAudienceClassroomId(decoded.classroomId ?? "");
    } else {
      setForm({
        title: "",
        type: "academico",
        event_date: defaultDate ?? new Date().toISOString().slice(0, 10),
        start_time: "",
        end_time: "",
        location: "",
        organizer: "",
        description: "",
      });
      setAudiencePreset("all");
      setAudienceClassroomId("");
    }
  }, [open, event, defaultDate]);

  useEffect(() => {
    if (!open || !schoolId || !selectedYearId) {
      setClassrooms([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("classrooms")
        .select("id,name")
        .eq("school_id", schoolId)
        .eq("academic_year_id", selectedYearId)
        .order("name", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error("EventFormDialog classrooms", error);
        toast.error("Não foi possível carregar turmas.");
        setClassrooms([]);
        return;
      }
      let list = (data ?? []).map((c) => ({ id: c.id, name: c.name }));

      const decoded = decodeEventAudience(event?.audience);
      const extra =
        decoded.preset === "classroom" && decoded.classroomId && !list.some((c) => c.id === decoded.classroomId)
          ? decoded.classroomId
          : null;

      if (extra) {
        const { data: one } = await supabase.from("classrooms").select("id,name").eq("id", extra).maybeSingle();
        if (one && !cancelled) {
          list = [...list, { id: one.id, name: one.name }];
          list.sort((a, b) => a.name.localeCompare(b.name, "pt"));
        }
      }

      setClassrooms(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, schoolId, selectedYearId, event?.audience]);

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error("Indique o título do evento.");
      return;
    }
    if (!form.event_date) {
      toast.error("Indique a data do evento.");
      return;
    }
    if (!schoolId) {
      toast.error("Escola não identificada.");
      return;
    }
    if (audiencePreset === "classroom") {
      if (!selectedYearId) {
        toast.error("Selecione o ano letivo no cabeçalho para dirigir o evento a uma turma.");
        return;
      }
      if (!audienceClassroomId) {
        toast.error("Selecione uma turma.");
        return;
      }
    }

    const audienceStored = encodeEventAudience(
      audiencePreset,
      audiencePreset === "classroom" ? audienceClassroomId : null,
    );

    setSaving(true);
    const payload = {
      school_id: schoolId,
      title: form.title.trim(),
      type: form.type,
      event_date: form.event_date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      location: form.location.trim() || null,
      organizer: form.organizer.trim() || null,
      audience: audienceStored,
      description: form.description.trim() || null,
    };

    const { error } = event
      ? await supabase.from("events").update(payload).eq("id", event.id)
      : await supabase.from("events").insert(payload);

    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(event ? "Evento atualizado." : "Evento criado.");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-2xl",
          native &&
            "max-h-[88dvh] overflow-y-auto overscroll-contain sm:max-h-[min(92dvh,44rem)]",
        )}
      >
        <DialogHeader>
          <DialogTitle>{event ? "Editar evento" : "Novo evento"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="title">Título *</Label>
            <Input id="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Tipo *</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="date">Data *</Label>
              <Input
                id="date"
                type="date"
                value={form.event_date}
                onChange={(e) => setForm({ ...form, event_date: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="start">Início</Label>
              <Input
                id="start"
                type="time"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="end">Fim</Label>
              <Input id="end" type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="location">Local</Label>
              <Input id="location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="organizer">Organizador</Label>
              <Input
                id="organizer"
                value={form.organizer}
                onChange={(e) => setForm({ ...form, organizer: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Público-alvo</Label>
            <Select
              value={audiencePreset}
              onValueChange={(v) => {
                const p = v as EventAudiencePreset;
                setAudiencePreset(p);
                if (p !== "classroom") setAudienceClassroomId("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos — notificações e email para todos</SelectItem>
                <SelectItem value="classroom">Turma — alunos com conta e educadores da turma</SelectItem>
                <SelectItem value="staff">Funcionários — apenas funcionários da escola</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {audiencePreset === "classroom" && (
            <div className="grid gap-2">
              <Label>Turma (ano letivo seleccionado) *</Label>
              {!selectedYearId ? (
                <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  Escolha o ano letivo no cabeçalho para listar turmas.
                </p>
              ) : classrooms.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  Não há turmas para este ano letivo nesta escola.
                </p>
              ) : (
                <Select value={audienceClassroomId} onValueChange={setAudienceClassroomId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a turma" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {classrooms.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "A guardar..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
