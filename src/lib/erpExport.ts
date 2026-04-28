import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ErpHeaderDefaults = {
  student_id: string;
  student_name: string;
  tax_id: string;
  amount_paid: string;
  payment_date: string;
  article_code: string;
  payment_method: string;
};

export const ERP_HEADER_DEFAULTS: ErpHeaderDefaults = {
  student_id: "ID_Aluno",
  student_name: "Nome_Aluno",
  tax_id: "NIF",
  amount_paid: "Valor_Pago",
  payment_date: "Data_Pagamento",
  article_code: "Codigo_Artigo",
  payment_method: "Metodo_Pagamento",
};

export type ErpConfigFields = {
  header_student_id: string | null;
  header_student_name: string | null;
  header_tax_id: string | null;
  header_amount_paid: string | null;
  header_payment_date: string | null;
  header_article_code: string | null;
  header_payment_method: string | null;
  default_article_code_propina: string | null;
};

export function resolveErpHeaders(cfg: ErpConfigFields | null): ErpHeaderDefaults {
  const trimOr = (v: string | null | undefined, d: string) => {
    const t = v?.trim();
    return t ? t : d;
  };
  const base = ERP_HEADER_DEFAULTS;
  return {
    student_id: trimOr(cfg?.header_student_id, base.student_id),
    student_name: trimOr(cfg?.header_student_name, base.student_name),
    tax_id: trimOr(cfg?.header_tax_id, base.tax_id),
    amount_paid: trimOr(cfg?.header_amount_paid, base.amount_paid),
    payment_date: trimOr(cfg?.header_payment_date, base.payment_date),
    article_code: trimOr(cfg?.header_article_code, base.article_code),
    payment_method: trimOr(cfg?.header_payment_method, base.payment_method),
  };
}

type PaymentRow = Pick<
  Database["public"]["Tables"]["payments"]["Row"],
  | "id"
  | "amount_paid"
  | "method"
  | "payment_date"
  | "erp_exported_at"
  | "student_fee_id"
  | "activity_fee_id"
  | "transport_fee_id"
  | "enrollment_fee_id"
>;

type StudentMini = {
  id: string;
  full_name: string;
  tax_id: string | null;
  enrollment_number: string | null;
};

function articleCodeForPayment(
  p: PaymentRow,
  propinaDefault: string,
  activityCodeByFeeId: Map<string, string>,
  enrollmentTypeByFeeId: Map<string, "NEW" | "RENEWAL">,
): string {
  if (p.student_fee_id) return propinaDefault || "PROPINA";
  if (p.activity_fee_id) return activityCodeByFeeId.get(p.activity_fee_id) ?? "EXTRA";
  if (p.transport_fee_id) return "TRANSPORTE";
  if (p.enrollment_fee_id) {
    const t = enrollmentTypeByFeeId.get(p.enrollment_fee_id);
    return t === "RENEWAL" ? "MATRICULA_RENOV" : "MATRICULA_NOVA";
  }
  return "OUTRO";
}

function studentIdForErp(s: StudentMini): string {
  const en = s.enrollment_number?.trim();
  if (en) return en;
  return s.id;
}

