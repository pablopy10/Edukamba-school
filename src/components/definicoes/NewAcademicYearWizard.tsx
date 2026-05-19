import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Calendar, Check, Copy, Loader2, Sparkles } from "lucide-react";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { cn } from "@/lib/utils";

type Props = {
  schoolId: string | null;
  isAdmin: boolean;
};

type StepState = "pending" | "active" | "done";

type WizardStep = {
  key: string;
  label: string;
  state: StepState;
};

type CloneOptions = {
  courses: boolean;
  classrooms: boolean;
  fee_rules: boolean;
  subjects: boolean;
};

type CloneResult = {
  new_year_id: string;
  courses: number;
  classrooms: number;
  fee_rules: number;
  subjects: number;
};

const DEFAULT_OPTIONS: CloneOptions = {
  courses: true,
  classrooms: true,
  fee_rules: true,
  subjects: true,
};

export const NewAcademicYearWizard = ({ schoolId, isAdmin }: Props) => {
  const { t: tr } = useTranslation("pages", { keyPrefix: "definicoes" });
  const { years, refresh: refreshYears, setSelectedYearId } = useAcademicYear();
  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sourceYearId, setSourceYearId] = useState<string>("");
  const [setActive, setSetActive] = useState(true);
  const [options, setOptions] = useState<CloneOptions>(DEFAULT_OPTIONS);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [steps, setSteps] = useState<WizardStep[]>([]);
  const [result, setResult] = useState<CloneResult | null>(null);

  // Pré-selecionar o ano mais recente como origem
  useEffect(() => {
    if (!sourceYearId && years.length > 0) {
      const active = years.find((y) => y.is_active);
      setSourceYearId(active?.id ?? years[0].id);
    }
  }, [years, sourceYearId]);

  const sourceYear = useMemo(
    () => years.find((y) => y.id === sourceYearId) ?? null,
    [years, sourceYearId],
  );

  const computedSteps = useMemo<WizardStep[]>(() => {
    const list: WizardStep[] = [{ key: "create", label: tr("wizard.step_create"), state: "pending" }];
    if (options.courses) list.push({ key: "courses", label: tr("wizard.step_validate_courses"), state: "pending" });
    if (options.subjects) list.push({ key: "subjects", label: tr("wizard.step_validate_subjects"), state: "pending" });
    if (options.classrooms) list.push({ key: "classrooms", label: tr("wizard.step_clone_classrooms"), state: "pending" });
    if (options.fee_rules) list.push({ key: "fee_rules", label: tr("wizard.step_clone_fee_rules"), state: "pending" });
    list.push({ key: "finish", label: tr("wizard.step_finish"), state: "pending" });
    return list;
  }, [options, tr]);

  const reset = () => {
    setLabel("");
    setStartDate("");
    setEndDate("");
    setOptions(DEFAULT_OPTIONS);
    setSetActive(true);
    setProgress(0);
    setSteps([]);
    setResult(null);
  };

  const runWizard = async () => {
    if (!schoolId) {
      toast({ title: tr("validation.wizard_school_missing"), variant: "destructive" });
      return;
    }
    if (!label.trim()) {
      toast({ title: tr("validation.wizard_year_label"), variant: "destructive" });
      return;
    }
    if (!startDate || !endDate || endDate <= startDate) {
      toast({ title: tr("validation.wizard_dates"), description: tr("validation.wizard_dates_desc"), variant: "destructive" });
      return;
    }
    const willCloneFromSource = options.classrooms || options.fee_rules;
    if (willCloneFromSource && !sourceYearId) {
      toast({ title: tr("validation.wizard_source_required"), description: tr("validation.wizard_source_desc"), variant: "destructive" });
      return;
    }

    setRunning(true);
    setResult(null);
    const initial = computedSteps.map((s) => ({ ...s, state: "pending" as StepState }));
    setSteps(initial);
    setProgress(0);

    const advance = async (idx: number) => {
      setSteps((prev) =>
        prev.map((s, i) => ({
          ...s,
          state: i < idx ? "done" : i === idx ? "active" : "pending",
        })),
      );
      setProgress(Math.round((idx / initial.length) * 100));
      // Pequeno delay visual entre etapas
      await new Promise((r) => setTimeout(r, 350));
    };

    try {
      // Etapa 1: criar ano
      await advance(0);

      // Etapas intermédias visuais (a operação real é atómica no servidor)
      for (let i = 1; i < initial.length - 1; i++) {
        await advance(i);
      }

      // Chamada real
      const { data, error } = await supabase.rpc("clone_academic_year", {
        _school_id: schoolId,
        _source_year_id: sourceYearId || null,
        _new_label: label.trim(),
        _new_start: startDate,
        _new_end: endDate,
        _clone_courses: options.courses,
        _clone_classrooms: options.classrooms,
        _clone_fee_rules: options.fee_rules,
        _clone_subjects: options.subjects,
        _set_active: setActive,
      });
      if (error) throw error;

      // Finalizar
      await advance(initial.length - 1);
      setSteps((prev) => prev.map((s) => ({ ...s, state: "done" as StepState })));
      setProgress(100);

      const res = data as unknown as CloneResult;
      setResult(res);
      await refreshYears();
      if (setActive && res?.new_year_id) {
        setSelectedYearId(res.new_year_id);
      }
      toast({ title: tr("toasts.wizard_done"), description: tr("toasts.wizard_done_desc", { label: label.trim() }) });
    } catch (e: any) {
      toast({ title: tr("toasts.wizard_error"), description: e?.message ?? String(e), variant: "destructive" });
      setSteps((prev) => prev.map((s) => (s.state === "active" ? { ...s, state: "pending" } : s)));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <Label htmlFor="ny-label">{tr("wizard.labels.year_name")}</Label>
          <Input
            id="ny-label"
            placeholder={tr("wizard.placeholders.year_name")}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={!isAdmin || running}
          />
        </div>
        <div>
          <Label htmlFor="ny-start">{tr("wizard.labels.start")}</Label>
          <Input
            id="ny-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={!isAdmin || running}
          />
        </div>
        <div>
          <Label htmlFor="ny-end">{tr("wizard.labels.end")}</Label>
          <Input
            id="ny-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={!isAdmin || running}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-muted/30 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Copy className="h-4 w-4 text-foreground" />
          <h4 className="text-sm font-semibold text-foreground">{tr("wizard.clone_title")}</h4>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>{tr("wizard.source_year")}</Label>
            <Select
              value={sourceYearId || undefined}
              onValueChange={setSourceYearId}
              disabled={!isAdmin || running || years.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={years.length === 0 ? tr("wizard.source_placeholder_none") : tr("wizard.source_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.label}
                    {y.is_active ? tr("shared.active_suffix") : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sourceYear && (
              <p className="mt-2 text-xs text-muted-foreground">
                {tr("wizard.source_caption")} <span className="font-medium text-foreground">{sourceYear.label}</span>
              </p>
            )}
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <Checkbox
                checked={setActive}
                onCheckedChange={(v) => setSetActive(Boolean(v))}
                disabled={!isAdmin || running}
              />
              <span className="text-sm text-foreground">{tr("wizard.set_active")}</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CloneOption
            label={tr("wizard.opt_courses_label")}
            description={tr("wizard.opt_courses_desc")}
            checked={options.courses}
            onChange={(v) => setOptions((s) => ({ ...s, courses: v }))}
            disabled={!isAdmin || running}
          />
          <CloneOption
            label={tr("wizard.opt_classrooms_label")}
            description={tr("wizard.opt_classrooms_desc")}
            checked={options.classrooms}
            onChange={(v) => setOptions((s) => ({ ...s, classrooms: v }))}
            disabled={!isAdmin || running}
          />
          <CloneOption
            label={tr("wizard.opt_fee_rules_label")}
            description={tr("wizard.opt_fee_rules_desc")}
            checked={options.fee_rules}
            onChange={(v) => setOptions((s) => ({ ...s, fee_rules: v }))}
            disabled={!isAdmin || running}
          />
          <CloneOption
            label={tr("wizard.opt_subjects_label")}
            description={tr("wizard.opt_subjects_desc")}
            checked={options.subjects}
            onChange={(v) => setOptions((s) => ({ ...s, subjects: v }))}
            disabled={!isAdmin || running}
          />
        </div>
      </div>

      {(running || steps.length > 0) && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4" />
              {tr("wizard.progress_title")}
            </h4>
            <span className="text-xs font-medium text-muted-foreground">{progress}%</span>
          </div>
          <Progress value={progress} className="mb-4" />
          <ol className="space-y-2">
            {steps.map((s) => (
              <li
                key={s.key}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3 py-2 text-sm",
                  s.state === "done" && "border-emerald-500/40 bg-emerald-500/5 text-foreground",
                  s.state === "active" && "border-primary/40 bg-primary/5 text-foreground",
                  s.state === "pending" && "border-border bg-muted/20 text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                    s.state === "done" && "bg-emerald-500 text-white",
                    s.state === "active" && "bg-primary text-primary-foreground",
                    s.state === "pending" && "bg-muted text-muted-foreground",
                  )}
                >
                  {s.state === "done" ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : s.state === "active" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "•"
                  )}
                </span>
                <span className="font-medium">{s.label}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {result && !running && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Check className="h-4 w-4 text-emerald-600" />
            {tr("wizard.result_title")}
          </div>
          <ul className="grid grid-cols-2 gap-2 text-sm text-foreground sm:grid-cols-4">
            <li className="rounded-lg bg-card px-3 py-2 shadow-soft">
              <span className="block text-xs text-muted-foreground">{tr("wizard.result_courses")}</span>
              <span className="text-base font-semibold">{result.courses}</span>
            </li>
            <li className="rounded-lg bg-card px-3 py-2 shadow-soft">
              <span className="block text-xs text-muted-foreground">{tr("wizard.result_subjects")}</span>
              <span className="text-base font-semibold">{result.subjects}</span>
            </li>
            <li className="rounded-lg bg-card px-3 py-2 shadow-soft">
              <span className="block text-xs text-muted-foreground">{tr("wizard.result_classrooms")}</span>
              <span className="text-base font-semibold">{result.classrooms}</span>
            </li>
            <li className="rounded-lg bg-card px-3 py-2 shadow-soft">
              <span className="block text-xs text-muted-foreground">{tr("wizard.result_fee_rules")}</span>
              <span className="text-base font-semibold">{result.fee_rules}</span>
            </li>
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
        <Button variant="outline" onClick={reset} disabled={running}>
          {tr("wizard.btn_clear")}
        </Button>
        <Button onClick={runWizard} disabled={!isAdmin || running}>
          {running ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {tr("wizard.btn_running")}
            </>
          ) : (
            <>
              <Calendar className="mr-2 h-4 w-4" /> {tr("wizard.btn_run")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

const CloneOption = ({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) => (
  <label
    className={cn(
      "flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-4 transition-[var(--transition-smooth)] hover:bg-accent/40",
      disabled && "cursor-not-allowed opacity-60",
    )}
  >
    <Checkbox
      checked={checked}
      onCheckedChange={(v) => onChange(Boolean(v))}
      disabled={disabled}
      className="mt-0.5"
    />
    <span className="flex flex-col">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </span>
  </label>
);