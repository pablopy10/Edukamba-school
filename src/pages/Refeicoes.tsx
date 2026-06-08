import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Utensils, Plus, Pencil, Trash2, Users, FileSignature } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { NativeMobileFabPortal } from "@/components/dashboard/NativeMobileFabPortal";
import { isNativeMobileApp, NATIVE_MOBILE_FAB_BUTTON_CLASSNAME } from "@/lib/nativeApp";
import { cn } from "@/lib/utils";
import { effectiveSchoolIdFromProfile } from "@/lib/effectiveTenant";
import { canValidateSchoolPaymentProofs, isSchoolManagementRole } from "@/lib/schoolStaffRoles";
import { useParentChildren } from "@/hooks/useParentChildren";
import { PagamentosFinanceHub } from "@/pages/Pagamentos";
import { DomainChargeRulesPanel } from "@/components/finance/DomainChargeRulesPanel";
import { useHomeroomStudentIds } from "@/hooks/useHomeroomStudentIds";
import { ModuleAuthorizationsPanel } from "@/components/authorizations/ModuleAuthorizationsPanel";

type MealProgramRow = {
  id: string;
  school_id: string;
  name: string;
  academic_year_id: string | null;
  default_monthly_fee: number;
  is_active: boolean;
};

type MealEnrollmentRow = {
  id: string;
  meal_program_id: string;
  student_id: string;
  school_id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  monthly_fee_override: number | null;
  notes: string | null;
  student?: { full_name: string; classroom_id: string | null };
  meal_program?: { name: string } | null;
};

