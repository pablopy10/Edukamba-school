import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Trash2, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export type TimeSlot = {
  id?: string;
  shift: "MORNING" | "AFTERNOON" | "EVENING";
  start_time: string;
  end_time: string;
  position: number;
  is_break: boolean;
  label: string | null;
};

const trim5 = (t: string) => t?.slice(0, 5) ?? "";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string | null;
  onSaved: () => void;
  /** Caixa de diálogo a ocupar todo o ecrã (app móvel nativo). */
  fullScreen?: boolean;
};

export const TimeSlotsDialog = ({ open, onOpenChange, schoolId, onSaved, fullScreen }: Props) => {
  const { t } = useTranslation("pages", { keyPrefix: "horarios.time_slots" });
  const { t: th } = useTranslation("pages", { keyPrefix: "horarios" });

  const [tab, setTab] = useState<TimeSlot["shift"]>("MORNING");
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !schoolId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("school_time_slots")
        .select("*")
        .eq("school_id", schoolId)
        .order("shift")
        .order("position");
      if (cancelled) return;
      if (error) {
        toast({ title: th("toast_error"), description: error.message, variant: "destructive" });
      } else {
        setSlots(
          (data ?? []).map((s) => ({
            id: s.id,
            shift: s.shift as TimeSlot["shift"],
            start_time: trim5(s.start_time),
            end_time: trim5(s.end_time),
            position: s.position,
            is_break: s.is_break,
            label: s.label,
          })),
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, schoolId]);

  const shiftSlots = slots.filter((s) => s.shift === tab);

  const updateSlot = (idx: number, patch: Partial<TimeSlot>) => {
    setSlots((prev) => {
      let count = -1;
      return prev.map((s) => {
        if (s.shift !== tab) return s;
        count++;
        return count === idx ? { ...s, ...patch } : s;
      });
    });
  };

  const removeSlot = (idx: number) => {
    setSlots((prev) => {
      let count = -1;
      return prev.filter((s) => {
        if (s.shift !== tab) return true;
        count++;
        return count !== idx;
      });
    });
  };

  const addSlot = () => {
    const last = shiftSlots[shiftSlots.length - 1];
    const start = last ? last.end_time : tab === "MORNING" ? "08:00" : tab === "AFTERNOON" ? "13:00" : "18:30";
    const [h, m] = start.split(":").map(Number);
    const endMin = h * 60 + m + 50;
    const end = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
    const next: TimeSlot = {
      shift: tab,
      start_time: start,
      end_time: end,
      position: (last?.position ?? 0) + 1,
      is_break: false,
      label: t("block_auto", { count: shiftSlots.filter((s) => !s.is_break).length + 1 }),
    };
    setSlots((prev) => [...prev, next]);
  };

  const handleSave = async () => {
    if (!schoolId) return;
    for (const s of slots) {
      if (s.start_time >= s.end_time) {
        toast({ title: t("toast_bad_time_title"), description: t("toast_bad_time_desc"), variant: "destructive" });
        return;
      }
    }
    setSaving(true);
    // Replace strategy: delete all then insert
    const { error: delError } = await supabase.from("school_time_slots").delete().eq("school_id", schoolId);
    if (delError) {
      setSaving(false);
      toast({ title: th("toast_error"), description: delError.message, variant: "destructive" });
      return;
    }
    if (slots.length > 0) {
      const payload = slots.map((s, i) => ({
        school_id: schoolId,
        shift: s.shift,
        start_time: s.start_time,
        end_time: s.end_time,
        position: i + 1,
        is_break: s.is_break,
        label: s.label?.trim() || null,
      }));
      const { error } = await supabase.from("school_time_slots").insert(payload);
      if (error) {
        setSaving(false);
        toast({ title: th("toast_error"), description: error.message, variant: "destructive" });
        return;
      }
    }
    setSaving(false);
    toast({ title: t("toast_updated_title"), description: t("toast_updated_desc") });
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex flex-col",
          fullScreen
            ? "!fixed !inset-0 !left-0 !top-0 z-50 flex h-[100dvh] max-h-[100dvh] w-full !max-w-none !translate-x-0 !translate-y-0 gap-0 rounded-none border-0 p-4 pt-14 sm:gap-4 sm:p-6 sm:pt-16"
            : "max-h-[85vh] max-w-3xl",
        )}
      >
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TimeSlot["shift"])} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="grid w-full shrink-0 grid-cols-3">
            {(["MORNING", "AFTERNOON", "EVENING"] as const).map((s) => (
              <TabsTrigger key={s} value={s}>
                {s === "MORNING" ? th("shift_morning") : s === "AFTERNOON" ? th("shift_afternoon") : th("shift_evening")}
              </TabsTrigger>
            ))}
          </TabsList>

          {(["MORNING", "AFTERNOON", "EVENING"] as const).map((s) => (
            <TabsContent key={s} value={s} className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : (
                <>
                  {shiftSlots.length === 0 && (
                    <p className="py-6 text-center text-sm text-muted-foreground">{t("empty_shift")}</p>
                  )}
                  {shiftSlots.map((slot, idx) => (
                    <div key={`${slot.id ?? "new"}-${idx}`} className="grid grid-cols-12 items-end gap-2 rounded-lg border border-border p-3">
                      <div className="col-span-12 sm:col-span-4">
                        <Label className="text-xs">{t("label_field")}</Label>
                        <Input value={slot.label ?? ""} onChange={(e) => updateSlot(idx, { label: e.target.value })} placeholder={t("label_placeholder")} />
                      </div>
                      <div className="col-span-5 sm:col-span-2">
                        <Label className="text-xs">{t("start")}</Label>
                        <Input type="time" value={slot.start_time} onChange={(e) => updateSlot(idx, { start_time: e.target.value })} />
                      </div>
                      <div className="col-span-5 sm:col-span-2">
                        <Label className="text-xs">{t("end")}</Label>
                        <Input type="time" value={slot.end_time} onChange={(e) => updateSlot(idx, { end_time: e.target.value })} />
                      </div>
                      <div className="col-span-2 sm:col-span-2 flex items-center gap-2">
                        <Switch checked={slot.is_break} onCheckedChange={(v) => updateSlot(idx, { is_break: v })} />
                        <Label className="text-xs">{t("break_toggle")}</Label>
                      </div>
                      <div className="col-span-12 sm:col-span-2 flex justify-end">
                        <Button variant="ghost" size="sm" onClick={() => removeSlot(idx)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" onClick={addSlot} className="w-full">
                    <Plus className="mr-2 h-4 w-4" /> {t("add_block")}
                  </Button>
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>

        <DialogFooter className="shrink-0 gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>{th("btn_cancel")}</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};