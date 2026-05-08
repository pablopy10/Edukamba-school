import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { ACADEMIC_DEGREE_OPTIONS } from "@/lib/teacherAcademic";

export type TeacherRow = {
  id: string;
  profile_id: string | null;
  subject_id: string | null;
  hire_date: string | null;
  employee_id: string | null;
  avatar_color: string | null;
  education_institution: string | null;
  academic_degree: string | null;
  field_of_study: string | null;
  birth_date: string | null;
  profiles: { full_name: string; phone: string | null } | null;
  /** Só modo educador: professor é diretor de turma do(s) turma(s) do educando. */
  isHomeroomDirector?: boolean;
  /** Diretor só em perfil (sem linha teachers), lista sintética. */
  isSyntheticParentRow?: boolean;
};

type SubjectOpt = { id: string; name: string };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subjects: SubjectOpt[];
  teacher?: TeacherRow | null; // edit mode if provided
  onSaved: () => void;
}

const COLORS = ["blue", "pink", "green", "yellow", "lilac"];

export const TeacherFormDialog = ({ open, onOpenChange, subjects, teacher, onSaved }: Props) => {
  const isEdit = !!teacher;
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subjectId, setSubjectId] = useState<string>("");
  const [employeeId, setEmployeeId] = useState("");
  const [hireDate, setHireDate] = useState("");
  const [educationInstitution, setEducationInstitution] = useState("");
  const [academicDegree, setAcademicDegree] = useState<string>("__none__");
  const [fieldOfStudy, setFieldOfStudy] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [avatarColor, setAvatarColor] = useState("blue");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (open) {
      if (teacher) {
        setFullName(teacher.profiles?.full_name ?? "");
        setPhone(teacher.profiles?.phone ?? "");
        setSubjectId(teacher.subject_id ?? "");
        setEmployeeId(teacher.employee_id ?? "");
        setHireDate(teacher.hire_date ?? "");
        setEducationInstitution(teacher.education_institution ?? "");
        setAcademicDegree(teacher.academic_degree?.trim() ? teacher.academic_degree! : "__none__");
        setFieldOfStudy(teacher.field_of_study ?? "");
        setBirthDate(teacher.birth_date ?? "");
        setAvatarColor(teacher.avatar_color ?? "blue");
      } else {
        setFullName(""); setEmail(""); setPhone(""); setSubjectId("");
        setEmployeeId(""); setHireDate(""); setAvatarColor("blue");
        setEducationInstitution(""); setAcademicDegree("__none__"); setFieldOfStudy(""); setBirthDate("");
        setPassword("");
      }
    }
  }, [open, teacher]);

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      if (isEdit && teacher) {
        const { error: tErr } = await supabase.from("teachers").update({
          subject_id: subjectId || null,
          employee_id: employeeId || null,
          hire_date: hireDate || null,
          avatar_color: avatarColor,
          education_institution: educationInstitution.trim() || null,
          academic_degree: academicDegree === "__none__" ? null : academicDegree,
          field_of_study: fieldOfStudy.trim() || null,
          birth_date: birthDate || null,
        }).eq("id", teacher.id);
        if (tErr) throw tErr;

        if (teacher.profile_id) {
          const { error: pErr } = await supabase.from("profiles").update({
            full_name: fullName.trim(),
            phone: phone || null,
          }).eq("id", teacher.profile_id);
          if (pErr) throw pErr;
        }
        toast({ title: "Professor actualizado" });
      } else {
        if (!email.trim()) {
          toast({ title: "Email obrigatório", variant: "destructive" });
          setLoading(false); return;
        }
        if (password.length < 6) {
          toast({ title: "Password deve ter pelo menos 6 caracteres", variant: "destructive" });
          setLoading(false); return;
        }
        const { data, error } = await supabase.functions.invoke("invite-teacher", {
          body: {
            full_name: fullName.trim(),
            email: email.trim(),
            phone: phone || null,
            subject_id: subjectId || null,
            employee_id: employeeId || null,
            hire_date: hireDate || null,
            avatar_color: avatarColor,
            password,
          },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        toast({
          title: "Professor criado",
          description: `Credenciais enviadas por email para ${email.trim()}.`,
        });
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
          <DialogTitle>{isEdit ? "Editar Professor" : "Novo Professor"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Actualize os dados do professor." : "Preencha os dados e escolha como criar a conta."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="fn">Nome completo</Label>
            <Input id="fn" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ex.: Carla Mendes" />
          </div>
          {!isEdit && (
            <div className="sm:col-span-2">
              <Label htmlFor="em">Email</Label>
              <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="professor@escola.edu" />
            </div>
          )}
          <div>
            <Label htmlFor="ph">Telefone</Label>
            <Input id="ph" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(244) 924 ..." />
          </div>
          <div>
            <Label htmlFor="emp">Nº Funcionário</Label>
            <Input id="emp" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="PROF-2024-001" />
          </div>
          <div>
            <Label>Disciplina</Label>
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="hd">Data de admissão</Label>
            <Input id="hd" type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="edu-inst">Onde estudou (instituição)</Label>
            <Input
              id="edu-inst"
              value={educationInstitution}
              onChange={(e) => setEducationInstitution(e.target.value)}
              placeholder="Escola, faculdade ou universidade"
            />
          </div>
          <div>
            <Label>Grau académico</Label>
            <Select value={academicDegree} onValueChange={setAcademicDegree}>
              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem informação</SelectItem>
                {ACADEMIC_DEGREE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="field-study">Área de estudo</Label>
            <Input id="field-study" value={fieldOfStudy} onChange={(e) => setFieldOfStudy(e.target.value)} placeholder="Ex.: Matemática" />
          </div>
          <div>
            <Label htmlFor="bd">Data de nascimento</Label>
            <Input id="bd" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Cor do avatar</Label>
            <div className="mt-2 flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAvatarColor(c)}
                  className={`h-8 w-8 rounded-full bg-pastel-${c} ring-offset-2 transition ${avatarColor === c ? "ring-2 ring-foreground" : ""}`}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          {!isEdit && (
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="pw">Password inicial *</Label>
              <Input id="pw" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
              <p className="text-xs text-muted-foreground">O professor receberá um email com as credenciais de acesso.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Guardar" : "Criar professor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};