import type { SupabaseClient } from "@supabase/supabase-js";
import {
  chargeRuleDueDateForPeriodIndex,
  type ChargeRuleBillingShape,
} from "@/lib/finance/chargeRuleBillingPeriod";
import { domainChargeRpcName } from "@/lib/finance/chargeRulePeriods";

/** Período até ao mês corrente (inclusive), alinhado com charge_rule_period_is_due_now. */
export function isBillingPeriodDueNow(dueIso: string, generateAllUpfront: boolean): boolean {
  if (generateAllUpfront) return true;
  const due = new Date(`${dueIso}T12:00:00`);
  const today = new Date();
  const dueAbs = due.getFullYear() * 12 + due.getMonth();
  const todayAbs = today.getFullYear() * 12 + today.getMonth();
  return dueAbs <= todayAbs;
}

type TuitionBackfillRule = ChargeRuleBillingShape & {
  id: string;
  generate_all_upfront: boolean;
};

/** Fallback no cliente: gera cobranças em atraso período a período. */
export async function backfillTuitionFeesForRuleClient(
  supabase: SupabaseClient,
  rule: TuitionBackfillRule,
  academicYearId: string,
  academicYearStartDate: string | null | undefined,
  studentIds: string[],
): Promise<number> {
  if (!academicYearStartDate?.trim() || studentIds.length === 0) return 0;

  let total = 0;
  for (const studentId of studentIds) {
    for (let periodIndex = 0; periodIndex < rule.months_count; periodIndex++) {
      const period = chargeRuleDueDateForPeriodIndex(rule, academicYearStartDate, periodIndex);
      if (!period) continue;
      if (!isBillingPeriodDueNow(period.dueIso, rule.generate_all_upfront)) continue;

      const { data, error } = await supabase.rpc("generate_student_fee_for_rule_period", {
        _student_id: studentId,
        _academic_year_id: academicYearId,
        _fee_rule_id: rule.id,
        _period_index: periodIndex,
      });
      if (error) continue;
      const created = typeof data === "number" ? data : Number(data);
      if (Number.isFinite(created) && created > 0) total += created;
    }
  }
  return total;
}

type DomainBackfillRule = ChargeRuleBillingShape & {
  id: string;
  generate_all_upfront: boolean;
};

export async function backfillDomainFeesForRuleClient(
  supabase: SupabaseClient,
  variant: "activity" | "transport" | "meal",
  rule: DomainBackfillRule,
  academicYearId: string,
  academicYearStartDate: string | null | undefined,
  studentIds: string[],
): Promise<number> {
  if (!academicYearStartDate?.trim() || studentIds.length === 0) return 0;

  const rpcName = domainChargeRpcName(variant);
  let total = 0;
  for (const studentId of studentIds) {
    for (let periodIndex = 0; periodIndex < rule.months_count; periodIndex++) {
      const period = chargeRuleDueDateForPeriodIndex(rule, academicYearStartDate, periodIndex);
      if (!period) continue;
      if (!isBillingPeriodDueNow(period.dueIso, rule.generate_all_upfront)) continue;

      const { data, error } = await supabase.rpc(rpcName, {
        _student_id: studentId,
        _academic_year_id: academicYearId,
        _charge_rule_id: rule.id,
        _period_index: periodIndex,
      });
      if (error) continue;
      const created = typeof data === "number" ? data : Number(data);
      if (Number.isFinite(created) && created > 0) total += created;
    }
  }
  return total;
}
