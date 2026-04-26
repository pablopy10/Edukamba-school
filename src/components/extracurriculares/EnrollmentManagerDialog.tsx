import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Users, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ActivityRow } from "./ActivityFormDialog";

type Student = { id: string; full_name: string; classroom_id: string | null; classroom?: { name: string | null } | null };
type Enrollment = { id: string; student_id: string; status: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity: ActivityRow | null;
  schoolId: string | null;
  canEdit: boolean;
};

export function EnrollmentManagerDialog({ open, onOpenChange, activity, schoolId, canEdit }: Props) {
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [search, setSearch] = useState("");
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const load = async () => {
    if (!activity || !schoolId) return;
    setLoading(true);
    const [{ data: studs }, { data: enrolls }] = await Promise.all([
      supabase
        .from("students")
        .select("id, full_name, classroom_id, classroom:classrooms(name)")
        .eq("school_id", schoolId)
        .order("full_name"),
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
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activity?.id]);

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
        toast.error("Capacidade máxima atingida.");
        setWorking(false);
        return;
      }
      const existing = enrolledMap.get(studentId);
      if (existing) {
        const { error } = await supabase
          .from("extracurricular_enrollments")
          .update({ status: "ativa" })
          .eq("id", existing.id);
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
        const { error } = await supabase
          .from("extracurricular_enrollments")
          .delete()
          .eq("id", existing.id);
        if (error) toast.error(error.message);
      }
    }
    await load();
    setWorking(false);
  };

  const generateAllFees = async () => {
    if (!activity) return;
    if (!activity.enrollment_fee || activity.enrollment_fee <= 0) {
      toast.error("Defina um valor de inscrição na atividade primeiro.");
      return;
    }
    const active = enrollments.filter((e) => e.status === "ativa");
    if (active.length === 0) {
      toast.error("Não há inscrições ativas.");
      return;
    }
    setWorking(true);
    let total = 0;
    for (const e of active) {
      const { data, error } = await supabase.rpc("generate_activity_fees", { _enrollment_id: e.id });
      if (!error) total += (data as number) ?? 0;
    }
    setWorking(false);
    toast.success(`${total} propina(s) geradas.`);
  };

  const generateForOne = async (enrollmentId: string) => {
    if (!activity?.enrollment_fee || activity.enrollment_fee <= 0) {
      toast.error("Defina um valor de inscrição na atividade primeiro.");
      return;
    }
    setGeneratingId(enrollmentId);
    const { data, error } = await supabase.rpc("generate_activity_fees", { _enrollment_id: enrollmentId });
    setGeneratingId(null);
    if (error) toast.error(error.message);
    else toast.success(`${(data as number) ?? 0} propina(s) geradas.`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Inscrições — {activity?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3 py-2">
          <div className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{activeCount}</span>
            {capacity > 0 && <> / {capacity}</>} alunos inscritos
            {activity?.enrollment_fee && activity.enrollment_fee > 0 ? (
              <>
                <span className="mx-2">•</span>
                Valor: <span className="font-semibold text-foreground">{Number(activity.enrollment_fee).toLocaleString("pt-PT")} Kz</span>
                {activity.billing_frequency === "mensal" && <span className="ml-1 text-xs">(mensal)</span>}
              </>
            ) : (
              <>
                <span className="mx-2">•</span>
                <span className="text-xs">Atividade gratuita</span>
              </>
            )}
          </div>
          {canEdit && activity?.enrollment_fee && activity.enrollment_fee > 0 && (
            <Button size="sm" onClick={generateAllFees} disabled={working}>
              <Sparkles className="h-4 w-4 mr-1" />
              Gerar propinas
            </Button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Pesquisar aluno..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex-1 overflow-y-auto rounded-lg border border-border">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">A carregar...</div>
          ) : filteredStudents.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhum aluno encontrado.</div>
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
                    <label className="flex items-center gap-3 flex-1 cursor-pointer">
                      <Checkbox
                        checked={isEnrolled}
                        disabled={!canEdit || working}
                        onCheckedChange={(c) => toggleEnrollment(s.id, !!c)}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{s.full_name}</p>
                        {s.classroom?.name && (
                          <p className="text-xs text-muted-foreground">{s.classroom.name}</p>
                        )}
                      </div>
                    </label>
                    {isEnrolled && enrollment && canEdit && activity?.enrollment_fee && activity.enrollment_fee > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => generateForOne(enrollment.id)}
                        disabled={generatingId === enrollment.id}
                      >
                        <Sparkles className="h-3.5 w-3.5 mr-1" />
                        {generatingId === enrollment.id ? "..." : "Gerar"}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}