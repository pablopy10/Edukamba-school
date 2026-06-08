/**
 * Emissão de fatura Vendus a partir de um pagamento validado.
 * Partilhado entre emit-payment-receipt e vendus-billing.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  VendusService,
  VendusApiError,
  type DadosFaturaPropinas,
  type ItemFaturaVendus,
  normalizeVendusDate,
} from "./vendusService.ts";
import { logVendusFailure } from "./vendusAuth.ts";

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Mapeamento simplificado método Edukamba → ID Vendus (configurável por escola no futuro). */
const DEFAULT_VENDUS_PAYMENT_METHOD = "NU";

type PaymentFeeRefs = {
  student_fee_id: string | null;
  activity_fee_id: string | null;
  transport_fee_id: string | null;
  enrollment_fee_id: string | null;
  meal_fee_id: string | null;
  event_fee_id: string | null;
};

type PaymentForVendus = PaymentFeeRefs & {
  id: string;
  school_id: string;
  student_id?: string | null;
  amount_paid: number;
  method: string | null;
  payment_date: string | null;
};

const FEE_TABLE_BY_REF: [keyof PaymentFeeRefs, string][] = [
  ["student_fee_id", "student_fees"],
  ["activity_fee_id", "activity_fees"],
  ["transport_fee_id", "transport_fees"],
  ["enrollment_fee_id", "enrollment_fees"],
  ["meal_fee_id", "meal_fees"],
  ["event_fee_id", "event_fees"],
];

/** payments não tem student_id — obtém-se via FK da taxa associada. */
export async function resolveStudentIdFromPayment(
  admin: SupabaseClient,
  payment: PaymentFeeRefs,
): Promise<string | null> {
  for (const [refKey, table] of FEE_TABLE_BY_REF) {
    const feeId = payment[refKey];
    if (!feeId) continue;
    const { data } = await admin.from(table).select("student_id").eq("id", feeId).maybeSingle();
    if (data?.student_id) return data.student_id as string;
  }
  return null;
}

export type VendusEmitFromPaymentResult = {
  vendusDocumentId: string;
  vendusDocumentNumber: string;
  vendusPdfUrl: string;
  vendusClientId: string;
};

function mapPaymentMethod(method: string | null): string {
  const m = (method ?? "").toLowerCase();
  if (m.includes("transfer")) return "TB";
  if (m.includes("multicaixa") || m.includes("tpa") || m.includes("cartao")) return "CC";
  if (m.includes("dinheiro") || m.includes("cash")) return "NU";
  return DEFAULT_VENDUS_PAYMENT_METHOD;
}

/** Propinas: isento (ISE). Transporte, refeições, matrículas: regime geral NOR 14%. */
function monthYearLabel(monthIndex: unknown, dueDate: unknown): string | null {
  const month = Number(monthIndex);
  const year = dueDate ? new Date(String(dueDate)).getFullYear() : NaN;
  const monthLabel = month >= 1 && month <= 12 ? MONTHS_PT[month - 1] : null;
  if (monthLabel && Number.isFinite(year)) return `${monthLabel} ${year}`;
  return null;
}

async function resolveLineItem(
  admin: SupabaseClient,
  payment: PaymentForVendus,
): Promise<{ titulo: string; taxId: "ISE" | "NOR"; referencia: string }> {
  if (payment.student_fee_id) {
    const { data: fee } = await admin
      .from("student_fees")
      .select("month_index, due_date")
      .eq("id", payment.student_fee_id)
      .maybeSingle();
    const period = monthYearLabel(fee?.month_index, fee?.due_date);
    const titulo = period ? `Propina - ${period}` : "Propina / serviços educativos";
    return { titulo, taxId: "ISE", referencia: "PROPINA" };
  }
  if (payment.enrollment_fee_id) {
    const { data: fee } = await admin
      .from("enrollment_fees")
      .select("fee_type")
      .eq("id", payment.enrollment_fee_id)
      .maybeSingle();
    const titulo = fee?.fee_type === "RENEWAL" ? "Renovação de matrícula" : "Taxa de matrícula";
    return { titulo, taxId: "NOR", referencia: "MATRICULA" };
  }
  if (payment.activity_fee_id) {
    return { titulo: "Atividade extracurricular", taxId: "NOR", referencia: "EXTRACURRICULAR" };
  }
  if (payment.transport_fee_id) {
    const { data: fee } = await admin
      .from("transport_fees")
      .select("month_index, due_date")
      .eq("id", payment.transport_fee_id)
      .maybeSingle();
    const period = monthYearLabel(fee?.month_index, fee?.due_date);
    const titulo = period ? `Transporte escolar - ${period}` : "Transporte escolar";
    return { titulo, taxId: "NOR", referencia: "TRANSPORTE" };
  }
  if (payment.meal_fee_id) {
    const { data: fee } = await admin
      .from("meal_fees")
      .select("month_index, due_date")
      .eq("id", payment.meal_fee_id)
      .maybeSingle();
    const period = monthYearLabel(fee?.month_index, fee?.due_date);
    const titulo = period ? `Refeições escolares - ${period}` : "Refeições escolares";
    return { titulo, taxId: "NOR", referencia: "REFEICOES" };
  }
  if (payment.event_fee_id) {
    return { titulo: "Evento escolar", taxId: "NOR", referencia: "EVENTO" };
  }
  return { titulo: "Serviços educativos", taxId: "ISE", referencia: "SERVICO" };
}

