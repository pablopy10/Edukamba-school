import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export type InviteableStaffRole = Exclude<
  Database["public"]["Enums"]["user_role"],
  "SUPER_ADMIN" | "PARENT" | "STUDENT"
>;

const INVITE_ORDER: InviteableStaffRole[] = [
  "ADMIN",
  "DIRECTOR",
  "SECRETARY",
  "TREASURER",
  "LIBRARIAN",
  "STOCK_MANAGER",
  "RECEPTIONIST",
  "TEACHER",
];

export const ROLE_LABEL_INVITE: Record<InviteableStaffRole, string> = {
  ADMIN: "Administrador",
  DIRECTOR: "Director",
  SECRETARY: "Secretaria",
  TREASURER: "Tesoureiro",
  LIBRARIAN: "Bibliotecário",
  STOCK_MANAGER: "Gestor de stock",
  RECEPTIONIST: "Rececionista",
  TEACHER: "Professor",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: () => void;
}

export const InviteStaffUserDialog = ({ open, onOpenChange, onInvited }: Props) => {
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<InviteableStaffRole>("SECRETARY");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!open) return;
    setFullName("");
    setEmail("");
    setPhone("");
    setRole("SECRETARY");
    setPassword("");
  }, [open]);

  const submit = async () => {
    if (!fullName.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    if (!email.trim()) {
      toast({ title: "Email obrigatório", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Password (mín. 6 caracteres)", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-school-user", {
        body: {
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          role,
          password,
        },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast({
        title: "Utilizador criado",
        description: `Credenciais enviadas por email para ${email.trim()}.`,
      });
      onInvited();
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro ao convidar", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo utilizador</DialogTitle>
          <DialogDescription>
            Um único pedido ao servidor gere os dois fluxos: com convite envia email; com password cria a conta logo (sem mensagem “convite”).
            Ajustar módulos: separador Permissões.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="is-fn">Nome completo</Label>
            <Input id="is-fn" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Maria Silva" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="is-em">Email</Label>
            <Input id="is-em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@escola.edu" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="is-ph">Telefone (opcional)</Label>
            <Input id="is-ph" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(244) 923 …" />
          </div>
          <div className="sm:col-span-2">
            <Label>Função</Label>
            <Select value={role} onValueChange={(v) => setRole(v as InviteableStaffRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar função" />
              </SelectTrigger>
              <SelectContent>
                {INVITE_ORDER.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL_INVITE[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="is-pw">Password inicial *</Label>
            <Input id="is-pw" type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
            <p className="text-xs text-muted-foreground">O utilizador receberá um email com as credenciais de acesso.</p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar utilizador
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
