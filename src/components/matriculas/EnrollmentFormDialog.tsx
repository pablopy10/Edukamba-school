import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

const STATUSES: { value: string; label: string }[] = [
  { value: "ACTIVE", label: "Confirmada" },
  { value: "PENDING", label: "Pendente" },
  { value: "CANCELLED", label: "Cancelada" },
];

export const EnrollmentFormDialog = ({ open, onOpenChange, students, classrooms, years, enrollment, onSaved }: Props) => {
  const isEdit = !!enrollment;
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"new" | "renew">("renew");
  // shared (renew + edit)
  const [studentId, setStudentId] = useState<string>("");
  const [classroomId, setClassroomId] = useState<string>("");
  const [yearId, setYearId] = useState<string>("");
  const [status, setStatus] = useState<string>("ACTIVE");
  // new student fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<string>("");
  const [enrollmentNumber, setEnrollmentNumber] = useState("");

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
        setTab("renew");
        setFullName(""); setEmail(""); setPhone(""); setBirthDate(""); setGender(""); setEnrollmentNumber("");
      }
    }
  }, [open, enrollment, years]);

  const handleSubmit = async () => {
    if (!classroomId) { toast({ title: "Turma obrigatória", variant: "destructive" }); return; }
    setLoading(true);
    try {
      if (isEdit && enrollment) {
        if (!studentId) { toast({ title: "Aluno obrigatório", variant: "destructive" }); setLoading(false); return; }
        const { error } = await supabase.from("enrollments").update({
          student_id: studentId,
          classroom_id: classroomId,
          academic_year_id: yearId || null,
          status,
        }).eq("id", enrollment.id);
        if (error) throw error;
        toast({ title: "Matrícula actualizada" });
      } else if (tab === "new") {
        if (!fullName.trim()) { toast({ title: "Nome do aluno obrigatório", variant: "destructive" }); setLoading(false); return; }
        // Need school_id for student creation
        const { data: userRes } = await supabase.auth.getUser();
        const { data: profile } = await supabase
          .from("profiles").select("school_id").eq("id", userRes.user?.id ?? "").maybeSingle();
        const schoolId = profile?.school_id;
        if (!schoolId) throw new Error("Escola não encontrada para o utilizador.");

        const { data: created, error: sErr } = await supabase.from("students").insert({
          full_name: fullName.trim(),
          email: email || null,
          phone: phone || null,
          birth_date: birthDate || null,
          gender: gender || null,
          enrollment_number: enrollmentNumber || null,
          classroom_id: classroomId,
          school_id: schoolId,
        }).select("id").single();
        if (sErr) throw sErr;

        const { error: eErr } = await supabase.from("enrollments").insert({
          student_id: created.id,
          classroom_id: classroomId,
          academic_year_id: yearId || null,
          status,
        });
        if (eErr) throw eErr;
        toast({ title: "Aluno e matrícula criados" });
      } else {
        if (!studentId) { toast({ title: "Seleccione o aluno", variant: "destructive" }); setLoading(false); return; }
        const { error } = await supabase.from("enrollments").insert({
          student_id: studentId,
          classroom_id: classroomId,
          academic_year_id: yearId || null,
          status,
        });
        if (error) throw error;
        toast({ title: "Matrícula renovada" });
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
            {isEdit ? "Actualize os dados da matrícula." : "Crie um novo aluno ou renove uma matrícula existente."}
          </DialogDescription>
        </DialogHeader>

        {!isEdit && (
          <Tabs value={tab} onValueChange={(v) => setTab(v as "new" | "renew")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="new">Nova</TabsTrigger>
              <TabsTrigger value="renew">Renovação</TabsTrigger>
            </TabsList>

            <TabsContent value="new" className="mt-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="fn">Nome completo</Label>
                  <Input id="fn" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ex.: Sara Miller" />
                </div>
                <div>
                  <Label htmlFor="em">Email</Label>
                  <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="aluno@escola.edu" />
                </div>
                <div>
                  <Label htmlFor="ph">Telefone</Label>
                  <Input id="ph" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(244) 924 ..." />
                </div>
                <div>
                  <Label htmlFor="en">Nº Matrícula</Label>
                  <Input id="en" value={enrollmentNumber} onChange={(e) => setEnrollmentNumber(e.target.value)} placeholder="2024-01-001" />
                </div>
                <div>
                  <Label htmlFor="bd">Data de nascimento</Label>
                  <Input id="bd" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Género</Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">Masculino</SelectItem>
                      <SelectItem value="F">Feminino</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="renew" className="mt-4">
              <div>
                <Label>Aluno existente</Label>
                <Select value={studentId} onValueChange={setStudentId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar aluno..." /></SelectTrigger>
                  <SelectContent>
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
          </Tabs>
        )}

        {isEdit && (
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
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
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
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Guardar" : (tab === "new" ? "Criar aluno e matrícula" : "Renovar matrícula")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};