export async function emitVendusInvoiceForPayment(
  admin: SupabaseClient,
  vendusApiKey: string,
  payment: PaymentForVendus,
): Promise<VendusEmitFromPaymentResult> {
  const vendus = new VendusService(vendusApiKey);

  const studentId = payment.student_id ?? await resolveStudentIdFromPayment(admin, payment);
  if (!studentId) {
    throw new VendusApiError("Pagamento sem aluno associado — impossível emitir fatura.");
  }

  const { data: student } = await admin
    .from("students")
    .select("full_name, tax_id, parent_id")
    .eq("id", studentId)
    .maybeSingle();

  if (!student?.parent_id) {
    throw new VendusApiError("Aluno sem encarregado associado — impossível emitir fatura.");
  }

  const { data: parent } = await admin
    .from("profiles")
    .select("id, full_name, email, tax_id, vendus_client_id")
    .eq("id", student.parent_id)
    .maybeSingle();

  if (!parent) {
    throw new VendusApiError("Perfil do encarregado não encontrado.");
  }

  const clienteNif = student.tax_id?.trim() || parent.tax_id?.trim() || null;
  const clienteNome = parent.full_name?.trim() || student.full_name?.trim() || "Cliente";

  const clientResult = await vendus.criarOuProcurarCliente({
    profileId: parent.id,
    nome: clienteNome,
    nif: clienteNif,
    email: parent.email,
    vendusClientId: parent.vendus_client_id,
  });

  if (clientResult.criado || clientResult.vendusClientId !== parent.vendus_client_id) {
    await admin
      .from("profiles")
      .update({ vendus_client_id: clientResult.vendusClientId })
      .eq("id", parent.id);
  }

  const line = await resolveLineItem(admin, payment);
  const paymentDate = normalizeVendusDate(payment.payment_date);
  const amount = Number(payment.amount_paid);

  const item: ItemFaturaVendus = {
    titulo: line.titulo,
    referencia: line.referencia,
    quantidade: 1,
    precoBruto: amount,
    taxId: line.taxId,
  };

  const dadosFatura: DadosFaturaPropinas = {
    tipo: "FR",
    clientId: clientResult.vendusClientId,
    itens: [item],
    data: paymentDate,
    dataFornecimento: paymentDate,
    referenciaExterna: `edukamba:payment:${payment.id}`,
    notas: line.titulo,
    pagamentos: [{
      id: mapPaymentMethod(payment.method),
      valor: amount,
      dataVencimento: paymentDate,
    }],
  };

  try {
    const invoice = await vendus.emitirFaturaPropinas(dadosFatura);
    return {
      vendusDocumentId: invoice.documentId,
      vendusDocumentNumber: invoice.documentNumber,
      vendusPdfUrl: invoice.pdfUrl,
      vendusClientId: clientResult.vendusClientId,
    };
  } catch (e) {
    await logVendusFailure(admin, {
      schoolId: payment.school_id,
      operation: "emitir_fatura_propinas",
      paymentId: payment.id,
      profileId: parent.id,
      errorMessage: e instanceof Error ? e.message : String(e),
      httpStatus: e instanceof VendusApiError ? e.status ?? null : null,
      requestPayload: dadosFatura,
      responsePayload: e instanceof VendusApiError ? e.vendusPayload : undefined,
    });
    throw e;
  }
}
