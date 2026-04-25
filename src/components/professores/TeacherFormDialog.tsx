import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export type TeacherRow = {
  id: string;
  profile_id: string | null;
  subject_id: string | null;
  hire_date: string | null;
  employee_id: string | null;
  avatar_color: string | null;
  profiles: { full_name: string; phone: string | null } | null;
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
  const [avatarColor, setAvatarColor] = useState("blue");
  const [mode, setMode] = useState<"invite" | "password">("invite");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (open) {
      if (teacher) {
        setFullName(teacher.profiles?.full_name ?? "");
        setPhone(teacher.profiles?.phone ?? "");
        setSubjectId(teacher.subject_id ?? "");
        setEmployeeId(teacher.employee_id ?? "");
        setHireDate(teacher.hire_date ?? "");
        setAvatarColor(teacher.avatar_color ?? "blue");
      } else {
        setFullName(""); setEmail(""); setPhone(""); setSubjectId("");
        setEmployeeId(""); setHireDate(""); setAvatarColor("blue");
        setMode("invite"); setPassword("");
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
        if (mode === "password" && password.length < 6) {
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
            password: mode === "password" ? password : null,
          },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        toast({
          title: mode === "password" ? "Professor criado" : "Convite enviado",
          description: mode === "password" ? "Conta criada com sucesso." : `Email enviado para ${email}.`,
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
            <div className="sm:col-span-2 rounded-lg border border-border p-3">
              <Label>Como criar a conta?</Label>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("invite")}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm transition ${mode === "invite" ? "border-primary bg-primary/10" : "border-border"}`}
                >Enviar convite por email</button>
                <button
                  type="button"
                  onClick={() => setMode("password")}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm transition ${mode === "password" ? "border-primary bg-primary/10" : "border-border"}`}
                >Definir password</button>
              </div>
              {mode === "password" && (
                <div className="mt-3">
                  <Label htmlFor="pw">Password (mín. 6 caracteres)</Label>
                  <Input id="pw" type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Guardar" : (mode === "invite" ? "Enviar convite" : "Criar professor")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};