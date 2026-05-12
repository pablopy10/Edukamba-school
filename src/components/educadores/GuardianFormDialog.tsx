import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { invokeAdminUpdateUserEmail } from "@/lib/admin/invokeAdminUpdateUserEmail";
// (no extra imports needed)

export type GuardianRow = {
  profile_id: string;
  full_name: string;
  phone: string | null;
  /** Email da conta Auth / perfil (login). */
  email: string | null;
  student_ids: string[];
  student_names: string[];
  classroom_ids: string[];
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
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (open) {
      if (guardian) {
        setFullName(guardian.full_name ?? "");
        setEmail(guardian.email ?? "");
        setPhone(guardian.phone ?? "");
        setStudentIds(guardian.student_ids ?? []);
      } else {
        setFullName(""); setEmail(""); setPhone("");
        setStudentIds([]);
        setPassword("");
      }
      setStudentSearch("");
    }
  }, [open, guardian]);

  const toggleStudent = (id: string) =>
    setStudentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      if (isEdit && guardian) {
        const nextEmail = email.trim().toLowerCase();
        const prevEmail = (guardian.email ?? "").trim().toLowerCase();
        if (nextEmail.length === 0) {
          toast({ title: "Email obrigatório", variant: "destructive" });
          setLoading(false);
          return;
        }
        if (nextEmail !== prevEmail) {
          const fx = await invokeAdminUpdateUserEmail(guardian.profile_id, nextEmail);
          if (!fx.ok) {
            toast({ title: "Erro ao actualizar email de login", description: fx.message, variant: "destructive" });
            setLoading(false);
            return;
          }
        }
        const { error: pErr } = await supabase.from("profiles").update({
          full_name: fullName.trim(),
          phone: phone || null,
        }).eq("id", guardian.profile_id);
        if (pErr) throw pErr;

        // Reconcile student links: unlink removed, link added.
        const previous = new Set(guardian.student_ids ?? []);
        const next = new Set(studentIds);
        const toUnlink = [...previous].filter((id) => !next.has(id));
        const toLink = [...next].filter((id) => !previous.has(id));
        if (toUnlink.length > 0) {
          const { error } = await supabase.from("students").update({ parent_id: null }).in("id", toUnlink);
          if (error) throw error;
        }
        if (toLink.length > 0) {
          const { error } = await supabase.from("students").update({ parent_id: guardian.profile_id }).in("id", toLink);
          if (error) throw error;
        }
        toast({ title: "Educador actualizado" });
      } else {
        if (!email.trim()) {
          toast({ title: "Email obrigatório", variant: "destructive" });
          setLoading(false); return;
        }
        if (password.length < 6) {
          toast({ title: "Password deve ter pelo menos 6 caracteres", variant: "destructive" });
          setLoading(false); return;
        }
        const { data, error } = await supabase.functions.invoke("invite-guardian", {
          body: {
            full_name: fullName.trim(),
            email: email.trim(),
            phone: phone || null,
            student_ids: studentIds,
            password,
          },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        toast({
          title: "Educador criado",
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

  const filteredStudents = [...students]
    .filter((s) =>
      !studentSearch.trim() || s.full_name.toLowerCase().includes(studentSearch.toLowerCase()),
    )
    .sort((a, b) =>
      a.full_name.localeCompare(b.full_name, undefined, { numeric: true, sensitivity: "base" }),
    );

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
          <div className="sm:col-span-2">
            <Label htmlFor="ge">Email {isEdit ? "(início de sessão)" : ""}</Label>
            <Input id="ge" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@email.com" />
            {isEdit && (
              <p className="mt-1 text-xs text-muted-foreground">
                Ao alterar o email também actualiza as credenciais de acesso ao Edukamba.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="gp">Telefone</Label>
            <Input id="gp" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(244) 925 ..." />
          </div>
          <div className="sm:col-span-2">
            <Label>Alunos associados {studentIds.length > 0 && <span className="text-muted-foreground">({studentIds.length})</span>}</Label>
            <Input
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Pesquisar aluno..."
              className="mt-1"
            />
            <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-border">
              {filteredStudents.length === 0 ? (
                <p className="p-3 text-center text-xs text-muted-foreground">Nenhum aluno encontrado.</p>
              ) : (
                filteredStudents.map((s) => {
                  const checked = studentIds.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-0 hover:bg-muted/50"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleStudent(s.id)} />
                      <span className="text-sm text-foreground">{s.full_name}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {!isEdit && (
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="gpw">Password inicial *</Label>
              <Input id="gpw" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
              <p className="text-xs text-muted-foreground">O educador receberá um email com as credenciais de acesso.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Guardar" : "Criar educador"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};