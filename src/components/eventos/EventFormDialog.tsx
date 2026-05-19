import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAcademicYear } from "@/context/AcademicYearContext";
import {
  formPresetToParsed,
  parsedAudienceToFormPreset,
  parseEventAudience,
  stringifyEventAudience,
  type EventAudienceFormPreset,
} from "@/lib/eventAudience";
import { cn } from "@/lib/utils";
import { isNativeMobileApp } from "@/lib/nativeApp";
import { useTranslation } from "react-i18next";

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

function intlLocaleForI18nLang(lang: string) {
  if (lang === "en") return "en-GB";
  if (lang === "fr") return "fr-FR";
  return "pt-PT";
}

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
  const { t, i18n } = useTranslation("pages", { keyPrefix: "eventos" });
  const { selectedYearId } = useAcademicYear();
  const [saving, setSaving] = useState(false);
  const localeTag = useMemo(() => intlLocaleForI18nLang(i18n.language ?? "pt"), [i18n.language]);

  const eventTypeOptions = useMemo(
    () => [
      { value: "academico", label: t("type_academic") },
      { value: "cultural", label: t("type_cultural") },
      { value: "desportivo", label: t("type_sports") },
      { value: "reuniao", label: t("type_meeting") },
      { value: "comunicado", label: t("type_notice") },
    ],
    [t],
  );

  const audienceOptions = useMemo(
    () =>
      ([
        { value: "all" as const, labelKey: "form.aud_all" },
        { value: "students" as const, labelKey: "form.aud_students" },
        { value: "educators" as const, labelKey: "form.aud_educators" },
        { value: "staff" as const, labelKey: "form.aud_staff" },
      ] as const).map((o) => ({ value: o.value, label: t(o.labelKey) })),
    [t],
  );

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
  const [audiencePreset, setAudiencePreset] = useState<EventAudienceFormPreset>("all");
  const [audienceClassroomIds, setAudienceClassroomIds] = useState<string[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomOpt[]>([]);

  useEffect(() => {
    if (!open) return;
    if (event) {
      const parsed = parseEventAudience(event.audience);
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
      if (parsed.mode === "classroom_legacy") {
        setAudiencePreset("students");
        setAudienceClassroomIds(parsed.classroomIds);
      } else {
        setAudiencePreset(parsedAudienceToFormPreset(parsed));
        setAudienceClassroomIds(
          parsed.mode === "students" || parsed.mode === "educators" ? [...parsed.classroomIds] : [],
        );
      }
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
      setAudienceClassroomIds([]);
    }
  }, [open, event, defaultDate]);

  useEffect(() => {
    if (!open || !schoolId || !selectedYearId) {
      setClassrooms([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("classrooms")
        .select("id,name")
        .eq("school_id", schoolId)
        .eq("academic_year_id", selectedYearId)
        .order("name", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error("EventFormDialog classrooms", error);
        toast.error(t("form.toast_classrooms_load"));
        setClassrooms([]);
        return;
      }
      let list = (data ?? []).map((c) => ({ id: c.id, name: c.name }));

      const parsed = parseEventAudience(event?.audience);
      const extraIds =
        parsed.mode === "students" || parsed.mode === "educators" || parsed.mode === "classroom_legacy"
          ? parsed.classroomIds
          : [];
      for (const id of extraIds) {
        if (id && !list.some((c) => c.id === id)) {
          const { data: one } = await supabase.from("classrooms").select("id,name").eq("id", id).maybeSingle();
          if (one && !cancelled) list = [...list, { id: one.id, name: one.name }];
        }
      }
      if (!cancelled) {
        list.sort((a, b) => a.name.localeCompare(b.name, localeTag));
        setClassrooms(list);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, schoolId, selectedYearId, event?.audience, t, localeTag]);

  const toggleClassroom = (id: string, checked: boolean) => {
    setAudienceClassroomIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error(t("form.toast_title_required"));
      return;
    }
    if (!form.event_date) {
      toast.error(t("form.toast_date_required"));
      return;
    }
    if (!schoolId) {
      toast.error(t("form.toast_school_required"));
      return;
    }
    if (audiencePreset === "students" || audiencePreset === "educators") {
      if (!selectedYearId) {
        toast.error(t("form.toast_year_pick_for_audience"));
        return;
      }
      if (audienceClassroomIds.length === 0) {
        toast.error(t("form.toast_pick_classroom"));
        return;
      }
    }

    const parsed = formPresetToParsed(audiencePreset, audienceClassroomIds, null);
    const audienceStored = stringifyEventAudience(parsed);

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
    toast.success(event ? t("form.toast_saved_updated") : t("form.toast_saved_created"));
    onOpenChange(false);
    onSaved();
  };

  const showTurmaPicker = audiencePreset === "students" || audiencePreset === "educators";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-2xl flex max-h-[min(90dvh,44rem)] flex-col gap-4 overflow-hidden p-6",
          native && "max-h-[88dvh]",
        )}
      >
        <DialogHeader className="shrink-0 space-y-0">
          <DialogTitle>{event ? t("form.dialog_edit") : t("form.dialog_new")}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pr-1">
          <div className="grid gap-4 py-1">
            <div className="grid gap-2">
              <Label htmlFor="title">{t("form.label_title")}</Label>
              <Input id="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>{t("form.label_type")}</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {eventTypeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="date">{t("form.label_date")}</Label>
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
                <Label htmlFor="start">{t("form.label_start")}</Label>
                <Input
                  id="start"
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="end">{t("form.label_end")}</Label>
                <Input
                  id="end"
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="location">{t("form.label_location")}</Label>
                <Input id="location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="organizer">{t("form.label_organizer")}</Label>
                <Input
                  id="organizer"
                  value={form.organizer}
                  onChange={(e) => setForm({ ...form, organizer: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>{t("form.label_audience")}</Label>
              <Select
                value={audiencePreset}
                onValueChange={(v) => {
                  const p = v as EventAudienceFormPreset;
                  setAudiencePreset(p);
                  if (p === "all" || p === "staff") setAudienceClassroomIds([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {audienceOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{t("form.audience_help")}</p>
            </div>

            {showTurmaPicker && (
              <div className="grid gap-2 rounded-xl border border-border bg-muted/20 p-3">
                <Label>{t("form.label_classrooms")}</Label>
                {!selectedYearId ? (
                  <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    {t("form.pick_year_for_classrooms")}
                  </p>
                ) : classrooms.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    {t("form.no_classrooms_year")}
                  </p>
                ) : (
                  <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                    {classrooms.map((c) => (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-transparent px-2 py-1 hover:bg-muted/40"
                      >
                        <Checkbox
                          checked={audienceClassroomIds.includes(c.id)}
                          onCheckedChange={(ch) => toggleClassroom(c.id, !!ch)}
                        />
                        <span className="text-sm text-foreground">{c.name}</span>
                      </label>
                    ))}
                  </div>
                )}
                {audiencePreset === "students" && (
                  <p className="text-[11px] text-muted-foreground">{t("form.hint_audience_students")}</p>
                )}
                {audiencePreset === "educators" && (
                  <p className="text-[11px] text-muted-foreground">{t("form.hint_audience_educators")}</p>
                )}
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="description">{t("form.label_description")}</Label>
              <Textarea
                id="description"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("form.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("form.saving") : t("form.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
