import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { GRADE_LEVELS } from "@/lib/grade-levels";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { HOMEROOM_ELIGIBLE_PROFILE_ROLES } from "@/lib/schoolStaffRoles";
import { intlLocaleTagFromLng } from "@/lib/intlLocale";

export type ClassroomRow = {
  id: string;
  name: string;
  grade_level: string | null;
  period: string | null;
  course_id: string | null;
  academic_year_id: string | null;
  school_id: string | null;
  homeroom_teacher_id?: string | null;
};

type Opt = { id: string; name: string };
type YearOpt = { id: string; label: string; is_active?: boolean | null };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  courses: Opt[];
  years: YearOpt[];
  classroom?: ClassroomRow | null;
  onSaved: () => void;
}

const PERIOD_DB_VALUES = ["Manhã", "Tarde", "Noite"] as const;

const NONE_HOMEROOM = "__none__";

/** Perfis elegíveis como diretor de turma (não inclui alunos nem encargados). */
const HOMEROOM_STAFF_ROLES = [...HOMEROOM_ELIGIBLE_PROFILE_ROLES];

export const ClassroomFormDialog = ({ open, onOpenChange, courses, years, classroom, onSaved }: Props) => {
  const { t, i18n } = useTranslation("pages");
  const { selectedYearId } = useAcademicYear();
  const isEdit = !!classroom;
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [period, setPeriod] = useState<string>("");
  const [courseId, setCourseId] = useState<string>("");
  const [yearId, setYearId] = useState<string>("");
  const [homeroomTeacherId, setHomeroomTeacherId] = useState<string>(NONE_HOMEROOM);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffOptions, setStaffOptions] = useState<{ id: string; full_name: string }[]>([]);

  const periodOptions = useMemo(
    () => PERIOD_DB_VALUES.map((value) => ({ value, label: t(`turmas.period.${value}`) })),
    [t],
  );

  useEffect(() => {
    if (open) {
      if (classroom) {
        setName(classroom.name ?? "");
        setGradeLevel(classroom.grade_level ?? "");
        setPeriod(classroom.period ?? "");
        setCourseId(classroom.course_id ?? "");
        setYearId(classroom.academic_year_id ?? "");
        setHomeroomTeacherId(classroom.homeroom_teacher_id ?? NONE_HOMEROOM);
      } else {
        const activeYear = years.find((y) => y.is_active);
        setName(""); setGradeLevel(""); setPeriod(""); setCourseId(""); setYearId(selectedYearId ?? activeYear?.id ?? "");
        setHomeroomTeacherId(NONE_HOMEROOM);
      }
    }
  }, [open, classroom, years, selectedYearId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setStaffLoading(true);
      try {
        let schoolId = classroom?.school_id ?? null;
        if (!schoolId) {
          const { data: userRes } = await supabase.auth.getUser();
          const uid = userRes.user?.id;
          if (!uid) {
            setStaffOptions([]);
            return;
          }
          const { data: profile } = await supabase.from("profiles").select("school_id").eq("id", uid).maybeSingle();
          schoolId = profile?.school_id ?? null;
        }
        if (!schoolId) {
          setStaffOptions([]);
          return;
        }
        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name")
          .eq("school_id", schoolId)
          .in("role", [...HOMEROOM_STAFF_ROLES])
          .order("full_name", { ascending: true });
        if (cancelled) return;
        if (error) throw error;
        const unnamed = t("turmas.form.unnamed_staff");
        let rows = (data ?? []).map((p) => ({ id: p.id, full_name: p.full_name?.trim() || unnamed }));
        const hid = classroom?.homeroom_teacher_id;
        const sortLocale = intlLocaleTagFromLng(i18n.language);
        if (hid && !rows.some((r) => r.id === hid)) {
          const { data: extra } = await supabase
            .from("profiles")
            .select("id, full_name")
            .eq("id", hid)
            .maybeSingle();
          if (cancelled) return;
          if (extra) {
            rows = [...rows, { id: extra.id, full_name: extra.full_name?.trim() || unnamed }];
          }
        }
        rows.sort((a, b) => a.full_name.localeCompare(b.full_name, sortLocale));
        if (cancelled) return;
        setStaffOptions(rows);
      } catch {
        if (!cancelled) setStaffOptions([]);
      } finally {
        if (!cancelled) setStaffLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, classroom?.school_id, classroom?.homeroom_teacher_id, t, i18n.language]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({ title: t("turmas.form.toast_name_required"), variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      if (isEdit && classroom) {
        const { error } = await supabase.from("classrooms").update({
          name: name.trim(),
          grade_level: gradeLevel || null,
          period: period || null,
          course_id: courseId || null,
          academic_year_id: yearId || null,
          homeroom_teacher_id: homeroomTeacherId === NONE_HOMEROOM ? null : homeroomTeacherId,
        }).eq("id", classroom.id);
        if (error) throw error;
        toast({ title: t("turmas.form.toast_updated") });
      } else {
        const { data: userRes } = await supabase.auth.getUser();
        const { data: profile } = await supabase
          .from("profiles").select("school_id").eq("id", userRes.user?.id ?? "").maybeSingle();
        const schoolId = profile?.school_id;
        if (!schoolId) throw new Error(t("turmas.form.toast_school_missing"));

        const { error } = await supabase.from("classrooms").insert({
          name: name.trim(),
          grade_level: gradeLevel || null,
          period: period || null,
          course_id: courseId || null,
          academic_year_id: yearId || null,
          school_id: schoolId,
          homeroom_teacher_id: homeroomTeacherId === NONE_HOMEROOM ? null : homeroomTeacherId,
        });
        if (error) throw error;
        toast({ title: t("turmas.form.toast_created") });
      }
      onSaved();
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: t("turmas.form.toast_generic_error"), description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const homeroomPlaceholder = staffLoading
    ? t("turmas.form.staff_loading")
    : staffOptions.length === 0
      ? t("turmas.form.staff_empty_hint")
      : t("matriculas.form.select_placeholder");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("turmas.form.title_edit") : t("turmas.form.title_create")}</DialogTitle>
          <DialogDescription>
            {isEdit ? t("turmas.form.desc_edit") : t("turmas.form.desc_create")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="tn">{t("turmas.form.name_label")}</Label>
            <Input id="tn" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("turmas.form.name_placeholder")} />
          </div>
          <div>
            <Label htmlFor="gl">{t("turmas.form.grade_label")}</Label>
            <Select value={gradeLevel} onValueChange={setGradeLevel}>
              <SelectTrigger id="gl"><SelectValue placeholder={t("turmas.form.grade_placeholder")} /></SelectTrigger>
              <SelectContent>
                {GRADE_LEVELS.map((g) => (
                  <SelectItem key={g} value={g}>{t(`turmas.grade_levels.${g}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("turmas.form.period_label")}</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger><SelectValue placeholder={t("turmas.form.period_placeholder")} /></SelectTrigger>
              <SelectContent>
                {periodOptions.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>{t("turmas.form.course_label")}</Label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger><SelectValue placeholder={t("turmas.form.course_placeholder")} /></SelectTrigger>
              <SelectContent>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>{t("turmas.form.year_label")}</Label>
            <Select value={yearId} onValueChange={setYearId}>
              <SelectTrigger><SelectValue placeholder={t("turmas.form.year_placeholder")} /></SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.label}{y.is_active ? ` ${t("turmas.form.year_active_suffix")}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>{t("turmas.form.homeroom_label")}</Label>
            <Select
              value={homeroomTeacherId === NONE_HOMEROOM || staffOptions.some((s) => s.id === homeroomTeacherId) ? homeroomTeacherId : NONE_HOMEROOM}
              onValueChange={setHomeroomTeacherId}
              disabled={staffLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder={homeroomPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_HOMEROOM}>{t("turmas.form.homeroom_none")}</SelectItem>
                {staffOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>{t("shared.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? t("shared.save") : t("turmas.form.submit_create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