function isoDateOnly(iso: string | null): string {
  if (!iso) return "";
  const d = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

/** Preenche mapas de artigos / tipo matrícula para linhas de pagamento. */
export async function loadFeeMetaForPayments(
  supabase: SupabaseClient<Database>,
  payments: PaymentRow[],
): Promise<{
  activityCodeByFeeId: Map<string, string>;
  enrollmentTypeByFeeId: Map<string, "NEW" | "RENEWAL">;
}> {
  const activityCodeByFeeId = new Map<string, string>();
  const enrollmentTypeByFeeId = new Map<string, "NEW" | "RENEWAL">();

  const afIds = [...new Set(payments.map((p) => p.activity_fee_id).filter(Boolean))] as string[];
  const efIds = [...new Set(payments.map((p) => p.enrollment_fee_id).filter(Boolean))] as string[];

  if (afIds.length > 0) {
    const { data } = await supabase
      .from("activity_fees")
      .select("id, activity:extracurricular_activities(name)")
      .in("id", afIds);
    (data ?? []).forEach((row: { id: string; activity: { name: string } | null }) => {
      const name = row.activity?.name?.trim();
      activityCodeByFeeId.set(row.id, name ? `EXTRA_${name.slice(0, 24)}` : "EXTRA");
    });
  }
  if (efIds.length > 0) {
    const { data } = await supabase.from("enrollment_fees").select("id, fee_type").in("id", efIds);
    (data ?? []).forEach((row: { id: string; fee_type: "NEW" | "RENEWAL" }) => {
      enrollmentTypeByFeeId.set(row.id, row.fee_type);
    });
  }

  return { activityCodeByFeeId, enrollmentTypeByFeeId };
}

/** Resolve estudante por pagamento via fee rows (batch). */
export async function resolveStudentsForPayments(
  supabase: SupabaseClient<Database>,
  payments: PaymentRow[],
): Promise<Map<string, StudentMini>> {
  const out = new Map<string, StudentMini>();

  const sfIds = [...new Set(payments.map((p) => p.student_fee_id).filter(Boolean))] as string[];
  const afIds = [...new Set(payments.map((p) => p.activity_fee_id).filter(Boolean))] as string[];
  const tfIds = [...new Set(payments.map((p) => p.transport_fee_id).filter(Boolean))] as string[];
  const efIds = [...new Set(payments.map((p) => p.enrollment_fee_id).filter(Boolean))] as string[];

  const sel = "id, student_id, student:students(id, full_name, tax_id, enrollment_number)";

  const [sfs, afs, tfs, efs] = await Promise.all([
    sfIds.length ? supabase.from("student_fees").select(sel).in("id", sfIds) : { data: [] as unknown[] },
    afIds.length ? supabase.from("activity_fees").select(sel).in("id", afIds) : { data: [] as unknown[] },
    tfIds.length ? supabase.from("transport_fees").select(sel).in("id", tfIds) : { data: [] as unknown[] },
    efIds.length ? supabase.from("enrollment_fees").select(sel).in("id", efIds) : { data: [] as unknown[] },
  ]);

  type FeeRow = { id: string; student_id: string; student: StudentMini | null };

  const ingest = (prefix: string, rows: FeeRow[]) => {
    rows.forEach((r) => {
      const st = r.student;
      if (st) out.set(`${prefix}:${r.id}`, st);
    });
  };

  ingest("sf", (sfs.data ?? []) as FeeRow[]);
  ingest("af", (afs.data ?? []) as FeeRow[]);
  ingest("tf", (tfs.data ?? []) as FeeRow[]);
  ingest("ef", (efs.data ?? []) as FeeRow[]);

  return out;
}

/** Linhas para Excel: números como number; datas ISO YYYY-MM-DD; sem formatação extra. */
export function buildErpExportRows(
  payments: PaymentRow[],
  studentByFeePrefix: Map<string, StudentMini>,
  cfg: ErpConfigFields | null,
  activityCodeByFeeId: Map<string, string>,
  enrollmentTypeByFeeId: Map<string, "NEW" | "RENEWAL">,
): { headers: string[]; rows: (string | number)[][] } {
  const propinaArticle = (cfg?.default_article_code_propina?.trim() || "PROPINA");
  const headersObj = resolveErpHeaders(cfg);
  const headers = [
    headersObj.student_id,
    headersObj.student_name,
    headersObj.tax_id,
    headersObj.amount_paid,
    headersObj.payment_date,
    headersObj.article_code,
    headersObj.payment_method,
  ];

  const rows: (string | number)[][] = [];

  for (const p of payments) {
    let student: StudentMini | undefined;
    if (p.student_fee_id) student = studentByFeePrefix.get(`sf:${p.student_fee_id}`);
    else if (p.activity_fee_id) student = studentByFeePrefix.get(`af:${p.activity_fee_id}`);
    else if (p.transport_fee_id) student = studentByFeePrefix.get(`tf:${p.transport_fee_id}`);
    else if (p.enrollment_fee_id) student = studentByFeePrefix.get(`ef:${p.enrollment_fee_id}`);

    const article = articleCodeForPayment(p, propinaArticle, activityCodeByFeeId, enrollmentTypeByFeeId);

    rows.push([
      student ? studentIdForErp(student) : "",
      student?.full_name ?? "",
      student?.tax_id?.trim() ?? "",
      Number(p.amount_paid) || 0,
      isoDateOnly(p.payment_date),
      article,
      p.method?.trim() ?? "",
    ]);
  }

  return { headers, rows };
}

export function downloadRawXlsx(filename: string, sheetName: string, headers: string[], rows: (string | number)[][]) {
  const aoa: (string | number)[][] = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
