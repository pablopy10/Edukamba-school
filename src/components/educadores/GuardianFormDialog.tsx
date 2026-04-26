import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export type GuardianRow = {
  profile_id: string;
  full_name: string;
  phone: string | null;
  student_id: string | null;
  student_name: string | null;
  classroom_id: string | null;
};

type StudentOpt = { id: string; full_name: string };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  students: StudentOpt[];
  guardian?: GuardianRow | null;
  onSaved: () => void;
}

export const GuardianFormDialog = ({ open, onOpenChange, students, guardian, onSaved }: Props) => {
  const isEdit = !!guardian;
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [studentId, setStudentId] = useState<string>("none");
  const [mode, setMode] = useState<"invite" | "password">("invite");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (open) {
      if (guardian) {
        setFullName(guardian.full_name ?? "");
        setPhone(guardian.phone ?? "");
        setStudentId(guardian.student_id ?? "none");
      } else {
        setFullName(""); setEmail(""); setPhone("");
        setStudentId("none");
        setMode("invite"); setPassword("");
      }
    }
  }, [open, guardian]);

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      if (isEdit && guardian) {
        const { error: pErr } = await supabase.from("profiles").update({
          full_name: fullName.trim(),
          phone: phone || null,
        }).eq("id", guardian.profile_id);
        if (pErr) throw pErr;

        // Reassign linked student
        if (guardian.student_id && (studentId === "none" || studentId !== guardian.student_id)) {
          // unlink old student (only if changed)
          if (studentId !== guardian.student_id) {
            await supabase.from("students").update({ parent_id: null }).eq("id", guardian.student_id);
          }
        }
        if (studentId !== "none") {
          const { error: sErr } = await supabase.from("students")
            .update({ parent_id: guardian.profile_id }).eq("id", studentId);
          if (sErr) throw sErr;
        }
        toast({ title: "Educador actualizado" });
      } else {
        if (!email.trim()) {
          toast({ title: "Email obrigatório", variant: "destructive" });
          setLoading(false); return;
        }
        if (mode === "password" && password.length < 6) {
          toast({ title: "Password deve ter pelo menos 6 caracteres", variant: "destructive" });
          setLoading(false); return;
        }
        const { data, error } = await supabase.functions.invoke("invite-guardian", {
          body: {
            full_name: fullName.trim(),
            email: email.trim(),
            phone: phone || null,
            student_id: studentId !== "none" ? studentId : null,
            password: mode === "password" ? password : null,
          },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        toast({
          title: mode === "password" ? "Educador criado" : "Convite enviado",
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
          <DialogTitle>{isEdit ? "Editar Educador" : "Novo Educador"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Actualize os dados do encarregado de educação." : "Preencha os dados e escolha como criar a conta."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="gn">Nome completo</Label>
            <Input id="gn" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ex.: Maria Silva" />
          </div>
          {!isEdit && (
            <div className="sm:col-span-2">
              <Label htmlFor="ge">Email</Label>
              <Input id="ge" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="educador@email.com" />
            </div>
          )}
          <div>
            <Label htmlFor="gp">Telefone</Label>
            <Input id="gp" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(244) 925 ..." />
          </div>
          <div>
            <Label>Aluno associado</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger><SelectValue placeholder="Sem aluno" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem aluno</SelectItem>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                  <Label htmlFor="gpw">Password (mín. 6 caracteres)</Label>
                  <Input id="gpw" type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Guardar" : (mode === "invite" ? "Enviar convite" : "Criar educador")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};