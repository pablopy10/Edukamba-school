import { useEffect, useState } from "react";
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

const PERIODS = [
  { value: "Manhã", label: "Manhã" },
  { value: "Tarde", label: "Tarde" },
  { value: "Noite", label: "Noite" },
];

const NONE_HOMEROOM = "__none__";

/** Perfis elegíveis como diretor de turma (não inclui alunos nem encargados). */
const HOMEROOM_STAFF_ROLES = [...HOMEROOM_ELIGIBLE_PROFILE_ROLES];

export const ClassroomFormDialog = ({ open, onOpenChange, courses, years, classroom, onSaved }: Props) => {
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
        let rows = (data ?? []).map((p) => ({ id: p.id, full_name: p.full_name?.trim() || "Sem nome" }));
        const hid = classroom?.homeroom_teacher_id;
        if (hid && !rows.some((r) => r.id === hid)) {
          const { data: extra } = await supabase
            .from("profiles")
            .select("id, full_name")
            .eq("id", hid)
            .maybeSingle();
          if (cancelled) return;
          if (extra) {
            rows = [
              ...rows,
              { id: extra.id, full_name: extra.full_name?.trim() || "Sem nome" },
            ].sort((a, b) => a.full_name.localeCompare(b.full_name, "pt"));
          }
        }
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
  }, [open, classroom?.school_id, classroom?.homeroom_teacher_id]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
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
        toast({ title: "Turma actualizada" });
      } else {
        const { data: userRes } = await supabase.auth.getUser();
        const { data: profile } = await supabase
          .from("profiles").select("school_id").eq("id", userRes.user?.id ?? "").maybeSingle();
        const schoolId = profile?.school_id;
        if (!schoolId) throw new Error("Escola não encontrada para o utilizador.");

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
        toast({ title: "Turma criada" });
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
          <DialogTitle>{isEdit ? "Editar Turma" : "Nova Turma"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Actualize os dados da turma." : "Adicione uma nova turma à escola."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="tn">Nome da turma</Label>
            <Input id="tn" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: 9º B" />
          </div>
          <div>
            <Label htmlFor="gl">Ano de escolaridade</Label>
            <Select value={gradeLevel} onValueChange={setGradeLevel}>
              <SelectTrigger id="gl"><SelectValue placeholder="Seleccionar nível..." /></SelectTrigger>
              <SelectContent>
                {GRADE_LEVELS.map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Período</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Curso</Label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar curso..." /></SelectTrigger>
              <SelectContent>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
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
          <div className="sm:col-span-2">
            <Label>Diretor de turma</Label>
            <Select
              value={homeroomTeacherId === NONE_HOMEROOM || staffOptions.some((s) => s.id === homeroomTeacherId) ? homeroomTeacherId : NONE_HOMEROOM}
              onValueChange={setHomeroomTeacherId}
              disabled={staffLoading}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={staffLoading ? "A carregar..." : staffOptions.length === 0 ? "Adicione funcionários (admin/professor)" : "Seleccionar..."}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_HOMEROOM}>Nenhum</SelectItem>
                {staffOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Guardar" : "Criar turma"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};