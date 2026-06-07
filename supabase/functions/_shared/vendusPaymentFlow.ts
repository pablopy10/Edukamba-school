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
} from "./vendusService.ts";
import { logVendusFailure } from "./vendusAuth.ts";

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Mapeamento simplificado método Edukamba → ID Vendus (configurável por escola no futuro). */
const DEFAULT_VENDUS_PAYMENT_METHOD = "NU";

type PaymentForVendus = {
  id: string;
  school_id: string;
  student_id: string | null;
  amount_paid: number;
  method: string | null;
  payment_date: string | null;
  student_fee_id: string | null;
  activity_fee_id: string | null;
  transport_fee_id: string | null;
  enrollment_fee_id: string | null;
  meal_fee_id: string | null;
  event_fee_id: string | null;
};

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

async function resolveLineItem(
  admin: SupabaseClient,
  payment: PaymentForVendus,
): Promise<{ titulo: string; taxExemption: string | null; referencia: string }> {
  if (payment.student_fee_id) {
    const { data: fee } = await admin
      .from("student_fees")
      .select("month_index, due_date")
      .eq("id", payment.student_fee_id)
      .maybeSingle();
    const month = Number(fee?.month_index);
    const year = fee?.due_date ? new Date(String(fee.due_date)).getFullYear() : NaN;
    const monthLabel = month >= 1 && month <= 12 ? MONTHS_PT[month - 1] : null;
    const titulo = monthLabel && year
      ? `Propina - ${monthLabel} ${year}`
      : "Propina / serviços educativos";
    return { titulo, taxExemption: "M11", referencia: "PROPINA" };
  }
  if (payment.enrollment_fee_id) {
    const { data: fee } = await admin
      .from("enrollment_fees")
      .select("fee_type")
      .eq("id", payment.enrollment_fee_id)
      .maybeSingle();
    const titulo = fee?.fee_type === "RENEWAL" ? "Renovação de matrícula" : "Taxa de matrícula";
    return { titulo, taxExemption: "M11", referencia: "MATRICULA" };
  }
  if (payment.activity_fee_id) {
    return { titulo: "Atividade extracurricular", taxExemption: null, referencia: "EXTRACURRICULAR" };
  }
  if (payment.transport_fee_id) {
    return { titulo: "Transporte escolar", taxExemption: null, referencia: "TRANSPORTE" };
  }
  if (payment.meal_fee_id) {
    return { titulo: "Refeições escolares", taxExemption: null, referencia: "REFEICOES" };
  }
  if (payment.event_fee_id) {
    return { titulo: "Evento escolar", taxExemption: null, referencia: "EVENTO" };
  }
  return { titulo: "Serviços educativos", taxExemption: "M11", referencia: "SERVICO" };
}

export async function emitVendusInvoiceForPayment(
  admin: SupabaseClient,
  vendusApiKey: string,
  payment: PaymentForVendus,
): Promise<VendusEmitFromPaymentResult> {
  const vendus = new VendusService(vendusApiKey);

  const { data: student } = await admin
    .from("students")
    .select("full_name, tax_id, parent_id")
    .eq("id", payment.student_id ?? "")
    .maybeSingle();

  if (!student?.parent_id) {
    throw new VendusApiError("Aluno sem encarregado associado — impossível emitir fatura Vendus.");
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
  const paymentDate = payment.payment_date ?? new Date().toISOString().slice(0, 10);
  const amount = Number(payment.amount_paid);

  const item: ItemFaturaVendus = {
    titulo: line.titulo,
    referencia: line.referencia,
    quantidade: "1",
    precoBruto: amount,
    taxExemption: line.taxExemption,
    taxExemptionLaw: line.taxExemption ? "Isenção no domínio da educação (AGT Angola)" : undefined,
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
