import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Loader2, Receipt } from "lucide-react";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { useParentChildren } from "@/hooks/useParentChildren";
import { CreateStudentAccessDialog, ELIGIBLE_GRADES } from "@/components/alunos/CreateStudentAccessDialog";
import { BillingEngineService } from "@/lib/fiscal";

export type EnrollmentRow = {
  id: string;
  student_id: string | null;
  classroom_id: string | null;
  academic_year_id: string | null;
  status: string | null;
  enrolled_at: string | null;
  result?: string | null;
  result_notes?: string | null;
  result_published_at?: string | null;
  students?: { id: string; full_name: string; email: string | null; avatar_color: string | null } | null;
  classrooms?: { id: string; name: string } | null;
  academic_years?: { id: string; label: string } | null;
};

type Opt = { id: string; name: string };
type YearOpt = { id: string; label: string; is_active?: boolean | null };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  students: Opt[];
  classrooms: Opt[];
  years: YearOpt[];
  enrollment?: EnrollmentRow | null;
  onSaved: () => void;
  schoolId?: string | null;
}

export const EnrollmentFormDialog = ({
  open,
  onOpenChange,
  students,
  classrooms,
  years,
  enrollment,
  onSaved,
  schoolId,
}: Props) => {
  const { t } = useTranslation("pages");
  const { selectedYearId } = useAcademicYear();
  const { isParent, children: parentChildren } = useParentChildren();
  const isEdit = !!enrollment;
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"new" | "renew">("renew");
  // shared (renew + edit)
  const [studentId, setStudentId] = useState<string>("");
  const [classroomId, setClassroomId] = useState<string>("");
  const [yearId, setYearId] = useState<string>("");
  const [status, setStatus] = useState<string>("ACTIVE");
  const [result, setResult] = useState<string>("EM_CURSO");
  const [resultNotes, setResultNotes] = useState<string>("");
  const [publishResult, setPublishResult] = useState<boolean>(false);
  const [alreadyPublished, setAlreadyPublished] = useState<boolean>(false);
  // classrooms filtered by selected year inside the dialog
  const [yearClassrooms, setYearClassrooms] = useState<(Opt & { grade_level?: string | null })[]>([]);
  const [loadingClassrooms, setLoadingClassrooms] = useState(false);
  // new student fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<string>("");
  const [enrollmentNumber, setEnrollmentNumber] = useState("");
  const [taxId, setTaxId] = useState("");

  // Billing controls
  const [generateCharge, setGenerateCharge] = useState<boolean>(true);
  const [generateCashReceipt, setGenerateCashReceipt] = useState<boolean>(false);
  const [chargeAmount, setChargeAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>("TRANSFERENCIA");
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().slice(0, 10);
  });
  const [defaultNewFee, setDefaultNewFee] = useState<number>(0);
  const [defaultRenewalFee, setDefaultRenewalFee] = useState<number>(0);

  // Post-save: prompt to create student platform access when eligible
  const [accessPrompt, setAccessPrompt] = useState<{ studentId: string; studentName: string; defaultEmail: string | null } | null>(null);

  const isClassroomEligible = (cId: string) => {
    const c = yearClassrooms.find((x) => x.id === cId);
    return !!(c?.grade_level && ELIGIBLE_GRADES.has(c.grade_level));
  };

  // Carregar configurações de taxas da escola
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadSettings = async () => {
      let sId = schoolId;
      if (!sId) {
        const { data: userRes } = await supabase.auth.getUser();
        const { data: profile } = await supabase
          .from("profiles")
          .select("school_id")
          .eq("id", userRes.user?.id ?? "")
          .maybeSingle();
        sId = profile?.school_id ?? null;
      }
      if (!sId || cancelled) return;
      const { data: schoolData } = await supabase
        .from("schools")
        .select("settings")
        .eq("id", sId)
        .maybeSingle();
      if (cancelled || !schoolData) return;
      const s = schoolData.settings as {
        enrollment_fee_new?: number;
        enrollment_fee_renewal?: number;
      } | null;
      const dNew = typeof s?.enrollment_fee_new === "number" ? s.enrollment_fee_new : 0;
      const dRenewal = typeof s?.enrollment_fee_renewal === "number" ? s.enrollment_fee_renewal : 0;
      setDefaultNewFee(dNew);
      setDefaultRenewalFee(dRenewal);
      if (!enrollment) {
        setChargeAmount(tab === "new" ? dNew : dRenewal);
      }
    };
    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [open, schoolId]);

  useEffect(() => {
    if (open) {
      if (enrollment) {
        setStudentId(enrollment.student_id ?? "");
        setClassroomId(enrollment.classroom_id ?? "");
        setYearId(enrollment.academic_year_id ?? "");
        setStatus(enrollment.status ?? "ACTIVE");
        setResult(enrollment.result ?? "EM_CURSO");
        setResultNotes(enrollment.result_notes ?? "");
        setAlreadyPublished(!!enrollment.result_published_at);
        setPublishResult(!!enrollment.result_published_at);
      } else {
        const activeYear = years.find((y) => y.is_active);
        setStudentId(""); setClassroomId(""); setYearId(selectedYearId ?? activeYear?.id ?? ""); setStatus("ACTIVE");
        setResult("EM_CURSO"); setResultNotes(""); setPublishResult(false); setAlreadyPublished(false);
        setTab("renew");
        setFullName(""); setEmail(""); setPhone(""); setBirthDate(""); setGender(""); setEnrollmentNumber(""); setTaxId("");
        setGenerateCharge(true);
        setGenerateCashReceipt(false);
        setChargeAmount(defaultRenewalFee);
        const d = new Date();
        d.setDate(d.getDate() + 15);
        setDueDate(d.toISOString().slice(0, 10));
        setPaymentMethod("TRANSFERENCIA");
      }
    }
  }, [open, enrollment, years, selectedYearId, defaultRenewalFee]);

  // Fetch classrooms for the selected year inside the dialog
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      if (!yearId) {
        setYearClassrooms([]);
        return;
      }
      setLoadingClassrooms(true);
      const { data, error } = await supabase
        .from("classrooms")
        .select("id, name, grade_level")
        .eq("academic_year_id", yearId)
        .order("name");
      if (cancelled) return;
      if (error) {
        setYearClassrooms([]);
      } else {
        setYearClassrooms((data ?? []) as (Opt & { grade_level?: string | null })[]);
      }
      setLoadingClassrooms(false);
    };
    load();
    return () => { cancelled = true; };
  }, [open, yearId]);

  // Reset selected classroom if it no longer belongs to the selected year
  useEffect(() => {
    if (!open || loadingClassrooms) return;
    if (classroomId && !yearClassrooms.some((c) => c.id === classroomId)) {
      setClassroomId("");
    }
  }, [yearClassrooms, loadingClassrooms, open]);

  const handleEnrollmentBilling = async ({
    targetStudentId,
    enrollmentId,
    targetSchoolId,
    targetYearId,
    feeType,
    customerName,
    customerNif,
  }: {
    targetStudentId: string;
    enrollmentId: string;
    targetSchoolId: string;
    targetYearId: string;
    feeType: "NEW" | "RENEWAL";
    customerName?: string;
    customerNif?: string;
  }) => {
    const yearLabel = years.find((y) => y.id === targetYearId)?.label || "";
    const lineDesc =
      feeType === "NEW"
        ? `Taxa de Matrícula${yearLabel ? ` - ${yearLabel}` : ""}`
        : `Taxa de Renovação de Matrícula${yearLabel ? ` - ${yearLabel}` : ""}`;

    const todayStr = new Date().toISOString().slice(0, 10);
    const targetDueDate = dueDate || todayStr;

    if (generateCashReceipt) {
      // 1. Criar enrollment_fees liquidada
      const { data: feeRow, error: feeErr } = await supabase
        .from("enrollment_fees")
        .insert({
          school_id: targetSchoolId,
          student_id: targetStudentId,
          academic_year_id: targetYearId || null,
          enrollment_id: enrollmentId,
          fee_type: feeType,
          amount_due: chargeAmount,
          due_date: todayStr,
          is_paid: true,
          notes: `Liquidado no ato da matrícula (${feeType === "NEW" ? "Nova" : "Renovação"})`,
        })
        .select("id")
        .single();

      if (feeErr) console.warn("Erro ao registar enrollment_fees:", feeErr);

      // 2. Criar payment aprovado
      const { data: payRow, error: payErr } = await supabase
        .from("payments")
        .insert({
          school_id: targetSchoolId,
          enrollment_fee_id: feeRow?.id ?? null,
          amount_paid: chargeAmount,
          method: paymentMethod || "TRANSFERENCIA",
          status: "APPROVED",
          payment_date: todayStr,
          notes: `Quitação imediata no ato da matrícula (${feeType === "NEW" ? "Nova" : "Renovação"})`,
        })
        .select("id")
        .single();

      if (payErr) console.warn("Erro ao registar payments:", payErr);

      // 3. Emitir FR (Fatura-Recibo) com quitação imediata e envio por email com PDF
      const frRes = await BillingEngineService.issueCashInvoice({
        schoolId: targetSchoolId,
        studentId: targetStudentId,
        paymentId: payRow?.id ?? null,
        paymentMethod: paymentMethod || "TRANSFERENCIA",
        paymentDate: todayStr,
        customerName,
        customerNif,
        lines: [
          {
            itemType: "MATRICULA",
            description: lineDesc,
            quantity: 1,
            unitPrice: chargeAmount,
            taxPercentage: 0,
            taxCode: "ISE",
            taxExemptionCode: "M11",
            taxExemptionReason: "Isento nos termos da alínea a) do n.º 1 do artigo 12.º do CIVA",
          },
        ],
        sendEmailWithPdf: true,
      });

      return { type: "FR" as const, result: frRes };
    } else {
      // 1. Criar enrollment_fees em aberto (FT)
      const { data: feeRow, error: feeErr } = await supabase
        .from("enrollment_fees")
        .insert({
          school_id: targetSchoolId,
          student_id: targetStudentId,
          academic_year_id: targetYearId || null,
          enrollment_id: enrollmentId,
          fee_type: feeType,
          amount_due: chargeAmount,
          due_date: targetDueDate,
          is_paid: false,
          notes: `Fatura de matrícula a crédito (${feeType === "NEW" ? "Nova" : "Renovação"})`,
        })
        .select("id")
        .single();

      if (feeErr) console.warn("Erro ao registar enrollment_fees:", feeErr);

      // 2. Emitir FT (Fatura) a crédito com envio por email com PDF
      const ftRes = await BillingEngineService.issueCreditInvoice({
        schoolId: targetSchoolId,
        studentId: targetStudentId,
        dueDate: targetDueDate,
        customerName,
        customerNif,
        lines: [
          {
            itemType: "MATRICULA",
            description: lineDesc,
            quantity: 1,
            unitPrice: chargeAmount,
            taxPercentage: 0,
            taxCode: "ISE",
            taxExemptionCode: "M11",
            taxExemptionReason: "Isento nos termos da alínea a) do n.º 1 do artigo 12.º do CIVA",
          },
        ],
        sendEmailWithPdf: true,
      });

      return { type: "FT" as const, result: ftRes };
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    let triggeredAccessPrompt = false;
    try {
      if (isEdit && enrollment) {
        if (!studentId) {
          toast({ title: t("matriculas.form.toast_student_required"), variant: "destructive" });
          setLoading(false);
          return;
        }
        // Prevent duplicate: same student + same year on a different enrollment
        if (yearId) {
          const { data: dup, error: dErr } = await supabase
            .from("enrollments")
            .select("id")
            .eq("student_id", studentId)
            .eq("academic_year_id", yearId)
            .neq("id", enrollment.id)
            .limit(1);
          if (dErr) throw dErr;
          if (dup && dup.length > 0) {
            toast({
              title: t("matriculas.form.toast_duplicate_title"),
              description: t("matriculas.form.toast_duplicate_same_year"),
              variant: "destructive",
            });
            setLoading(false);
            return;
          }
        }
        const { data: userRes } = await supabase.auth.getUser();
        const shouldPublish = publishResult && result && result !== "EM_CURSO";
        const updatePayload: {
          student_id: string;
          classroom_id: string | null;
          academic_year_id: string | null;
          status: string;
          result: string | null;
          result_notes: string | null;
          result_published_at?: string | null;
          result_published_by?: string | null;
        } = {
          student_id: studentId,
          classroom_id: classroomId || null,
          academic_year_id: yearId || null,
          status,
          result: result === "EM_CURSO" ? null : result,
          result_notes: resultNotes || null,
        };
        if (shouldPublish && !alreadyPublished) {
          updatePayload.result_published_at = new Date().toISOString();
          updatePayload.result_published_by = userRes.user?.id ?? null;
        } else if (!shouldPublish && alreadyPublished) {
          updatePayload.result_published_at = null;
          updatePayload.result_published_by = null;
        }
        const { error } = await supabase.from("enrollments").update(updatePayload).eq("id", enrollment.id);
        if (error) throw error;
        toast({
          title: t("matriculas.form.toast_updated"),
          description:
            shouldPublish && !alreadyPublished ? t("matriculas.form.toast_updated_published") : undefined,
        });
      } else if (tab === "new") {
        if (!fullName.trim()) {
          toast({ title: t("matriculas.form.toast_name_required_student"), variant: "destructive" });
          setLoading(false);
          return;
        }

        if (!isParent && generateCharge && (chargeAmount <= 0 || isNaN(chargeAmount))) {
          toast({
            title: "Valor da cobrança obrigatório",
            description: "Indique um valor superior a 0 Kz para gerar a cobrança / fatura de matrícula.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        // Need school_id for student creation
        let resolvedSchoolId = schoolId;
        if (!resolvedSchoolId) {
          const { data: userRes } = await supabase.auth.getUser();
          const { data: profile } = await supabase
            .from("profiles").select("school_id").eq("id", userRes.user?.id ?? "").maybeSingle();
          resolvedSchoolId = profile?.school_id;
        }
        if (!resolvedSchoolId) throw new Error(t("matriculas.form.toast_school_missing"));

        const { data: created, error: sErr } = await supabase.from("students").insert({
          full_name: fullName.trim(),
          email: email || null,
          phone: phone || null,
          tax_id: taxId.trim().toUpperCase() || null,
          birth_date: birthDate || null,
          gender: gender || null,
          enrollment_number: enrollmentNumber || null,
          classroom_id: classroomId || null,
          school_id: resolvedSchoolId,
        }).select("id").single();
        if (sErr) throw sErr;

        const { data: createdEnrollment, error: eErr } = await supabase.from("enrollments").insert({
          student_id: created.id,
          classroom_id: classroomId || null,
          academic_year_id: yearId || null,
          status,
        }).select("id").single();
        if (eErr) throw eErr;

        // Faturação da matrícula
        if (!isParent && generateCharge && chargeAmount > 0) {
          const billingRes = await handleEnrollmentBilling({
            targetStudentId: created.id,
            enrollmentId: createdEnrollment.id,
            targetSchoolId: resolvedSchoolId,
            targetYearId: yearId,
            feeType: "NEW",
            customerName: fullName.trim(),
            customerNif: taxId.trim().toUpperCase(),
          });

          if (billingRes && !billingRes.result.ok) {
            toast({
              title: "Matrícula criada com aviso fiscal",
              description: billingRes.result.message || "Erro ao emitir documento fiscal.",
              variant: "destructive",
            });
          } else if (billingRes && billingRes.result.ok) {
            const docLabel = billingRes.type === "FR" ? "Fatura-Recibo" : "Fatura";
            toast({
              title: t("matriculas.form.toast_created_student_enrollment"),
              description: `${docLabel} ${billingRes.result.documentNumber} emitida e enviada por email.`,
            });
          } else {
            toast({ title: t("matriculas.form.toast_created_student_enrollment") });
          }
        } else {
          toast({ title: t("matriculas.form.toast_created_student_enrollment") });
        }

        if (classroomId && isClassroomEligible(classroomId)) {
          setAccessPrompt({ studentId: created.id, studentName: fullName.trim(), defaultEmail: email || null });
          triggeredAccessPrompt = true;
        }
      } else {
        if (!studentId) {
          toast({ title: t("matriculas.form.toast_pick_student_renew"), variant: "destructive" });
          setLoading(false);
          return;
        }

        if (!isParent && generateCharge && (chargeAmount <= 0 || isNaN(chargeAmount))) {
          toast({
            title: "Valor da cobrança obrigatório",
            description: "Indique um valor superior a 0 Kz para gerar a cobrança / fatura de renovação.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        // Prevent duplicate enrollment on the same year
        if (yearId) {
          const { data: dup, error: dErr } = await supabase
            .from("enrollments")
            .select("id")
            .eq("student_id", studentId)
            .eq("academic_year_id", yearId)
            .limit(1);
          if (dErr) throw dErr;
          if (dup && dup.length > 0) {
            toast({
              title: t("matriculas.form.toast_duplicate_title"),
              description: t("matriculas.form.toast_duplicate_same_year"),
              variant: "destructive",
            });
            setLoading(false);
            return;
          }
        }

        let resolvedSchoolId = schoolId;
        if (!resolvedSchoolId) {
          const { data: userRes } = await supabase.auth.getUser();
          const { data: profile } = await supabase
            .from("profiles").select("school_id").eq("id", userRes.user?.id ?? "").maybeSingle();
          resolvedSchoolId = profile?.school_id;
        }
        if (!resolvedSchoolId) throw new Error(t("matriculas.form.toast_school_missing"));

        const { data: createdEnrollment, error: eErr } = await supabase.from("enrollments").insert({
          student_id: studentId,
          classroom_id: isParent ? null : (classroomId || null),
          academic_year_id: yearId || null,
          status: isParent ? "PENDING" : status,
        }).select("id").single();
        if (eErr) throw eErr;

        // Faturação da renovação
        if (!isParent && generateCharge && chargeAmount > 0) {
          let customerName = "";
          let customerNif = "";
          const { data: stData } = await supabase
            .from("students")
            .select("full_name, tax_id, parent_id")
            .eq("id", studentId)
            .maybeSingle();

          if (stData) {
            customerName = stData.full_name;
            customerNif = stData.tax_id || "";
            if (stData.parent_id) {
              const { data: prData } = await supabase
                .from("profiles")
                .select("full_name, tax_id")
                .eq("id", stData.parent_id)
                .maybeSingle();
              if (prData?.full_name) customerName = prData.full_name;
              if (prData?.tax_id) customerNif = prData.tax_id;
            }
          }

          const billingRes = await handleEnrollmentBilling({
            targetStudentId: studentId,
            enrollmentId: createdEnrollment.id,
            targetSchoolId: resolvedSchoolId,
            targetYearId: yearId,
            feeType: "RENEWAL",
            customerName,
            customerNif,
          });

          if (billingRes && !billingRes.result.ok) {
            toast({
              title: "Renovação criada com aviso fiscal",
              description: billingRes.result.message || "Erro ao emitir documento fiscal.",
              variant: "destructive",
            });
          } else if (billingRes && billingRes.result.ok) {
            const docLabel = billingRes.type === "FR" ? "Fatura-Recibo" : "Fatura";
            toast({
              title: t("matriculas.form.toast_renewed"),
              description: `${docLabel} ${billingRes.result.documentNumber} emitida e enviada por email.`,
            });
          } else {
            toast({ title: t("matriculas.form.toast_renewed") });
          }
        } else {
          toast({ title: t("matriculas.form.toast_renewed") });
        }

        if (classroomId && isClassroomEligible(classroomId)) {
          const { data: st } = await supabase
            .from("students")
            .select("full_name, email, user_id")
            .eq("id", studentId)
            .maybeSingle();
          if (st && !st.user_id) {
            setAccessPrompt({ studentId, studentName: st.full_name, defaultEmail: st.email });
            triggeredAccessPrompt = true;
          }
        }
      }
      onSaved();
      // If we triggered the access prompt, keep this dialog mounted so the
      // child CreateStudentAccessDialog doesn't get unmounted mid-open.
      // The parent dialog will close once the access prompt is dismissed.
      if (!triggeredAccessPrompt) {
        onOpenChange(false);
      }
    } catch (e: any) {
      toast({ title: t("matriculas.form.toast_generic_error"), description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <Dialog open={open && !accessPrompt} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl sm:max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("matriculas.form.title_edit") : t("matriculas.form.title_create")}</DialogTitle>
          <DialogDescription>
            {isEdit ? t("matriculas.form.desc_edit") : t("matriculas.form.desc_create")}
          </DialogDescription>
        </DialogHeader>

        {!isEdit && (
          <Tabs
            value={isParent ? "renew" : tab}
            onValueChange={(v) => {
              const nextTab = v as "new" | "renew";
              setTab(nextTab);
              setChargeAmount(nextTab === "new" ? defaultNewFee : defaultRenewalFee);
            }}
          >
            {!isParent && (
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="new">{t("matriculas.form.tab_new_student")}</TabsTrigger>
                <TabsTrigger value="renew">{t("matriculas.form.tab_renew")}</TabsTrigger>
              </TabsList>
            )}

            {!isParent && (
            <TabsContent value="new" className="mt-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="fn">{t("matriculas.form.full_name")}</Label>
                  <Input
                    id="fn"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t("matriculas.form.placeholder_full_name")}
                  />
                </div>
                <div>
                  <Label htmlFor="em">{t("matriculas.form.email")}</Label>
                  <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("matriculas.form.placeholder_email")} />
                </div>
                <div>
                  <Label htmlFor="ph">{t("matriculas.form.phone")}</Label>
                  <Input id="ph" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("matriculas.form.placeholder_phone")} />
                </div>
                <div>
                  <Label htmlFor="nif">NIF</Label>
                  <Input id="nif" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="001699891LA037" maxLength={14} />
                </div>
                <div>
                  <Label htmlFor="en">{t("matriculas.form.enrollment_number")}</Label>
                  <Input id="en" value={enrollmentNumber} onChange={(e) => setEnrollmentNumber(e.target.value)} placeholder={t("matriculas.form.placeholder_enrollment_number")} />
                </div>
                <div>
                  <Label htmlFor="bd">{t("matriculas.form.birth_date")}</Label>
                  <Input id="bd" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Label>{t("matriculas.form.gender")}</Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger><SelectValue placeholder={t("matriculas.form.select_placeholder")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">{t("matriculas.form.gender_m")}</SelectItem>
                      <SelectItem value="F">{t("matriculas.form.gender_f")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>
            )}

            <TabsContent value="renew" className="mt-4">
              <div>
                <Label>{t("matriculas.form.student_existing")}</Label>
                <Select value={studentId} onValueChange={setStudentId}>
                  <SelectTrigger><SelectValue placeholder={t("matriculas.form.select_student_placeholder")} /></SelectTrigger>
                  <SelectContent>
                    {(isParent
                      ? parentChildren.map((c) => ({ id: c.id, name: c.full_name }))
                      : students
                    ).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
          </Tabs>
        )}

        {isEdit && (
          <div>
            <Label>{t("matriculas.form.student_pick")}</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger><SelectValue placeholder={t("matriculas.form.select_student_placeholder")} /></SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {!isParent && (
          <div className="sm:col-span-2">
            <Label>{t("matriculas.form.class_label")}</Label>
            <Select value={classroomId} onValueChange={setClassroomId} disabled={!yearId || loadingClassrooms}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !yearId
                      ? t("matriculas.form.pick_year_before_class")
                      : loadingClassrooms
                        ? t("matriculas.form.loading_classes")
                        : t("matriculas.form.select_class_placeholder")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {yearClassrooms.length === 0 && !loadingClassrooms && yearId && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">{t("matriculas.form.no_classes_for_year")}</div>
                )}
                {yearClassrooms.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          )}
          <div>
            <Label>{t("matriculas.form.academic_year")}</Label>
            <Select value={yearId} onValueChange={setYearId}>
              <SelectTrigger><SelectValue placeholder={t("matriculas.form.year_select_placeholder")} /></SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.label}{y.is_active ? ` ${t("matriculas.form.year_active_suffix")}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!isParent && (
          <div>
            <Label>{t("matriculas.form.status_label")}</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["ACTIVE", "PENDING", "CANCELLED"] as const).map((sv) => (
                  <SelectItem key={sv} value={sv}>{t(`matriculas.status.${sv}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          )}
        </div>

        {!isEdit && !isParent && (
          <div className="rounded-xl border border-border/80 bg-muted/20 p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              <div>
                <h4 className="text-sm font-semibold text-foreground">Faturação e Cobrança da Matrícula</h4>
                <p className="text-xs text-muted-foreground">Emissão fiscal AGT vinculada à matrícula do aluno</p>
              </div>
            </div>

            <div className="space-y-3 pt-1">
              {/* Checkbox 1: Gerar cobrança */}
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <Checkbox
                  id="chk-generate-charge"
                  checked={generateCharge}
                  onCheckedChange={(checked) => {
                    const v = !!checked;
                    setGenerateCharge(v);
                    if (!v) setGenerateCashReceipt(false);
                  }}
                  className="mt-0.5"
                />
                <div>
                  <span className="text-sm font-medium text-foreground">Gerar cobrança</span>
                  <p className="text-xs text-muted-foreground">
                    {generateCashReceipt
                      ? "Cria a cobrança e emite a Fatura-Recibo (FR) quitada no ato com comprovativo fiscal."
                      : "Cria a cobrança e emite uma Fatura (FT) a crédito com lançamento de conta a receber."}
                  </p>
                </div>
              </label>

              {/* Checkbox 2: Gerar Fatura-recibo (em baixo da de gerar cobrança) */}
              <div className="pl-7">
                <label
                  className={`flex items-start gap-3 select-none ${
                    !generateCharge ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                  }`}
                >
                  <Checkbox
                    id="chk-generate-cash-receipt"
                    disabled={!generateCharge}
                    checked={generateCashReceipt}
                    onCheckedChange={(checked) => {
                      const v = !!checked;
                      setGenerateCashReceipt(v);
                      if (v) setGenerateCharge(true);
                    }}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="text-sm font-medium text-foreground">Gerar Fatura-recibo</span>
                    <p className="text-xs text-muted-foreground">
                      Quitação imediata: gera a fatura-recibo para o encarregado e/ou para o aluno com envio automático do PDF por email.
                    </p>
                  </div>
                </label>
              </div>

              {/* Campos adicionais quando Gerar cobrança estiver ativo */}
              {generateCharge && (
                <div className="mt-3 grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2 border-t border-border/50">
                  <div>
                    <Label htmlFor="charge-amount" className="text-xs font-semibold">
                      Valor da Matrícula / Renovação (Kz)
                    </Label>
                    <Input
                      id="charge-amount"
                      type="number"
                      min={0}
                      step={100}
                      value={chargeAmount === 0 ? "" : chargeAmount}
                      onChange={(e) => setChargeAmount(e.target.value === "" ? 0 : Number(e.target.value))}
                      placeholder="Ex: 25000"
                      className="mt-1"
                    />
                  </div>

                  {generateCashReceipt ? (
                    <div>
                      <Label className="text-xs font-semibold">Método de Pagamento</Label>
                      <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TRANSFERENCIA">Transferência Bancária / Express</SelectItem>
                          <SelectItem value="TPA">Terminal Multicaixa (TPA)</SelectItem>
                          <SelectItem value="NUMERARIO">Numerário / Dinheiro</SelectItem>
                          <SelectItem value="DEPOSITO">Depósito Bancário</SelectItem>
                          <SelectItem value="OUTRO">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div>
                      <Label htmlFor="charge-due-date" className="text-xs font-semibold">
                        Data de Vencimento
                      </Label>
                      <Input
                        id="charge-due-date"
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {isEdit && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <div>
              <Label className="text-sm font-semibold">{t("matriculas.form.result_section_title")}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t("matriculas.form.result_section_hint")}</p>
            </div>
            <Select value={result} onValueChange={setResult}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["EM_CURSO", "APROVADO", "REPROVADO", "TRANSFERIDO"] as const).map((rv) => (
                  <SelectItem key={rv} value={rv}>{t(`matriculas.form.result.${rv}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {result !== "EM_CURSO" && (
              <>
                <div>
                  <Label htmlFor="result-notes" className="text-xs">{t("matriculas.form.result_notes_label")}</Label>
                  <Textarea
                    id="result-notes"
                    rows={3}
                    value={resultNotes}
                    onChange={(e) => setResultNotes(e.target.value)}
                    placeholder={t("matriculas.form.result_placeholder_notes")}
                  />
                </div>
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox checked={publishResult} onCheckedChange={(v) => setPublishResult(!!v)} className="mt-0.5" />
                  <span className="text-sm">
                    {t("matriculas.form.publish_to_guardian")}
                    {alreadyPublished ? (
                      <span className="block text-xs text-muted-foreground">{t("matriculas.form.already_published_hint")}</span>
                    ) : null}
                  </span>
                </label>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {t("shared.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit
              ? t("shared.save")
              : tab === "new"
                ? t("matriculas.form.submit_create_both")
                : t("matriculas.form.submit_renew")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {accessPrompt && (
      <CreateStudentAccessDialog
        open={!!accessPrompt}
        onOpenChange={(v) => {
          if (!v) {
            setAccessPrompt(null);
            onOpenChange(false);
          }
        }}
        studentId={accessPrompt.studentId}
        studentName={accessPrompt.studentName}
        defaultEmail={accessPrompt.defaultEmail}
        onCreated={() => {
          setAccessPrompt(null);
          onOpenChange(false);
        }}
      />
    )}
    </>
  );
};