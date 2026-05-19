import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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

const REASON_VALUES = ["doenca", "ferias", "pessoal", "luto", "formacao", "outro"] as const;

export const AbsenceFormDialog = ({ open, onOpenChange, onSaved, schoolId, currentUserId, isAdmin, staff, initial }: Props) => {
  const { t } = useTranslation("pages", { keyPrefix: "pedidos.form" });
  const { t: tp } = useTranslation("pages", { keyPrefix: "pedidos" });
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
      toast({ title: t("invalid_session"), variant: "destructive" });
      return;
    }
    const targetProfile = isAdmin ? (profileId || currentUserId) : currentUserId;
    if (!targetProfile || !startDate || !endDate || !reason) {
      toast({ title: t("required_fields"), variant: "destructive" });
      return;
    }
    if (endDate < startDate) {
      toast({ title: t("invalid_end_date"), description: t("invalid_end_date_desc"), variant: "destructive" });
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
        toast({ title: t("updated") });
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
        toast({ title: t("created") });
      }
      onSaved();
      onOpenChange(false);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast({ title: tp("toast_error"), description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? t("edit_title") : t("new_title")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {isAdmin && (
            <div className="grid gap-2">
              <Label>{t("staff")}</Label>
              <Select value={profileId} onValueChange={setProfileId}>
                <SelectTrigger><SelectValue placeholder={t("staff_placeholder")} /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-2">
            <Label>{t("reason")}</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASON_VALUES.map((r) => (
                  <SelectItem key={r} value={r}>{tp(`reasons.${r}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>{t("start_date")}</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>{t("end_date")}</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>{t("description")}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("description_placeholder")} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t("cancel")}</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? t("saving") : t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
