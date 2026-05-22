import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("pages");
  const isEdit = !!student;
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [taxId, setTaxId] = useState("");
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
        setTaxId("");
        setBirthDate(student.birth_date ?? "");
        setGender(student.gender ?? "");
        setEnrollmentNumber(student.enrollment_number ?? "");
        setClassroomId(student.classroom_id ?? "");
        setAvatarColor(student.avatar_color ?? "blue");
      } else {
        setFullName(""); setEmail(""); setPhone(""); setTaxId(""); setBirthDate("");
        setGender(""); setEnrollmentNumber(""); setClassroomId(""); setAvatarColor("blue");
      }
    }
  }, [open, student]);

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      toast({ title: t("alunos.form.toast_name_required"), variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      if (isEdit && student) {
        const nextMailTrim = email.trim().toLowerCase();
        const prevMail = (student.email ?? "").trim().toLowerCase();
        if (student.user_id) {
          if (!nextMailTrim) {
            toast({
              title: t("alunos.form.toast_email_required_login"),
              variant: "destructive",
            });
            setLoading(false);
            return;
          }
          if (nextMailTrim !== prevMail) {
            const fx = await invokeAdminUpdateUserEmail(student.user_id, nextMailTrim);
            if (!fx.ok) {
              toast({ title: t("alunos.form.toast_login_email_failed"), description: fx.message, variant: "destructive" });
              setLoading(false);
              return;
            }
          }
        }
        const { error } = await supabase.from("students").update({
          full_name: fullName.trim(),
          email: email || null,
          phone: phone || null,
          tax_id: taxId.replace(/\D/g, "").trim() || null,
          birth_date: birthDate || null,
          gender: gender || null,
          enrollment_number: enrollmentNumber || null,
          classroom_id: classroomId || null,
          avatar_color: avatarColor,
        }).eq("id", student.id);
        if (error) throw error;
        toast({ title: t("alunos.form.toast_updated") });
      } else {
        const { data: profile } = await supabase
          .from("profiles")
          .select("school_id")
          .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
          .maybeSingle();
        const schoolId = profile?.school_id;
        if (!schoolId) throw new Error(t("alunos.form.toast_school_not_found"));
        const { error } = await supabase.from("students").insert({
          full_name: fullName.trim(),
          email: email || null,
          phone: phone || null,
          tax_id: taxId.replace(/\D/g, "").trim() || null,
          birth_date: birthDate || null,
          gender: gender || null,
          enrollment_number: enrollmentNumber || null,
          classroom_id: classroomId || null,
          avatar_color: avatarColor,
          school_id: schoolId,
        });
        if (error) throw error;
        toast({ title: t("alunos.form.toast_created") });
      }
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: t("alunos.form.toast_generic_error"), description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("alunos.form.title_edit") : t("alunos.form.title_create")}</DialogTitle>
          <DialogDescription>
            {isEdit ? t("alunos.form.desc_edit") : t("alunos.form.desc_create")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="fn">{t("alunos.form.full_name")}</Label>
            <Input
              id="fn"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t("alunos.form.placeholder_full_name")}
            />
          </div>
          <div>
            <Label htmlFor="em">
              {t("alunos.form.email")}
              {student?.user_id ? ` ${t("alunos.form.email_login_note")}` : ""}
            </Label>
            <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("alunos.form.placeholder_email")} />
          </div>
          <div>
            <Label htmlFor="ph">{t("alunos.form.phone")}</Label>
            <Input id="ph" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("alunos.form.placeholder_phone")} />
          </div>
          <div>
            <Label htmlFor="nif">NIF</Label>
            <Input id="nif" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="0000000000" maxLength={10} />
          </div>
          <div>
            <Label htmlFor="en">{t("alunos.form.enrollment_number")}</Label>
            <Input id="en" value={enrollmentNumber} onChange={(e) => setEnrollmentNumber(e.target.value)} placeholder={t("alunos.form.placeholder_enrollment_number")} />
          </div>
          <div>
            <Label htmlFor="bd">{t("alunos.form.birth_date")}</Label>
            <Input id="bd" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </div>
          <div>
            <Label>{t("alunos.form.gender")}</Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger><SelectValue placeholder={t("alunos.form.select_placeholder")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="M">{t("alunos.form.gender_m")}</SelectItem>
                <SelectItem value="F">{t("alunos.form.gender_f")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("alunos.form.classroom")}</Label>
            <Select value={classroomId} onValueChange={setClassroomId}>
              <SelectTrigger><SelectValue placeholder={t("alunos.form.select_placeholder")} /></SelectTrigger>
              <SelectContent>
                {sortByName(classrooms).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>{t("alunos.form.avatar_color")}</Label>
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {t("shared.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? t("shared.save") : t("alunos.form.submit_create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};