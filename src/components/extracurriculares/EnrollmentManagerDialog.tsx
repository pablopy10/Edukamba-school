import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Users, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ActivityRow } from "./ActivityFormDialog";
import { useTranslation } from "react-i18next";

function intlLocaleForI18nLang(lang: string) {
  if (lang === "en") return "en-GB";
  if (lang === "fr") return "fr-FR";
  return "pt-PT";
}

type Student = { id: string; full_name: string; classroom_id: string | null; classroom?: { name: string | null } | null };
type Enrollment = { id: string; student_id: string; status: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity: ActivityRow | null;
  schoolId: string | null;
  canEdit: boolean;
  isParent?: boolean;
  childIds?: string[];
  /** Quando definido (ex.: diretor de turma), restringe alunos a esta lista. */
  restrictStudentIds?: string[];
};

export function EnrollmentManagerDialog({
  open,
  onOpenChange,
  activity,
  schoolId,
  canEdit,
  isParent,
  childIds,
  restrictStudentIds,
}: Props) {
  const { t, i18n } = useTranslation("pages", { keyPrefix: "extracurriculares" });
  const localeTag = intlLocaleForI18nLang(i18n.language ?? "pt");

  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [search, setSearch] = useState("");
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const load = async () => {
    if (!activity || !schoolId) return;
    setLoading(true);
    let studentsQuery = supabase
      .from("students")
      .select("id, full_name, classroom_id, classroom:classrooms(name)")
      .eq("school_id", schoolId)
      .order("full_name");

    if (restrictStudentIds !== undefined) {
      if (restrictStudentIds.length === 0) {
        setStudents([]);
        setEnrollments([]);
        setLoading(false);
        return;
      }
      studentsQuery = studentsQuery.in("id", restrictStudentIds);
    } else if (isParent) {
      if (!childIds || childIds.length === 0) {
        setStudents([]);
        setEnrollments([]);
        setLoading(false);
        return;
      }
      studentsQuery = studentsQuery.in("id", childIds);
    }

    const [{ data: studs }, { data: enrolls }] = await Promise.all([
      studentsQuery,
      supabase
        .from("extracurricular_enrollments")
        .select("id, student_id, status")
        .eq("activity_id", activity.id),
    ]);
    setStudents((studs ?? []) as Student[]);
    setEnrollments((enrolls ?? []) as Enrollment[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activity?.id, restrictStudentIds?.join(","), isParent, childIds?.join(",")]);

  const enrolledMap = useMemo(() => {
    const m = new Map<string, Enrollment>();
    enrollments.forEach((e) => m.set(e.student_id, e));
    return m;
  }, [enrollments]);

  const activeCount = enrollments.filter((e) => e.status === "ativa").length;
  const capacity = activity?.capacity ?? 0;

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.full_name.toLowerCase().includes(q));
  }, [students, search]);

  const toggleEnrollment = async (studentId: string, checked: boolean) => {
    if (!activity || !schoolId) return;
    setWorking(true);
    if (checked) {
      if (capacity > 0 && activeCount >= capacity) {
        toast.error(t("enrollment_dialog.toast_capacity_full"));
        setWorking(false);
        return;
      }
      const existing = enrolledMap.get(studentId);
      if (existing) {
        const { error } = await supabase.from("extracurricular_enrollments").update({ status: "ativa" }).eq("id", existing.id);
        if (error) toast.error(error.message);
      } else {
        const { error } = await supabase.from("extracurricular_enrollments").insert({
          activity_id: activity.id,
          student_id: studentId,
          school_id: schoolId,
          status: "ativa",
        });
        if (error) toast.error(error.message);
      }
    } else {
      const existing = enrolledMap.get(studentId);
      if (existing) {
        const { error } = await supabase.from("extracurricular_enrollments").delete().eq("id", existing.id);
        if (error) toast.error(error.message);
      }
    }
    await load();
    setWorking(false);
  };

  const generateAllFees = async () => {
    if (!activity) return;
    if (!activity.enrollment_fee || activity.enrollment_fee <= 0) {
      toast.error(t("enrollment_dialog.toast_set_fee_first"));
      return;
    }
    const active = enrollments.filter((e) => e.status === "ativa");
    if (active.length === 0) {
      toast.error(t("enrollment_dialog.toast_no_active"));
      return;
    }
    setWorking(true);
    let total = 0;
    for (const e of active) {
      const { data, error } = await supabase.rpc("generate_activity_fees", { _enrollment_id: e.id });
      if (!error) total += (data as number) ?? 0;
    }
    setWorking(false);
    toast.success(t("enrollment_dialog.toast_fees_generated", { count: total }));
  };

  const generateForOne = async (enrollmentId: string) => {
    if (!activity?.enrollment_fee || activity.enrollment_fee <= 0) {
      toast.error(t("enrollment_dialog.toast_set_fee_first"));
      return;
    }
    setGeneratingId(enrollmentId);
    const { data, error } = await supabase.rpc("generate_activity_fees", { _enrollment_id: enrollmentId });
    setGeneratingId(null);
    if (error) toast.error(error.message);
    else toast.success(t("enrollment_dialog.toast_fees_generated", { count: (data as number) ?? 0 }));
  };

  const feeFormatted =
    activity?.enrollment_fee && activity.enrollment_fee > 0
      ? Number(activity.enrollment_fee).toLocaleString(localeTag)
      : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t("enrollment_dialog.title", { name: activity?.name ?? "" })}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3 py-2">
          <div className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{activeCount}</span>
            {capacity > 0 && <> / {capacity}</>} {t("enrollment_dialog.enrolled_suffix")}
            {activity?.enrollment_fee && activity.enrollment_fee > 0 ? (
              <>
                <span className="mx-2">•</span>
                {t("enrollment_dialog.fee_label")}{" "}
                <span className="font-semibold text-foreground">
                  {feeFormatted} Kz
                </span>
                {activity.billing_frequency === "mensal" && <span className="ml-1 text-xs">{t("enrollment_dialog.monthly_abbr")}</span>}
              </>
            ) : (
              <>
                <span className="mx-2">•</span>
                <span className="text-xs">{t("enrollment_dialog.free_activity")}</span>
              </>
            )}
          </div>
          {canEdit && activity?.enrollment_fee && activity.enrollment_fee > 0 && (
            <Button size="sm" onClick={() => void generateAllFees()} disabled={working}>
              <Sparkles className="h-4 w-4 mr-1" />
              {t("enrollment_dialog.generate_charges")}
            </Button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("enrollment_dialog.search_student")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex-1 overflow-y-auto rounded-lg border border-border">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">{t("enrollment_dialog.loading")}</div>
          ) : filteredStudents.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">{t("enrollment_dialog.empty_students")}</div>
          ) : (
            <ul className="divide-y divide-border">
              {filteredStudents.map((s) => {
                const enrollment = enrolledMap.get(s.id);
                const isEnrolled = enrollment?.status === "ativa";
                return (
                  <li
                    key={s.id}
                    className={cn(
                      "flex items-center justify-between gap-3 px-3 py-2.5 transition-colors",
                      isEnrolled && "bg-accent/40",
                    )}
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{s.full_name}</p>
                      {s.classroom?.name && <p className="text-xs text-muted-foreground">{s.classroom.name}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {isEnrolled && enrollment && canEdit && activity?.enrollment_fee && activity.enrollment_fee > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void generateForOne(enrollment.id)}
                          disabled={generatingId === enrollment.id}
                        >
                          <Sparkles className="h-3.5 w-3.5 mr-1" />
                          {generatingId === enrollment.id ? "..." : t("enrollment_dialog.generate_one")}
                        </Button>
                      )}
                      {(canEdit || isParent) && (
                        <Button
                          size="sm"
                          variant={isEnrolled ? "secondary" : "default"}
                          disabled={working}
                          onClick={() => void toggleEnrollment(s.id, !isEnrolled)}
                          className={cn(
                            "min-w-[90px]",
                            isEnrolled && "bg-green-100 text-green-700 hover:bg-green-200",
                          )}
                        >
                          {isEnrolled ? t("enrollment_dialog.enrolled_btn") : t("enrollment_dialog.enroll_btn")}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("enrollment_dialog.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