const Refeicoes = () => {
  const { t, i18n } = useTranslation("pages", { keyPrefix: "refeicoes" });
  const locale = i18n.language?.startsWith("fr") ? "fr-FR" : i18n.language?.startsWith("en") ? "en-GB" : "pt-PT";
  const [searchParams] = useSearchParams();
  const native = isNativeMobileApp();
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [programs, setPrograms] = useState<MealProgramRow[]>([]);
  const [years, setYears] = useState<Array<{ id: string; label: string; is_active: boolean | null }>>([]);
  const [enrollments, setEnrollments] = useState<MealEnrollmentRow[]>([]);
  const [students, setStudents] = useState<Array<{ id: string; full_name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"regras" | "inscricoes" | "pagamentos" | "autorizacoes">("inscricoes");

  const [progOpen, setProgOpen] = useState(false);
  const [editProg, setEditProg] = useState<MealProgramRow | null>(null);
  const [deleteProgId, setDeleteProgId] = useState<string | null>(null);
  const [progForm, setProgForm] = useState({
    name: "",
    academic_year_id: "",
    default_monthly_fee: "0",
    is_active: true,
  });

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [editEnroll, setEditEnroll] = useState<MealEnrollmentRow | null>(null);
  const [deleteEnrollId, setDeleteEnrollId] = useState<string | null>(null);
  const [enrollForm, setEnrollForm] = useState({
    student_id: "",
    meal_program_id: "",
    notes: "",
    status: "ACTIVE",
  });

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("school_id, support_context_school_id, role")
        .eq("id", user.id)
        .maybeSingle();
      const sid = effectiveSchoolIdFromProfile(profile);
      if (sid) {
        setSchoolId(sid);
        setRole(profile?.role ?? null);
      }
    };
    void init();
  }, []);

  useEffect(() => {
    if (searchParams.get("tab") === "autorizacoes") {
      setTab("autorizacoes");
    }
  }, [searchParams]);

  const loadAll = async () => {
    if (!schoolId) return;
    setLoading(true);
    const [yRes, pRes, eRes, sRes] = await Promise.all([
      supabase.from("academic_years").select("id, label, is_active").eq("school_id", schoolId).order("start_date", { ascending: true }),
      supabase.from("meal_programs").select("*").eq("school_id", schoolId).order("name"),
      supabase
        .from("meal_enrollments")
        .select("*, student:students(full_name, classroom_id), meal_program:meal_programs(name)")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false }),
      supabase.from("students").select("id, full_name").eq("school_id", schoolId).order("full_name"),
    ]);
    setYears((yRes.data ?? []) as typeof years);
    setPrograms((pRes.data ?? []) as MealProgramRow[]);
    setEnrollments((eRes.data ?? []) as MealEnrollmentRow[]);
    setStudents((sRes.data ?? []) as Array<{ id: string; full_name: string }>);
    setLoading(false);
  };

  useEffect(() => {
    if (schoolId) void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const canManageMealFinance = canValidateSchoolPaymentProofs(role);
  const canManageAuthorizations = isSchoolManagementRole(role);
  const canDeleteEnrollment = role === "ADMIN" || role === "SUPER_ADMIN";
  const isParent = role === "PARENT";
  /** Inserção na BD: ADMIN, SUPER_ADMIN, TEACHER, PARENT (política própria). */
  const canEnroll =
    role === "TEACHER" || isParent || role === "ADMIN" || role === "SUPER_ADMIN";
  const { childIds } = useParentChildren();
  const { ids: homeroomStudentIds } = useHomeroomStudentIds(schoolId, role, userId);

  const visibleEnrollments = useMemo(() => {
    let list = enrollments;
    if (isParent) list = list.filter((e) => childIds.includes(e.student_id));
    if (role === "TEACHER") {
      if (homeroomStudentIds.length === 0) return [];
      list = list.filter((e) => homeroomStudentIds.includes(e.student_id));
    }
    return list;
  }, [enrollments, isParent, childIds, role, homeroomStudentIds]);

  const enrollStudentOptions = useMemo(() => {
    if (isParent) return students.filter((s) => childIds.includes(s.id));
    if (role === "TEACHER") return students.filter((s) => homeroomStudentIds.includes(s.id));
    return students;
  }, [students, isParent, childIds, role, homeroomStudentIds]);

  const openNewProgram = () => {
    setEditProg(null);
    setProgForm({
      name: "",
      academic_year_id: "",
      default_monthly_fee: "0",
      is_active: true,
    });
    setProgOpen(true);
  };

  const openEditProgram = (p: MealProgramRow) => {
    setEditProg(p);
    setProgForm({
      name: p.name,
      academic_year_id: p.academic_year_id ?? "",
      default_monthly_fee: String(p.default_monthly_fee ?? 0),
      is_active: p.is_active,
    });
    setProgOpen(true);
  };

  const saveProgram = async () => {
    if (!canManageMealFinance) return;
    if (!schoolId || !progForm.name.trim()) {
      toast.error(t("toast_program_name"));
      return;
    }
    const payload = {
      school_id: schoolId,
      name: progForm.name.trim(),
      academic_year_id: progForm.academic_year_id.trim() || null,
      default_monthly_fee: Number(progForm.default_monthly_fee) || 0,
      is_active: progForm.is_active,
    };
    if (editProg) {
      const { error } = await supabase.from("meal_programs").update(payload).eq("id", editProg.id);
      if (error) toast.error(error.message);
      else toast.success(t("toast_program_updated"));
    } else {
      const { error } = await supabase.from("meal_programs").insert(payload);
      if (error) toast.error(error.message);
      else toast.success(t("toast_program_created"));
    }
    setProgOpen(false);
    loadAll();
  };

  const handleDeleteProgram = async () => {
    if (!deleteProgId) return;
    const { error } = await supabase.from("meal_programs").delete().eq("id", deleteProgId);
    if (error) toast.error(error.message);
    else toast.success(t("toast_program_removed"));
    setDeleteProgId(null);
    loadAll();
  };

  const openNewEnroll = () => {
    setEditEnroll(null);
    setEnrollForm({
      student_id: "",
      meal_program_id: programs[0]?.id ?? "",
      notes: "",
      status: "ACTIVE",
    });
    setEnrollOpen(true);
  };

  const openEditEnroll = (e: MealEnrollmentRow) => {
    setEditEnroll(e);
    setEnrollForm({
      student_id: e.student_id,
      meal_program_id: e.meal_program_id,
      notes: e.notes ?? "",
      status: e.status || "ACTIVE",
    });
    setEnrollOpen(true);
  };

  const saveEnrollment = async () => {
    if (!schoolId || !enrollForm.student_id || !enrollForm.meal_program_id) {
      toast.error(t("toast_select_student_plan"));
      return;
    }
    const row = {
      school_id: schoolId,
      student_id: enrollForm.student_id,
      meal_program_id: enrollForm.meal_program_id,
      start_date: editEnroll?.start_date ?? new Date().toISOString().slice(0, 10),
      end_date: null,
      monthly_fee_override: null,
      notes: enrollForm.notes.trim() || null,
      status: enrollForm.status,
    };
    if (editEnroll) {
      const { error } = await supabase.from("meal_enrollments").update(row).eq("id", editEnroll.id);
      if (error) toast.error(error.message);
      else toast.success(t("toast_enrollment_updated"));
    } else {
      const { error } = await supabase.from("meal_enrollments").insert(row);
      if (error) toast.error(error.message);
      else toast.success(t("toast_enrollment_created"));
    }
    setEnrollOpen(false);
    loadAll();
  };

  const handleDeleteEnroll = async () => {
    if (!deleteEnrollId) return;
    const { error } = await supabase.from("meal_enrollments").delete().eq("id", deleteEnrollId);
    if (error) toast.error(error.message);
    else toast.success(t("toast_enrollment_removed"));
    setDeleteEnrollId(null);
    loadAll();
  };

  const enrollmentColSpan = canManageMealFinance || role === "TEACHER" ? 5 : 4;

  return (
    <>
      <div
        className={cn(
          "flex flex-col gap-6",
          native && canEnroll && tab === "inscricoes" && "relative pb-28",
        )}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-foreground">
              <Utensils className="h-8 w-8 text-primary" />
              {t("title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
          {canEnroll && !native && tab === "inscricoes" && (
            <Button onClick={openNewEnroll} disabled={programs.length === 0}>
              <Plus className="mr-2 h-4 w-4" /> {t("enroll_student")}
            </Button>
          )}
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full">
          <TabsList className="flex h-auto w-full flex-wrap gap-1">
            {!isParent && <TabsTrigger value="regras">{t("tab_rules")}</TabsTrigger>}
            <TabsTrigger value="inscricoes">
              <Users className="mr-2 h-4 w-4" />
              {t("tab_enrollments")}
            </TabsTrigger>
            <TabsTrigger value="pagamentos">{t("tab_payments")}</TabsTrigger>
            <TabsTrigger value="autorizacoes">
              <FileSignature className="mr-2 h-4 w-4" />
              {t("tab_authorizations")}
            </TabsTrigger>
          </TabsList>

          {!isParent && (
            <TabsContent value="regras" className="mt-4 space-y-6">
              {canManageMealFinance && (
                <Card className="p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">{t("programs_title")}</h2>
                      <p className="text-sm text-muted-foreground">{t("programs_hint")}</p>
                    </div>
                    <Button type="button" onClick={openNewProgram}>
                      <Plus className="mr-2 h-4 w-4" /> {t("new_program")}
                    </Button>
                  </div>
                  {loading ? (
                    <p className="mt-4 text-sm text-muted-foreground">{t("loading")}</p>
                  ) : programs.length === 0 ? (
                    <p className="mt-4 text-sm text-muted-foreground">{t("no_programs")}</p>
                  ) : (
                    <Table className="mt-4">
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("col_name")}</TableHead>
                          <TableHead>{t("col_base_fee")}</TableHead>
                          <TableHead>{t("col_status")}</TableHead>
                          {canManageMealFinance ? <TableHead className="text-right">{t("col_actions")}</TableHead> : null}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {programs.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell>{Number(p.default_monthly_fee ?? 0).toLocaleString(locale)}</TableCell>
                            <TableCell>
                              <Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? t("status_active") : t("status_inactive")}</Badge>
                            </TableCell>
                            {canManageMealFinance ? (
                              <TableCell className="text-right">
                                <Button size="sm" variant="ghost" onClick={() => openEditProgram(p)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteProgId(p.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            ) : null}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </Card>
              )}
              <DomainChargeRulesPanel variant="meal" schoolId={schoolId} role={role} />
            </TabsContent>
          )}

          <TabsContent value="inscricoes" className="mt-4">
            {role === "TEACHER" && homeroomStudentIds.length === 0 && (
              <p className="mb-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                {t("teacher_homeroom_hint")}
              </p>
            )}
            <div className="mb-4">
              <h2 className="text-lg font-semibold">{t("enrollments_title")}</h2>
            </div>
            {loading ? (
              <p className="text-muted-foreground">{t("loading")}</p>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("col_student")}</TableHead>
                      <TableHead>{t("col_plan")}</TableHead>
                      <TableHead>{t("col_start")}</TableHead>
                      <TableHead>{t("col_status")}</TableHead>
                      {(canManageMealFinance || role === "TEACHER") && (
                        <TableHead className="text-right">{t("col_actions")}</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleEnrollments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={enrollmentColSpan} className="py-8 text-center text-muted-foreground">
                          {t("no_enrollments")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      visibleEnrollments.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="font-medium">{e.student?.full_name ?? t("em_dash")}</TableCell>
                          <TableCell>{e.meal_program?.name ?? t("em_dash")}</TableCell>
                          <TableCell>{e.start_date}</TableCell>
                          <TableCell>
                            <Badge variant={e.status === "ACTIVE" ? "default" : "secondary"}>{e.status === "ACTIVE" ? t("status_active") : e.status}</Badge>
                          </TableCell>
                          {(canManageMealFinance || role === "TEACHER") && (
                            <TableCell className="text-right">
                              <Button size="sm" variant="outline" onClick={() => openEditEnroll(e)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {canDeleteEnrollment && (
                                <Button size="sm" variant="outline" className="ml-1 text-destructive" onClick={() => setDeleteEnrollId(e.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="pagamentos" className="mt-4">
            <PagamentosFinanceHub financePage="mealCharges" />
          </TabsContent>

          <TabsContent value="autorizacoes" className="mt-4">
            <ModuleAuthorizationsPanel
              module="meal"
              schoolId={schoolId}
              userId={userId}
              role={role}
              isParent={isParent}
              childIds={childIds}
              canManageTemplates={canManageAuthorizations}
            />
          </TabsContent>
        </Tabs>
      </div>

      {canEnroll && native && tab === "inscricoes" && (
        <NativeMobileFabPortal>
          <Button
            type="button"
            className={cn("gap-2 rounded-full shadow-lg", NATIVE_MOBILE_FAB_BUTTON_CLASSNAME)}
            onClick={openNewEnroll}
            disabled={programs.length === 0}
          >
            <Plus className="h-5 w-5" /> {t("enroll_short")}
          </Button>
        </NativeMobileFabPortal>
      )}

      <Dialog open={progOpen} onOpenChange={setProgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editProg ? t("program_dialog_edit") : t("program_dialog_new")}</DialogTitle>
            <DialogDescription>{t("program_dialog_desc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>{t("program_name")}</Label>
              <Input value={progForm.name} onChange={(e) => setProgForm({ ...progForm, name: e.target.value })} placeholder={t("program_name_placeholder")} />
            </div>
            <div className="grid gap-2">
              <Label>{t("program_year")}</Label>
              <Select value={progForm.academic_year_id || "__none"} onValueChange={(v) => setProgForm({ ...progForm, academic_year_id: v === "__none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder={t("program_year_placeholder")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">{t("program_year_none")}</SelectItem>
                  {years.map((y) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.label}{y.is_active ? t("program_year_active_suffix") : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t("program_monthly_fee")}</Label>
              <Input type="number" min={0} value={progForm.default_monthly_fee} onChange={(e) => setProgForm({ ...progForm, default_monthly_fee: e.target.value })} />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="meal-prog-active"
                checked={progForm.is_active}
                onCheckedChange={(c) => setProgForm({ ...progForm, is_active: !!c })}
              />
              <Label htmlFor="meal-prog-active" className="font-normal text-muted-foreground">
                {t("program_active")}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProgOpen(false)}>{t("cancel")}</Button>
            <Button onClick={() => void saveProgram()}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editEnroll ? t("enrollment_dialog_edit") : t("enrollment_dialog_new")}</DialogTitle>
            <DialogDescription>{t("enrollment_dialog_desc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>{t("enrollment_student")}</Label>
              <Select
                value={enrollForm.student_id}
                onValueChange={(v) => setEnrollForm({ ...enrollForm, student_id: v })}
                disabled={!!editEnroll && (role === "TEACHER" || isParent)}
              >
                <SelectTrigger><SelectValue placeholder={t("select_placeholder")} /></SelectTrigger>
                <SelectContent>
                  {enrollStudentOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t("enrollment_plan")}</Label>
              <Select value={enrollForm.meal_program_id} onValueChange={(v) => setEnrollForm({ ...enrollForm, meal_program_id: v })}>
                <SelectTrigger><SelectValue placeholder={t("plan_placeholder")} /></SelectTrigger>
                <SelectContent>
                  {programs.filter((p) => p.is_active).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t("enrollment_notes")}</Label>
              <Input value={enrollForm.notes} onChange={(e) => setEnrollForm({ ...enrollForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollOpen(false)}>{t("cancel")}</Button>
            <Button onClick={() => void saveEnrollment()}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteProgId} onOpenChange={(o) => !o && setDeleteProgId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirm_delete_program_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirm_delete_program_desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDeleteProgram()}>{t("delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteEnrollId} onOpenChange={(o) => !o && setDeleteEnrollId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirm_delete_enrollment_title")}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDeleteEnroll()}>{t("remove")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default Refeicoes;
