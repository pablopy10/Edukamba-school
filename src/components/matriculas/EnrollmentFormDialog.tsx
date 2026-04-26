import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export type EnrollmentRow = {
  id: string;
  student_id: string | null;
  classroom_id: string | null;
  academic_year_id: string | null;
  status: string | null;
  enrolled_at: string | null;
  students?: { id: string; full_name: string; email: string | null; avatar_color: string | null } | null;
  classrooms?: { id: string; name: string } | null;
  academic_years?: { id: string; label: string } | null;
};

type Opt = { id: string; name: string };
type YearOpt = { id: string; label: string; is_active?: boolean | null };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  students: Opt[];
  classrooms: Opt[];
  years: YearOpt[];
  enrollment?: EnrollmentRow | null;
  onSaved: () => void;
}

const STATUSES = ["ACTIVE", "PENDING", "CANCELLED"];

export const EnrollmentFormDialog = ({ open, onOpenChange, students, classrooms, years, enrollment, onSaved }: Props) => {
  const isEdit = !!enrollment;
  const [loading, setLoading] = useState(false);
  const [studentId, setStudentId] = useState<string>("");
  const [classroomId, setClassroomId] = useState<string>("");
  const [yearId, setYearId] = useState<string>("");
  const [status, setStatus] = useState<string>("ACTIVE");

  useEffect(() => {
    if (open) {
      if (enrollment) {
        setStudentId(enrollment.student_id ?? "");
        setClassroomId(enrollment.classroom_id ?? "");
        setYearId(enrollment.academic_year_id ?? "");
        setStatus(enrollment.status ?? "ACTIVE");
      } else {
        const activeYear = years.find((y) => y.is_active);
        setStudentId(""); setClassroomId(""); setYearId(activeYear?.id ?? ""); setStatus("ACTIVE");
      }
    }
  }, [open, enrollment, years]);

  const handleSubmit = async () => {
    if (!studentId) { toast({ title: "Aluno obrigatório", variant: "destructive" }); return; }
    if (!classroomId) { toast({ title: "Turma obrigatória", variant: "destructive" }); return; }
    setLoading(true);
    try {
      if (isEdit && enrollment) {
        const { error } = await supabase.from("enrollments").update({
          student_id: studentId,
          classroom_id: classroomId,
          academic_year_id: yearId || null,
          status,
        }).eq("id", enrollment.id);
        if (error) throw error;
        toast({ title: "Matrícula actualizada" });
      } else {
        const { error } = await supabase.from("enrollments").insert({
          student_id: studentId,
          classroom_id: classroomId,
          academic_year_id: yearId || null,
          status,
        });
        if (error) throw error;
        toast({ title: "Matrícula criada" });
      }
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Matrícula" : "Nova Matrícula"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Actualize os dados da matrícula." : "Matricule um aluno numa turma."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label>Aluno</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar aluno..." /></SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Turma</Label>
            <Select value={classroomId} onValueChange={setClassroomId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar turma..." /></SelectTrigger>
              <SelectContent>
                {classrooms.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ano lectivo</Label>
            <Select value={yearId} onValueChange={setYearId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar ano..." /></SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.id}>{y.label}{y.is_active ? " (activo)" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Estado</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Guardar" : "Criar matrícula"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};