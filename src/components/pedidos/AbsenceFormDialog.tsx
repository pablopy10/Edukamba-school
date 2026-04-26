import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type AbsenceRecord = {
  id: string;
  profile_id: string | null;
  requester_id: string | null;
  school_id: string | null;
  reason: string;
  description: string | null;
  start_date: string;
  end_date: string;
  status: string | null;
};

type StaffOption = { id: string; full_name: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  schoolId: string | null;
  currentUserId: string | null;
  isAdmin: boolean;
  staff: StaffOption[];
  initial?: AbsenceRecord | null;
}

const REASONS = [
  { value: "doenca", label: "Doença" },
  { value: "ferias", label: "Férias" },
  { value: "pessoal", label: "Pessoal" },
  { value: "luto", label: "Luto" },
  { value: "formacao", label: "Formação" },
  { value: "outro", label: "Outro" },
];

export const AbsenceFormDialog = ({ open, onOpenChange, onSaved, schoolId, currentUserId, isAdmin, staff, initial }: Props) => {
  const [profileId, setProfileId] = useState<string>("");
  const [reason, setReason] = useState<string>("doenca");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setProfileId(initial.profile_id ?? "");
      setReason(initial.reason ?? "doenca");
      setStartDate(initial.start_date ?? "");
      setEndDate(initial.end_date ?? "");
      setDescription(initial.description ?? "");
    } else {
      setProfileId(isAdmin ? "" : (currentUserId ?? ""));
      setReason("doenca");
      setStartDate("");
      setEndDate("");
      setDescription("");
    }
  }, [open, initial, isAdmin, currentUserId]);

  const handleSubmit = async () => {
    if (!schoolId || !currentUserId) {
      toast({ title: "Sessão inválida", variant: "destructive" });
      return;
    }
    const targetProfile = isAdmin ? (profileId || currentUserId) : currentUserId;
    if (!targetProfile || !startDate || !endDate || !reason) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    if (endDate < startDate) {
      toast({ title: "Data final inválida", description: "Deve ser igual ou posterior à inicial.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (initial) {
        const { error } = await supabase
          .from("staff_absences")
          .update({
            profile_id: targetProfile,
            reason,
            start_date: startDate,
            end_date: endDate,
            description: description || null,
          })
          .eq("id", initial.id);
        if (error) throw error;
        toast({ title: "Pedido atualizado" });
      } else {
        const { error } = await supabase.from("staff_absences").insert({
          profile_id: targetProfile,
          requester_id: currentUserId,
          school_id: schoolId,
          reason,
          start_date: startDate,
          end_date: endDate,
          description: description || null,
          status: "PENDING",
        });
        if (error) throw error;
        toast({ title: "Pedido criado" });
      }
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar pedido" : "Novo pedido de ausência"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {isAdmin && (
            <div className="grid gap-2">
              <Label>Funcionário</Label>
              <Select value={profileId} onValueChange={setProfileId}>
                <SelectTrigger><SelectValue placeholder="Selecionar funcionário" /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-2">
            <Label>Motivo</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Data inicial</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Data final</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes adicionais (opcional)" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "A guardar..." : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};