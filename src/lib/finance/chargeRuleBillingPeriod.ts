export type FeeRecurrence = "monthly" | "quarterly" | "semester" | "yearly";

export type AcademicYearDates = {
  start_date?: string | null;
  end_date?: string | null;
};

export type ChargeRuleBillingShape = {
  start_month: number;
  end_month?: number | null;
  billing_start_date?: string | null;
  billing_end_date?: string | null;
  recurrence: string;
  due_day: number;
  months_count: number;
};

export function recurrenceStepMonths(r: FeeRecurrence): number {
  if (r === "quarterly") return 3;
  if (r === "semester") return 6;
  if (r === "yearly") return 12;
  return 1;
}

/** Converte "YYYY-MM" ou "YYYY-MM-DD" para chave "YYYY-MM". */
export function toBillingMonthKey(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const m = /^(\d{4})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${m[1]}-${m[2]}`;
}

/** Primeiro dia do mês (YYYY-MM-01). */
export function monthKeyToBillingDate(monthKey: string): string | null {
  const key = toBillingMonthKey(monthKey);
  return key ? `${key}-01` : null;
}

function monthKeyToAbsolute(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  return y * 12 + (m - 1);
}

function absoluteToMonthKey(abs: number): string {
  const y = Math.floor(abs / 12);
  const m = (abs % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Número de períodos entre dois meses (inclusive), conforme a recorrência. */
export function countBillingPeriodsFromMonthKeys(
  startKey: string,
  endKey: string,
  recurrence: FeeRecurrence,
): number {
  const start = toBillingMonthKey(startKey);
  const end = toBillingMonthKey(endKey);
  if (!start || !end) return 1;
  const step = recurrenceStepMonths(recurrence);
  const startAbs = monthKeyToAbsolute(start);
  const endAbs = monthKeyToAbsolute(end);
  if (endAbs < startAbs) return 1;
  let count = 0;
  for (let m = startAbs; m <= endAbs; m += step) count += 1;
  return Math.max(1, Math.min(36, count));
}

/** Legado: infere mês/ano a partir de start_month e ano letivo. */
export function legacyBillingStartMonthKey(
  startMonth: number,
  academicYear?: AcademicYearDates | null,
): string {
  const m = academicYear?.start_date?.match(/^(\d{4})-(\d{2})/);
  let year = m ? Number(m[1]) : new Date().getFullYear();
  const ayStartMonth = m ? Number(m[2]) : 9;
  const sm = Math.max(1, Math.min(12, startMonth || ayStartMonth));
  if (sm < ayStartMonth) year += 1;
  return `${year}-${String(sm).padStart(2, "0")}`;
}

export function legacyBillingEndMonthKey(startKey: string, endMonth: number): string {
  const start = toBillingMonthKey(startKey);
  if (!start) return startKey;
  const [sy, sm] = start.split("-").map(Number);
  const em = Math.max(1, Math.min(12, endMonth || sm));
  let year = sy;
  if (em < sm) year += 1;
  return `${year}-${String(em).padStart(2, "0")}`;
}

export function billingMonthKeysFromRule(
  rule: Pick<ChargeRuleBillingShape, "start_month" | "end_month" | "billing_start_date" | "billing_end_date">,
  academicYear?: AcademicYearDates | null,
): { start: string; end: string } {
  const startFromDb = toBillingMonthKey(rule.billing_start_date);
  const endFromDb = toBillingMonthKey(rule.billing_end_date);
  if (startFromDb && endFromDb) {
    return { start: startFromDb, end: endFromDb };
  }
  const start = startFromDb ?? legacyBillingStartMonthKey(rule.start_month, academicYear);
  const end =
    endFromDb ?? legacyBillingEndMonthKey(start, rule.end_month ?? rule.start_month);
  return { start, end };
}

export function defaultBillingMonthKeys(academicYear?: AcademicYearDates | null): {
  start: string;
  end: string;
} {
  const startKey = toBillingMonthKey(academicYear?.start_date) ?? legacyBillingStartMonthKey(9, academicYear);
  const endKey = toBillingMonthKey(academicYear?.end_date) ?? legacyBillingEndMonthKey(startKey, 6);
  return { start: startKey, end: endKey };
}

export function rulePeriodPayloadFromMonthKeys(
  startKey: string,
  endKey: string,
  recurrence: FeeRecurrence,
): {
  billing_start_date: string;
  billing_end_date: string;
  start_month: number;
  end_month: number;
  months_count: number;
} {
  const start = toBillingMonthKey(startKey) ?? startKey;
  const end = toBillingMonthKey(endKey) ?? endKey;
  const [, sm] = start.split("-").map(Number);
  const [, em] = end.split("-").map(Number);
  return {
    billing_start_date: monthKeyToBillingDate(start)!,
    billing_end_date: monthKeyToBillingDate(end)!,
    start_month: sm,
    end_month: em,
    months_count: countBillingPeriodsFromMonthKeys(start, end, recurrence),
  };
}

/** Data de vencimento e índice de mês civil (1–12), alinhado com as RPCs. */
export function chargeRuleDueDateForPeriodIndex(
  rule: Pick<
    ChargeRuleBillingShape,
    "billing_start_date" | "start_month" | "due_day" | "recurrence" | "months_count"
  >,
  academicYearStartDate: string | null | undefined,
  periodIndex: number,
): { monthIndex: number; dueIso: string } | null {
  if (periodIndex < 0 || periodIndex >= rule.months_count) return null;
  const step = recurrenceStepMonths((rule.recurrence as FeeRecurrence) || "monthly");
  const dueDay = Math.min(Math.max(Number(rule.due_day) || 10, 1), 28);

  const billingStart = toBillingMonthKey(rule.billing_start_date);
  if (billingStart) {
    const [sy, sm] = billingStart.split("-").map(Number);
    const abs = sy * 12 + (sm - 1) + periodIndex * step;
    const yearPart = Math.floor(abs / 12);
    const monthIdx = (abs % 12) + 1;
    const dueIso = `${yearPart}-${String(monthIdx).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;
    return { monthIndex: monthIdx, dueIso };
  }

  if (!academicYearStartDate?.trim()) return null;
  const im = periodIndex * step;
  const monthIdx = ((rule.start_month - 1 + im) % 12) + 1;
  const m = /^(\d{4})-\d{2}-\d{2}/.exec(academicYearStartDate);
  const startYear = m ? Number(m[1]) : new Date().getFullYear();
  const yearPart = startYear + Math.floor((rule.start_month - 1 + im) / 12);
  const dueIso = `${yearPart}-${String(monthIdx).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;
  return { monthIndex: monthIdx, dueIso };
}

export function formatBillingPeriodRange(
  startKey: string,
  endKey: string,
  monthLabels: readonly string[],
  locale?: string,
): string {
  const fmt = (key: string) => {
    const k = toBillingMonthKey(key);
    if (!k) return key;
    const [y, m] = k.split("-").map(Number);
    const label = monthLabels[m - 1] ?? String(m);
    try {
      return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(
        new Date(y, m - 1, 1),
      );
    } catch {
      return `${label} ${y}`;
    }
  };
  return `${fmt(startKey)} → ${fmt(endKey)}`;
}
