import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: () => void;
}

export const InviteStaffUserDialog = ({ open, onOpenChange, onInvited }: Props) => {
  const { t: tr } = useTranslation("pages", { keyPrefix: "definicoes" });
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
      toast({ title: tr("validation.invite_name"), variant: "destructive" });
      return;
    }
    if (!email.trim()) {
      toast({ title: tr("validation.invite_email"), variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: tr("validation.invite_password"), variant: "destructive" });
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
        title: tr("toasts.invite_created"),
        description: tr("toasts.invite_created_desc", { email: email.trim() }),
      });
      onInvited();
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: tr("toasts.invite_error"), description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{tr("invite.title")}</DialogTitle>
          <DialogDescription>{tr("invite.description")}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="is-fn">{tr("invite.field_full_name")}</Label>
            <Input
              id="is-fn"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={tr("invite.placeholder_name")}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="is-em">{tr("invite.field_email")}</Label>
            <Input
              id="is-em"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={tr("invite.placeholder_email")}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="is-ph">{tr("invite.field_phone")}</Label>
            <Input
              id="is-ph"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={tr("invite.placeholder_phone")}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>{tr("invite.field_role")}</Label>
            <Select value={role} onValueChange={(v) => setRole(v as InviteableStaffRole)}>
              <SelectTrigger>
                <SelectValue placeholder={tr("invite.select_role")} />
              </SelectTrigger>
              <SelectContent>
                {INVITE_ORDER.map((r) => (
                  <SelectItem key={r} value={r}>
                    {tr(`roles.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="is-pw">{tr("invite.field_password")}</Label>
            <Input
              id="is-pw"
              type="text"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={tr("invite.placeholder_password")}
            />
            <p className="text-xs text-muted-foreground">{tr("invite.password_help")}</p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={loading}>
            {tr("shared.cancel")}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tr("invite.btn_create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
