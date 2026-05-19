import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Loader2, GraduationCap, CheckCircle2, XCircle, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type Opt = { id: string; name: string };
type YearOpt = { id: string; label: string; is_active: boolean | null };

type EnrollmentItem = {
  id: string;
  student_id: string;
  student_name: string;
  result: string | null;
  result_notes: string | null;
  result_published_at: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  classrooms: Opt[];
  years: YearOpt[];
  defaultYearId?: string | null;
  defaultClassroomId?: string | null;
  onSaved: () => void;
}

export const PublishResultsDialog = ({
  open,
  onOpenChange,
  classrooms: _ignoredClassrooms,
  years,
  defaultYearId,
  defaultClassroomId,
  onSaved,
}: Props) => {
  const { t } = useTranslation("pages", { keyPrefix: "publish_results_dialog" });
  const { i18n } = useTranslation();
  const [yearId, setYearId] = useState<string>("");
  const [classroomId, setClassroomId] = useState<string>("");
  const [items, setItems] = useState<EnrollmentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notify, setNotify] = useState(true);
  const [classroomsForYear, setClassroomsForYear] = useState<Opt[]>([]);

  const localeTag =
    i18n.language?.startsWith("fr") ? "fr-FR" : i18n.language?.startsWith("pt") ? "pt-PT" : "en-GB";

  const resultOptions = useMemo(
    () =>
      (
        [
          { value: "EM_CURSO", labelKey: "result_in_progress" as const, cls: "bg-muted text-foreground" },
          { value: "APROVADO", labelKey: "approved" as const, cls: "bg-pastel-green text-pastel-green-foreground" },
          { value: "REPROVADO", labelKey: "failed" as const, cls: "bg-pastel-pink text-pastel-pink-foreground" },
          { value: "TRANSFERIDO", labelKey: "transferred" as const, cls: "bg-pastel-blue text-pastel-blue-foreground" },
        ] as const
      ).map((o) => ({ ...o, label: t(o.labelKey) })),
    [t],
  );

  useEffect(() => {
    if (!open) return;
    setYearId(defaultYearId ?? years.find((y) => y.is_active)?.id ?? "");
    setClassroomId(defaultClassroomId ?? "");
    setNotify(true);
  }, [open, defaultYearId, defaultClassroomId, years]);

  // Load classrooms scoped to selected year
  useEffect(() => {
    if (!open || !yearId) {
      setClassroomsForYear([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("classrooms")
        .select("id, name")
        .eq("academic_year_id", yearId)
        .order("name");
      if (cancelled) return;
      setClassroomsForYear((data ?? []) as Opt[]);
      if (classroomId && !(data ?? []).some((c) => c.id === classroomId)) {
        setClassroomId("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, yearId]);

  // Load enrollments for the year/classroom
  useEffect(() => {
    if (!open || !yearId || !classroomId) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("id, student_id, result, result_notes, result_published_at, students(full_name)")
        .eq("academic_year_id", yearId)
        .eq("classroom_id", classroomId);
      if (cancelled) return;
      if (error) {
        toast({ title: t("toast_load_error_title"), description: error.message, variant: "destructive" });
        setItems([]);
      } else {
        const mapped = (data ?? []).map((r) => {
          const row = r as unknown as {
            id: string;
            student_id: string;
            result: string | null;
            result_notes: string | null;
            result_published_at: string | null;
            students: { full_name: string } | null;
          };
          return {
            id: row.id,
            student_id: row.student_id,
            student_name: row.students?.full_name ?? "—",
            result: row.result,
            result_notes: row.result_notes,
            result_published_at: row.result_published_at,
          };
        }).sort((a, b) => a.student_name.localeCompare(b.student_name, i18n.resolvedLanguage || undefined));
        setItems(mapped);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, yearId, classroomId, i18n.resolvedLanguage, t]);

  const setRowResult = (id: string, value: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, result: value === "EM_CURSO" ? null : value } : it)),
    );
  };
  const setRowNotes = (id: string, value: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, result_notes: value } : it)),
    );
  };

  const setAll = (value: string) => {
    setItems((prev) =>
      prev.map((it) => ({ ...it, result: value === "EM_CURSO" ? null : value })),
    );
  };

  const summary = useMemo(() => {
    return {
      aprovado: items.filter((i) => i.result === "APROVADO").length,
      reprovado: items.filter((i) => i.result === "REPROVADO").length,
      transferido: items.filter((i) => i.result === "TRANSFERIDO").length,
      em_curso: items.filter((i) => !i.result || i.result === "EM_CURSO").length,
    };
  }, [items]);

  const submit = async () => {
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id ?? null;
      const nowIso = new Date().toISOString();
      for (const it of items) {
        const payload: {
          result: string | null;
          result_notes: string | null;
          result_published_at: string | null;
          result_published_by: string | null;
        } = {
          result: it.result,
          result_notes: it.result_notes || null,
          result_published_at: notify && it.result && it.result !== "EM_CURSO" ? nowIso : null,
          result_published_by: notify && it.result && it.result !== "EM_CURSO" ? userId : null,
        };
        if (!notify) {
          delete (payload as Partial<typeof payload>).result_published_at;
          delete (payload as Partial<typeof payload>).result_published_by;
        }
        const { error } = await supabase.from("enrollments").update(payload).eq("id", it.id);
        if (error) throw error;
      }
      const notified = summary.aprovado + summary.reprovado + summary.transferido;
      toast({
        title: t("toast_saved_notify_title"),
        description: notify
          ? t("toast_saved_notify_desc", { count: notified })
          : t("toast_saved_silent_desc"),
      });
      onSaved();
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: t("toast_generic_error_title"), description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>{t("year_label")}</Label>
            <Select value={yearId} onValueChange={setYearId}>
              <SelectTrigger>
                <SelectValue placeholder={t("select_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.label}
                    {y.is_active ? t("active_suffix") : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("class_label")}</Label>
            <Select value={classroomId} onValueChange={setClassroomId} disabled={!yearId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={yearId ? t("select_class_placeholder") : t("select_year_first")}
                />
              </SelectTrigger>
              <SelectContent>
                {classroomsForYear.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {classroomId && items.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-3">
            <span className="text-xs font-medium text-muted-foreground">{t("mark_all_as")}</span>
            <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => setAll("APROVADO")}>
              <CheckCircle2 className="h-3.5 w-3.5" /> {t("approved")}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => setAll("REPROVADO")}>
              <XCircle className="h-3.5 w-3.5" /> {t("failed")}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => setAll("TRANSFERIDO")}>
              <ArrowRightLeft className="h-3.5 w-3.5" /> {t("transferred")}
            </Button>
            <div className="ml-auto flex flex-wrap gap-1.5 text-xs">
              {summary.aprovado > 0 && (
                <span className="rounded-full bg-pastel-green/60 px-2 py-0.5 text-pastel-green-foreground">
                  {t("count_approved_suffix", { count: summary.aprovado })}
                </span>
              )}
              {summary.reprovado > 0 && (
                <span className="rounded-full bg-pastel-pink/60 px-2 py-0.5 text-pastel-pink-foreground">
                  {t("count_failed_suffix", { count: summary.reprovado })}
                </span>
              )}
              {summary.transferido > 0 && (
                <span className="rounded-full bg-pastel-blue/60 px-2 py-0.5 text-pastel-blue-foreground">
                  {t("count_transferred_suffix", { count: summary.transferido })}
                </span>
              )}
              {summary.em_curso > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5">
                  {t("count_no_result", { count: summary.em_curso })}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border max-h-[40vh] overflow-y-auto">
          {loading ? (
            <div className="py-10 text-center text-muted-foreground">
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            </div>
          ) : !classroomId ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("pick_class_to_start")}</p>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("no_enrollments_in_class")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pl-4 pr-2 font-semibold">{t("col_student")}</th>
                  <th className="py-2 pr-2 font-semibold w-[180px]">{t("col_result")}</th>
                  <th className="py-2 pr-4 font-semibold">{t("col_notes")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const cur = it.result ?? "EM_CURSO";
                  const opt = resultOptions.find((o) => o.value === cur)!;
                  return (
                    <tr key={it.id} className="border-b border-border last:border-0">
                      <td className="py-2 pl-4 pr-2 align-top">
                        <div className="font-medium text-foreground">{it.student_name}</div>
                        {it.result_published_at && (
                          <div className="text-xs text-muted-foreground">
                            {t("published_on", {
                              date: new Date(it.result_published_at).toLocaleDateString(localeTag),
                            })}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-2 align-top">
                        <Select value={cur} onValueChange={(v) => setRowResult(it.id, v)}>
                          <SelectTrigger className={cn("h-9 text-xs", opt.cls)}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {resultOptions.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 pr-4 align-top">
                        <Textarea
                          rows={1}
                          value={it.result_notes ?? ""}
                          onChange={(e) => setRowNotes(it.id, e.target.value)}
                          placeholder={t("notes_optional_ph")}
                          className="min-h-[36px] text-xs"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {items.length > 0 && (
          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox checked={notify} onCheckedChange={(v) => setNotify(!!v)} className="mt-0.5" />
            <span className="text-sm">
              {t("notify_checkbox")}
              <span className="block text-xs text-muted-foreground">{t("notify_hint")}</span>
            </span>
          </label>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={saving || !classroomId || items.length === 0}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
