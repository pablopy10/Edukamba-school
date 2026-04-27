import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";
import { Loader2, KeyRound, Mail } from "lucide-react";

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
  const [mode, setMode] = useState<"invite" | "password">("invite");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setMode("invite");
      setEmail(defaultEmail ?? "");
      setPassword("");
    }
  }, [open, defaultEmail]);

  const handleSubmit = async () => {
    if (!email.trim()) {
      toast({ title: "Email obrigatório", variant: "destructive" });
      return;
    }
    if (mode === "password" && password.length < 6) {
      toast({ title: "A password tem de ter pelo menos 6 caracteres", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-student", {
        body: {
          student_id: studentId,
          email: email.trim(),
          password: mode === "password" ? password : null,
        },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast({
        title: mode === "password" ? "Conta criada" : "Convite enviado",
        description: mode === "password"
          ? `${studentName} já pode entrar com o email e a password definida.`
          : `${studentName} vai receber um email para definir a sua password.`,
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

          <div>
            <Label className="mb-2 block">Como criar?</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as "invite" | "password")} className="grid gap-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/40">
                <RadioGroupItem value="invite" id="m-invite" className="mt-1" />
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground"><Mail className="h-4 w-4" /> Enviar convite por email</p>
                  <p className="text-xs text-muted-foreground">O aluno recebe um email para definir a sua própria password.</p>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/40">
                <RadioGroupItem value="password" id="m-pass" className="mt-1" />
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground"><KeyRound className="h-4 w-4" /> Definir password agora</p>
                  <p className="text-xs text-muted-foreground">A escola entrega ao aluno o email e a password inicial.</p>
                </div>
              </label>
            </RadioGroup>
          </div>

          {mode === "password" && (
            <div>
              <Label htmlFor="st-pw">Password inicial</Label>
              <Input id="st-pw" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "password" ? "Criar conta" : "Enviar convite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};