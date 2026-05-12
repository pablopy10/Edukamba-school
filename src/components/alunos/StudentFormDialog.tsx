import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { sortByName } from "@/lib/utils";
import { invokeAdminUpdateUserEmail } from "@/lib/admin/invokeAdminUpdateUserEmail";

export type StudentRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  gender: string | null;
  enrollment_number: string | null;
  classroom_id: string | null;
  avatar_color: string | null;
  school_id: string | null;
  /** Conta Edukamba do aluno (Auth), quando existe. */
  user_id?: string | null;
  classrooms?: {
    id: string;
    name: string;
    homeroom_teacher?: { full_name: string | null } | null;
  } | null;
};

type ClassroomOpt = { id: string; name: string };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  classrooms: ClassroomOpt[];
  student?: StudentRow | null;
  onSaved: () => void;
}

const COLORS = ["blue", "pink", "green", "yellow", "lilac"];

export const StudentFormDialog = ({ open, onOpenChange, classrooms, student, onSaved }: Props) => {
  const isEdit = !!student;
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<string>("");
  const [enrollmentNumber, setEnrollmentNumber] = useState("");
  const [classroomId, setClassroomId] = useState<string>("");
  const [avatarColor, setAvatarColor] = useState("blue");

  useEffect(() => {
    if (open) {
      if (student) {
        setFullName(student.full_name ?? "");
        setEmail(student.email ?? "");
        setPhone(student.phone ?? "");
        setBirthDate(student.birth_date ?? "");
        setGender(student.gender ?? "");
        setEnrollmentNumber(student.enrollment_number ?? "");
        setClassroomId(student.classroom_id ?? "");
        setAvatarColor(student.avatar_color ?? "blue");
      } else {
        setFullName(""); setEmail(""); setPhone(""); setBirthDate("");
        setGender(""); setEnrollmentNumber(""); setClassroomId(""); setAvatarColor("blue");
      }
    }
  }, [open, student]);

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      if (isEdit && student) {
        const nextMailTrim = email.trim().toLowerCase();
        const prevMail = (student.email ?? "").trim().toLowerCase();
        if (student.user_id) {
          if (!nextMailTrim) {
            toast({ title: "Email obrigatório", description: "Alunos com conta na plataforma precisam de email para iniciar sessão.", variant: "destructive" });
            setLoading(false);
            return;
          }
          if (nextMailTrim !== prevMail) {
            const fx = await invokeAdminUpdateUserEmail(student.user_id, nextMailTrim);
            if (!fx.ok) {
              toast({ title: "Erro ao actualizar email de login", description: fx.message, variant: "destructive" });
              setLoading(false);
              return;
            }
          }
        }
        const { error } = await supabase.from("students").update({
          full_name: fullName.trim(),
          email: email || null,
          phone: phone || null,
          birth_date: birthDate || null,
          gender: gender || null,
          enrollment_number: enrollmentNumber || null,
          classroom_id: classroomId || null,
          avatar_color: avatarColor,
        }).eq("id", student.id);
        if (error) throw error;
        toast({ title: "Aluno actualizado" });
      } else {
        const { data: profile } = await supabase
          .from("profiles")
          .select("school_id")
          .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
          .maybeSingle();
        const schoolId = profile?.school_id;
        if (!schoolId) throw new Error("Escola não encontrada para o utilizador.");
        const { error } = await supabase.from("students").insert({
          full_name: fullName.trim(),
          email: email || null,
          phone: phone || null,
          birth_date: birthDate || null,
          gender: gender || null,
          enrollment_number: enrollmentNumber || null,
          classroom_id: classroomId || null,
          avatar_color: avatarColor,
          school_id: schoolId,
        });
        if (error) throw error;
        toast({ title: "Aluno criado" });
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
          <DialogTitle>{isEdit ? "Editar Aluno" : "Novo Aluno"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Actualize os dados do aluno." : "Preencha os dados do novo aluno."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="fn">Nome completo</Label>
            <Input id="fn" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ex.: Sara Miller" />
          </div>
          <div>
            <Label htmlFor="em">Email {student?.user_id ? "(início de sessão quando tem conta)" : ""}</Label>
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
          <div>
            <Label>Género</Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="M">Masculino</SelectItem>
                <SelectItem value="F">Feminino</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Turma</Label>
            <Select value={classroomId} onValueChange={setClassroomId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent>
                {sortByName(classrooms).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Guardar" : "Criar aluno"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};