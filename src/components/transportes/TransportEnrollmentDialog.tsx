import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  /** Pré-selecção da rota ao criar nova inscrição (ex.: vista da rota). */
  defaultRouteId?: string | null;
  onSaved: () => void;
  isParent?: boolean;
  childIds?: string[];
};

export const TransportEnrollmentDialog = ({
  open,
  onOpenChange,
  schoolId,
  routes,
  initial,
  defaultRouteId,
  onSaved,
  isParent,
  childIds,
}: Props) => {
  const { t } = useTranslation("pages", { keyPrefix: "transportes.enrollment_form" });
  const { t: tt } = useTranslation("pages", { keyPrefix: "transportes" });
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
    let query = supabase
      .from("students")
      .select("id, full_name")
      .eq("school_id", schoolId)
      .order("full_name");
      
    if (isParent) {
      if (!childIds || childIds.length === 0) {
        setStudents([]);
        return;
      }
      query = query.in("id", childIds);
    }
    
    query.then(({ data }) => setStudents((data as Student[]) ?? []));
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
      toast.error(t("select_route_student"));
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
        toast.error(t("error_prefix", { message: error.message }));
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
        toast.error(t("error_prefix", { message: error.message }));
        return;
      }
      enrollmentId = (data as any).id;
    }

    if (generateFees && enrollmentId) {
      const { error: feeErr } = await supabase.rpc("generate_transport_fees", { _enrollment_id: enrollmentId });
      if (feeErr) {
        toast.error(t("fees_partial_error", { message: feeErr.message }));
      } else {
        toast.success(t("fees_generated"));
      }
    } else {
      toast.success(initial ? t("updated") : t("created"));
    }

    setSaving(false);
    onSaved();
    onOpenChange(false);
  };

  const selectedRoute = useMemo(() => routes.find((r) => r.id === form.route_id), [routes, form.route_id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{initial ? t("edit_title") : t("new_title")}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 overflow-y-auto flex-1 pr-2 -mr-2">
          <div>
            <Label>{t("route")}</Label>
            <Select value={form.route_id} onValueChange={(v) => setForm({ ...form, route_id: v, pickup_stop_id: "", dropoff_stop_id: "" })}>
              <SelectTrigger><SelectValue placeholder={t("choose_route")} /></SelectTrigger>
              <SelectContent>
                {routes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("student")}</Label>
            <Select value={form.student_id} onValueChange={(v) => setForm({ ...form, student_id: v })}>
              <SelectTrigger><SelectValue placeholder={t("choose_student")} /></SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("direction")}</Label>
            <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PICKUP">{t("direction_pickup")}</SelectItem>
                <SelectItem value="DROPOFF">{t("direction_dropoff")}</SelectItem>
                <SelectItem value="BOTH">{t("direction_both")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("status")}</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">{tt("enrollment_status.ACTIVE")}</SelectItem>
                <SelectItem value="INACTIVE">{tt("enrollment_status.INACTIVE")}</SelectItem>
                <SelectItem value="CANCELLED">{tt("enrollment_status.CANCELLED")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("pickup_stop")}</Label>
            <Select value={form.pickup_stop_id} onValueChange={(v) => setForm({ ...form, pickup_stop_id: v })}>
              <SelectTrigger><SelectValue placeholder={tt("em_dash")} /></SelectTrigger>
              <SelectContent>
                {stops.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("dropoff_stop")}</Label>
            <Select value={form.dropoff_stop_id} onValueChange={(v) => setForm({ ...form, dropoff_stop_id: v })}>
              <SelectTrigger><SelectValue placeholder={tt("em_dash")} /></SelectTrigger>
              <SelectContent>
                {stops.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("start")}</Label>
            <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </div>
          <div>
            <Label>{t("end_optional")}</Label>
            <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label>{t("custom_fee", { fee: selectedRoute?.monthly_fee ?? 0 })}</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.monthly_fee_override}
              onChange={(e) => setForm({ ...form, monthly_fee_override: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <Label>{t("notes")}</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
          {!isParent && (
            <div className="md:col-span-2 flex items-center gap-3 rounded-lg bg-muted/40 p-3">
              <Switch checked={generateFees} onCheckedChange={setGenerateFees} />
              <Label>{t("auto_generate_fees")}</Label>
            </div>
          )}
        </div>
        <DialogFooter className="flex-shrink-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <Button onClick={submit} disabled={saving}>{saving ? t("saving") : t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};