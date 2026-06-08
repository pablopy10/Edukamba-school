export type FeeRecurrence = "monthly" | "quarterly" | "semester" | "yearly";

export {
  chargeRuleDueDateForPeriodIndex,
  countBillingPeriodsFromMonthKeys,
  billingMonthKeysFromRule,
  defaultBillingMonthKeys,
  formatBillingPeriodRange,
  rulePeriodPayloadFromMonthKeys,
  type ChargeRuleBillingShape,
} from "@/lib/finance/chargeRuleBillingPeriod";

export type ChargeRulePeriodShape = {
  start_month: number;
  due_day: number;
  recurrence: string;
  months_count: number;
  end_month?: number | null;
  billing_start_date?: string | null;
  billing_end_date?: string | null;
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

/** Alunos inscritos abrangidos pela regra (pré-visualização; a RPC valida prioridade). */
export function chargeRuleEntityId(rule: DomainChargeRuleRow): string | null {
  if (rule.activity_id) return rule.activity_id;
  if (rule.route_id) return rule.route_id;
  if (rule.meal_program_id) return rule.meal_program_id;
  return null;
}

function ruleTargetsStudent(rule: DomainChargeRuleRow, student: StudentLite, roomList: ClassroomLite[]): boolean {
  const ts = rule.target_scope || "all_enrolled";
  if (ts === "students") {
    const allow = new Set(
      (rule.activity_charge_rule_students ?? rule.transport_charge_rule_students ?? rule.meal_charge_rule_students ?? []).map(
        (x) => x.student_id,
      ),
    );
    return allow.has(student.id);
  }

  if (ts === "classrooms") {
    if (!student.classroom_id) return false;
    const allowCls = new Set(
      (rule.activity_charge_rule_classrooms ?? rule.transport_charge_rule_classrooms ?? rule.meal_charge_rule_classrooms ?? []).map(
        (x) => x.classroom_id,
      ),
    );
    return allowCls.has(student.classroom_id);
  }

  return false;
}

function chooseBestRuleForStudent(
  rules: DomainChargeRuleRow[],
  student: StudentLite,
  yearId: string,
  roomList: ClassroomLite[],
): DomainChargeRuleRow | null {
  const studentRules = rules.filter(
    (r) => r.target_scope === "students" && ruleTargetsStudent(r, student, roomList),
  );
  if (studentRules.length > 0) {
    return studentRules.find((r) => r.academic_year_id === yearId) ?? studentRules[0];
  }

  const classroomRules = rules.filter(
    (r) => r.target_scope === "classrooms" && ruleTargetsStudent(r, student, roomList),
  );
  if (classroomRules.length > 0) {
    return classroomRules.find((r) => r.academic_year_id === yearId) ?? classroomRules[0];
  }

  const allRules = rules.filter((r) => r.target_scope === "all_enrolled");
  if (allRules.length > 0) {
    return allRules.find((r) => r.academic_year_id === yearId) ?? allRules[0];
  }

  return null;
}

export function studentsMatchingDomainChargeRule(
  rule: DomainChargeRuleRow,
  yearId: string,
  enrolledStudentIds: Set<string>,
  studentList: StudentLite[],
  roomList: ClassroomLite[],
  allRules: DomainChargeRuleRow[],
): StudentLite[] {
  if (rule.academic_year_id && rule.academic_year_id !== yearId) return [];

  const yearClsIds = new Set(roomList.filter((c) => c.academic_year_id === yearId).map((c) => c.id));
  const ts = rule.target_scope || "all_enrolled";
  const enrolled = studentList.filter((s) => enrolledStudentIds.has(s.id));
  const entityId = chargeRuleEntityId(rule);
  if (!entityId) return [];

  const sameEntityRules = allRules.filter(
    (r) => chargeRuleEntityId(r) === entityId && (r.academic_year_id === yearId || r.academic_year_id == null),
  );

  const studentsForRule = enrolled.filter((student) => {
    if (ts === "students") {
      if (!ruleTargetsStudent(rule, student, roomList)) return false;
    } else if (ts === "classrooms") {
      if (!ruleTargetsStudent(rule, student, roomList) || !student.classroom_id || !yearClsIds.has(student.classroom_id)) return false;
    }

    const winner = chooseBestRuleForStudent(sameEntityRules, student, yearId, roomList);
    return winner?.id === rule.id;
  });

  if (ts === "all_enrolled") return studentsForRule;
  return studentsForRule;
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
