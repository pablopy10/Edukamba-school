import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export const ELIGIBLE_GRADES = new Set([
  "Ensino Secundário",
  "Ensino Médio",
  "Ensino Técnico-Profissional",
]);

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  studentId: string;
  studentName: string;
  defaultEmail?: string | null;
  onCreated?: () => void;
}

export const CreateStudentAccessDialog = ({ open, onOpenChange, studentId, studentName, defaultEmail, onCreated }: Props) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail(defaultEmail ?? "");
      setPassword("");
    }
  }, [open, defaultEmail]);

  const handleSubmit = async () => {
    if (!email.trim()) {
      toast({ title: "Email obrigatório", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "A password tem de ter pelo menos 6 caracteres", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-student", {
        body: {
          student_id: studentId,
          email: email.trim(),
          password,
        },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast({
        title: "Conta criada",
        description: `Credenciais enviadas por email para ${email.trim()}.`,
      });
      onCreated?.();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Criar acesso à plataforma</DialogTitle>
          <DialogDescription>
            Defina o email e o método de criação da conta de <strong>{studentName}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div>
            <Label htmlFor="st-em">Email do aluno</Label>
            <Input id="st-em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="aluno@escola.edu" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st-pw">Password inicial *</Label>
            <Input id="st-pw" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
            <p className="text-xs text-muted-foreground">O aluno receberá um email com as credenciais de acesso.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar conta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};