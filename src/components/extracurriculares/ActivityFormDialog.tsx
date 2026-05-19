import { useEffect, useMemo, useState } from "react";
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
import { useTranslation } from "react-i18next";

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
  enrollment_fee: number;
  billing_frequency: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string | null;
  academicYear: { id: string; start_date: string; end_date: string } | null;
  activity: ActivityRow | null;
  onSaved: () => void;
};

export function ActivityFormDialog({ open, onOpenChange, schoolId, academicYear, activity, onSaved }: Props) {
  const { t } = useTranslation("pages", { keyPrefix: "extracurriculares" });
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
    enrollment_fee: 0,
    billing_frequency: "unica",
  });

  const categoryOptions = useMemo(
    () => [
      { value: "musica", label: t("cat_music") },
      { value: "desporto", label: t("cat_sports") },
      { value: "arte", label: t("cat_art") },
      { value: "tecnologia", label: t("cat_technology") },
      { value: "academico", label: t("cat_academic") },
      { value: "teatro", label: t("cat_theater") },
    ],
    [t],
  );

  const weekdayOptions = useMemo(
    () =>
      ([1, 2, 3, 4, 5, 6, 0] as const).map((value) => ({
        value,
        label: t(`activity_form.weekday_short_${value}` as const),
      })),
    [t],
  );

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
        enrollment_fee: Number(activity.enrollment_fee ?? 0),
        billing_frequency: activity.billing_frequency ?? "unica",
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
        enrollment_fee: 0,
        billing_frequency: "unica",
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
      toast.error(t("activity_form.toast_name_required"));
      return;
    }
    if (!schoolId) {
      toast.error(t("activity_form.toast_school_unknown"));
      return;
    }
    if (form.is_recurring) {
      if (form.weekdays.length === 0) {
        toast.error(t("activity_form.toast_weekdays_required"));
        return;
      }
      if (!form.start_date || !form.end_date) {
        toast.error(t("activity_form.toast_period_required"));
        return;
      }
    } else if (!form.single_date) {
      toast.error(t("activity_form.toast_single_date_required"));
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
      enrollment_fee: Number(form.enrollment_fee) || 0,
      billing_frequency: form.is_recurring ? form.billing_frequency : "unica",
    };

    const { error } = activity
      ? await supabase.from("extracurricular_activities").update(payload).eq("id", activity.id)
      : await supabase.from("extracurricular_activities").insert(payload);

    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(activity ? t("activity_form.toast_saved_updated") : t("activity_form.toast_saved_created"));
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{activity ? t("activity_form.title_edit") : t("activity_form.title_new")}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="name">{t("activity_form.label_name")}</Label>
            <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t("activity_form.label_category")}</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="capacity">{t("activity_form.label_capacity")}</Label>
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
              <Label htmlFor="responsible">{t("activity_form.label_responsible")}</Label>
              <Input
                id="responsible"
                value={form.responsible}
                onChange={(e) => setForm({ ...form, responsible: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="location">{t("activity_form.label_location")}</Label>
              <Input id="location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="start">{t("activity_form.label_start_time")}</Label>
              <Input
                id="start"
                type="time"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="end">{t("activity_form.label_end_time")}</Label>
              <Input id="end" type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
            <div>
              <Label className="text-sm font-semibold">{t("activity_form.recurring_title")}</Label>
              <p className="text-xs text-muted-foreground">
                {form.is_recurring ? t("activity_form.recurring_hint_on") : t("activity_form.recurring_hint_off")}
              </p>
            </div>
            <Switch checked={form.is_recurring} onCheckedChange={(v) => setForm({ ...form, is_recurring: v })} />
          </div>

          {form.is_recurring ? (
            <>
              <div className="grid gap-2">
                <Label>{t("activity_form.label_weekdays")}</Label>
                <div className="flex flex-wrap gap-2">
                  {weekdayOptions.map((d) => {
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
                  <Label htmlFor="start_date">{t("activity_form.label_start_date")}</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="end_date">{t("activity_form.label_end_date")}</Label>
                  <Input id="end_date" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                </div>
              </div>
            </>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="single_date">{t("activity_form.label_single_date")}</Label>
              <Input
                id="single_date"
                type="date"
                value={form.single_date}
                onChange={(e) => setForm({ ...form, single_date: e.target.value })}
              />
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="description">{t("activity_form.label_description")}</Label>
            <Textarea
              id="description"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
            <Label className="text-sm font-semibold">{t("activity_form.section_fee")}</Label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="enrollment_fee">{t("activity_form.label_enrollment_fee")}</Label>
                <Input
                  id="enrollment_fee"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.enrollment_fee}
                  onChange={(e) => setForm({ ...form, enrollment_fee: parseFloat(e.target.value) || 0 })}
                />
                <p className="text-[11px] text-muted-foreground">{t("activity_form.hint_free_fee")}</p>
              </div>
              {form.is_recurring && (
                <div className="grid gap-2">
                  <Label>{t("activity_form.billing_frequency_label")}</Label>
                  <Select
                    value={form.billing_frequency}
                    onValueChange={(v) => setForm({ ...form, billing_frequency: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unica">{t("activity_form.billing_once")}</SelectItem>
                      <SelectItem value="mensal">{t("activity_form.billing_monthly")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("activity_form.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("activity_form.saving") : t("activity_form.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
