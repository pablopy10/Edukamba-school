export type FeeRecurrence = "monthly" | "quarterly" | "semester" | "yearly";

export type ChargeRulePeriodShape = {
  start_month: number;
  due_day: number;
  recurrence: string;
  months_count: number;
  end_month?: number | null;
  academic_year_id?: string | null;
  target_scope: string;
  monthly_amount: number;
};

export type DomainChargeRuleRow = ChargeRulePeriodShape & {
  id: string;
  activity_id?: string;
  route_id?: string;
  meal_program_id?: string;
  activity_charge_rule_classrooms?: { classroom_id: string }[] | null;
  activity_charge_rule_students?: { student_id: string }[] | null;
  transport_charge_rule_classrooms?: { classroom_id: string }[] | null;
  transport_charge_rule_students?: { student_id: string }[] | null;
  meal_charge_rule_classrooms?: { classroom_id: string }[] | null;
  meal_charge_rule_students?: { student_id: string }[] | null;
};

export type StudentLite = { id: string; full_name: string; classroom_id: string | null };
export type ClassroomLite = { id: string; name: string; academic_year_id?: string | null };

export type DomainFeeLite = {
  id: string;
  student_id: string;
  academic_year_id: string | null;
  month_index: number | null;
  due_date: string;
  amount_due: number;
  is_paid: boolean;
};

function recurrenceStepMonths(r: FeeRecurrence): number {
  if (r === "quarterly") return 3;
  if (r === "semester") return 6;
  if (r === "yearly") return 12;
  return 1;
}

/** Data de vencimento e índice de mês civil (1–12), alinhado com as RPCs de geração. */
export function chargeRuleDueDateForPeriodIndex(
  rule: Pick<ChargeRulePeriodShape, "start_month" | "due_day" | "recurrence" | "months_count">,
  academicYearStartDate: string | null | undefined,
  periodIndex: number,
): { monthIndex: number; dueIso: string } | null {
  if (!academicYearStartDate?.trim() || periodIndex < 0 || periodIndex >= rule.months_count) return null;
  const step = recurrenceStepMonths((rule.recurrence as FeeRecurrence) || "monthly");
  const im = periodIndex * step;
  const monthIdx = ((rule.start_month - 1 + im) % 12) + 1;
  const m = /^(\d{4})-\d{2}-\d{2}/.exec(academicYearStartDate);
  const startYear = m ? Number(m[1]) : new Date().getFullYear();
  const yearPart = startYear + Math.floor((rule.start_month - 1 + im) / 12);
  const day = Math.min(Number(rule.due_day) || 10, 28);
  const dueIso = `${yearPart}-${String(monthIdx).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { monthIndex: monthIdx, dueIso };
}

/** Alunos inscritos abrangidos pela regra (pré-visualização; a RPC valida prioridade). */
export function studentsMatchingDomainChargeRule(
  rule: DomainChargeRuleRow,
  yearId: string,
  enrolledStudentIds: Set<string>,
  studentList: StudentLite[],
  roomList: ClassroomLite[],
): StudentLite[] {
  if (rule.academic_year_id && rule.academic_year_id !== yearId) return [];

  const yearClsIds = new Set(roomList.filter((c) => c.academic_year_id === yearId).map((c) => c.id));
  const ts = rule.target_scope || "all_enrolled";
  const enrolled = studentList.filter((s) => enrolledStudentIds.has(s.id));

  if (ts === "students") {
    const allow = new Set(
      (rule.activity_charge_rule_students ??
        rule.transport_charge_rule_students ??
        rule.meal_charge_rule_students ??
        []
      ).map((x) => x.student_id),
    );
    return enrolled.filter((s) => allow.has(s.id));
  }

  if (ts === "classrooms") {
    const allowCls = new Set(
      (rule.activity_charge_rule_classrooms ??
        rule.transport_charge_rule_classrooms ??
        rule.meal_charge_rule_classrooms ??
        []
      ).map((x) => x.classroom_id),
    );
    return enrolled.filter(
      (s) => !!(s.classroom_id && allowCls.has(s.classroom_id) && yearClsIds.has(s.classroom_id)),
    );
  }

  return enrolled;
}

export function findDomainFeeForPeriod(
  fees: DomainFeeLite[],
  studentId: string,
  yearId: string,
  monthIndex: number,
): DomainFeeLite | null {
  const hits = fees.filter(
    (f) =>
      f.student_id === studentId &&
      f.academic_year_id === yearId &&
      f.month_index === monthIndex,
  );
  if (hits.length === 0) return null;
  return hits.sort((a, b) => b.due_date.localeCompare(a.due_date))[0] ?? null;
}

export function domainChargeRpcName(
  variant: "activity" | "transport" | "meal",
): "generate_activity_fee_for_rule_period" | "generate_transport_fee_for_rule_period" | "generate_meal_fee_for_rule_period" {
  if (variant === "activity") return "generate_activity_fee_for_rule_period";
  if (variant === "transport") return "generate_transport_fee_for_rule_period";
  return "generate_meal_fee_for_rule_period";
}
