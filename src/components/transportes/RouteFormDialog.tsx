import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("pages", { keyPrefix: "transportes.route_form" });
  const { t: tt } = useTranslation("pages", { keyPrefix: "transportes" });
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
      toast.error(t("name_required"));
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
      toast.error(t("save_error", { message: error.message }));
      return;
    }
    toast.success(initial ? t("updated") : t("created"));
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{initial ? t("edit_title") : t("new_title")}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 overflow-y-auto flex-1 pr-2 -mr-2">
          <div className="md:col-span-2">
            <Label>{t("name")}</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("name_placeholder")} />
          </div>
          <div className="md:col-span-2">
            <Label>{t("description")}</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
          <div>
            <Label>{t("driver")}</Label>
            <Input value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} />
          </div>
          <div>
            <Label>{t("driver_phone")}</Label>
            <Input value={form.driver_phone} onChange={(e) => setForm({ ...form, driver_phone: e.target.value })} />
          </div>
          <div>
            <Label>{t("vehicle_plate")}</Label>
            <Input value={form.vehicle_plate} onChange={(e) => setForm({ ...form, vehicle_plate: e.target.value })} />
          </div>
          <div>
            <Label>{t("vehicle_model")}</Label>
            <Input value={form.vehicle_model} onChange={(e) => setForm({ ...form, vehicle_model: e.target.value })} />
          </div>
          <div>
            <Label>{t("capacity")}</Label>
            <Input type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
          </div>
          <div>
            <Label>{t("shift")}</Label>
            <Select value={form.shift} onValueChange={(v) => setForm({ ...form, shift: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MORNING">{tt("shifts.MORNING")}</SelectItem>
                <SelectItem value="AFTERNOON">{tt("shifts.AFTERNOON")}</SelectItem>
                <SelectItem value="BOTH">{tt("shifts.BOTH")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("monthly_fee")}</Label>
            <Input type="number" min={0} step="0.01" value={form.monthly_fee} onChange={(e) => setForm({ ...form, monthly_fee: Number(e.target.value) })} />
          </div>
          <div className="flex items-center gap-3 pt-6">
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            <Label>{t("active_route")}</Label>
          </div>
          <div className="md:col-span-2">
            <Label>{t("notes")}</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
        </div>
        <DialogFooter className="flex-shrink-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <Button onClick={submit} disabled={saving}>{saving ? t("saving") : t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};