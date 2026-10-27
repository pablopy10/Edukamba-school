/**
 * Emissão Direta Resiliente de Fatura Certificada AGT (FT)
 * Executa a lógica de emissão fiscal localmente no cliente como fallback ou chamada direta,
 * garantindo que faturas nunca falham mesmo se a Edge Function estiver indisponível.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  buildAgtSigningPlaintext,
  calculateSha1Hex,
  extractHashControl,
  formatMoneyDecimal,
  signPlaintextRSA_SHA1,
} from "./crypto/agtCrypto";
import { buildAgtQrPayload } from "./qr/agtQrCode";
import { buildInvoicePdf, resolveFiscalInvoicePdfInput } from "./invoicePdf";
import { uploadBlobToR2 } from "@/lib/r2/uploadFileToR2";

// Chave RSA privada padrão (PKCS#8 RSA-SHA1) registada para a certificação do EduCamba
const DEFAULT_AGT_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIICdgIBADANBgkqhkiG9w0BAQEFAASCAmAwggJcAgEAAoGBANI6TSTevzosc6LA
sgA75TJOGVTCNGVUNwct3gyP4FQ7HF5+Lv+ykQO0oQYAI9VrAvI+IjKfIb6Y0p4U
KJbaGpM/KQcyVSP+iBn4SUbmVCHCRs99fLH0rloXsPCoZN27q6Hx4VBfwzK7PoGr
qB4UHMsEydEwtW7TlRMatv355SUnAgMBAAECgYBEsPQgBgBp27h1B42h8fAz/bzd
Kw+/xEKuv9f8Ns7P9viQD57/wbMMiOrMcSNEStENoiu+aqy2AG1hZajVkbJ4rpGl
JCwzWW3WZWAsypwDnwsb4Q24AMrDLN95Wg5TiVB5kmqdNxmcLMT5ZRdeEeDQBU/p
pbKwqPcaWTokw8ZjAQJBAPdhOpvhm1pXd6d9s1C0FSRgJfxVknHQHPNUfA51Yzm1
RtPU0AkZZZgGiv0oTnZEQZpxmRT51f/dubtS1Xl/UsECQQDZjaeNzcxVdyVBAhCA
sdXTyNX5cmC6/6oysvtKJys6Th4Qxttp4HGC8Fo3a54PnvzTVRl1/MtN5aVy8YMG
NLnnAkBegJovKoR6gqeHKJHz5pedCc35E4eaSvKEUmYB7/4z8XhZPBctIrKY3QcD
pv4yV+jn4zWjub1yvXVShlZez7EBAkEA1dlFu8FxOw2sRBOobyjgHJdNpi9FYGvS
PJXtJ74K4vxI14rxwUiLq/9hXxrdO1O4CHCdX3qHyeGUWcGHXwFTPwJAD+arpzOe
He0FRwXBXCa+EZWq2EfesFVe87gX8/ZzotmIEdfMRd0TigXcyVoc5CGSRWfsPXId
jtTnvKwyKoeFQw==
-----END PRIVATE KEY-----`;

export interface DirectEmissionResult {
  ok: boolean;
  payment_id: string;
  invoice_id?: string;
  document_number?: string;
  pdf_url?: string | null;
  message?: string;
}

export async function emitFiscalInvoiceDirect(paymentId: string): Promise<DirectEmissionResult> {
  const pid = paymentId?.trim();
  if (!pid) {
    return { ok: false, payment_id: "", message: "ID de pagamento inválido." };
  }

  // 1. Verificar se fatura já foi gerada anteriormente
  const { data: existingInv } = await supabase
    .from("invoices")
    .select("id, document_number, invoice_status, pdf_url")
    .eq("payment_id", pid)
    .maybeSingle();

  if (existingInv?.id) {
    return {
      ok: true,
      payment_id: pid,
      invoice_id: existingInv.id,
      document_number: existingInv.document_number,
      pdf_url: existingInv.pdf_url,
    };
  }

  // 2. Carregar dados do pagamento
  const { data: pay, error: payErr } = await supabase
    .from("payments")
    .select(
      "id, school_id, status, amount_paid, validated_at, payment_date, student_id, payer_id, student_fee_id, activity_fee_id, transport_fee_id, enrollment_fee_id, meal_fee_id, event_fee_id",
    )
    .eq("id", pid)
    .maybeSingle();

  if (payErr || !pay) {
    return { ok: false, payment_id: pid, message: payErr?.message || "Pagamento não encontrado." };
  }

  // 3. Resolver contexto da taxa / aluno / encarregado
  let studentId: string | null = (pay as { student_id?: string | null })?.student_id ?? null;
  let lineDescription = "Propina / serviços educativos";
  let clienteNome = "Consumidor Final";
  let clienteNif = "999999999";
  let parentProfileId: string | null = null;
  let feeStudent: { id?: string; full_name?: string | null; parent_id?: string | null } | null = null;

  if (pay.student_fee_id) {
    const { data: feeRow } = await supabase
      .from("student_fees")
      .select("student_id, month_index, student:students(id, full_name, parent_id)")
      .eq("id", pay.student_fee_id)
      .maybeSingle();
    studentId = feeRow?.student_id ?? studentId;
    feeStudent = (feeRow?.student as { id?: string; full_name?: string | null; parent_id?: string | null } | null) ?? null;
    const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const mName = feeRow?.month_index ? monthNames[feeRow.month_index - 1] : "";
    lineDescription = mName ? `Propina escolar (${mName})` : "Propina escolar";
  } else if (pay.activity_fee_id) {
    const { data: feeRow } = await supabase
      .from("activity_fees")
      .select("student_id, activity:extracurricular_activities(name), student:students(id, full_name, parent_id)")
      .eq("id", pay.activity_fee_id)
      .maybeSingle();
    studentId = feeRow?.student_id ?? studentId;
    feeStudent = (feeRow?.student as { id?: string; full_name?: string | null; parent_id?: string | null } | null) ?? null;
    const actName = (feeRow?.activity as { name?: string | null } | null)?.name ?? "atividade";
    lineDescription = `Atividade extracurricular (${actName})`;
  } else if (pay.transport_fee_id) {
    const { data: feeRow } = await supabase
      .from("transport_fees")
      .select("student_id, route:transport_routes(name), student:students(id, full_name, parent_id)")
      .eq("id", pay.transport_fee_id)
      .maybeSingle();
    studentId = feeRow?.student_id ?? studentId;
    feeStudent = (feeRow?.student as { id?: string; full_name?: string | null; parent_id?: string | null } | null) ?? null;
    const rName = (feeRow?.route as { name?: string | null } | null)?.name ?? "rota";
    lineDescription = `Transporte escolar (${rName})`;
  } else if (pay.enrollment_fee_id) {
    const { data: feeRow } = await supabase
      .from("enrollment_fees")
      .select("student_id, fee_type, student:students(id, full_name, parent_id)")
      .eq("id", pay.enrollment_fee_id)
      .maybeSingle();
    studentId = feeRow?.student_id ?? studentId;
    feeStudent = (feeRow?.student as { id?: string; full_name?: string | null; parent_id?: string | null } | null) ?? null;
    lineDescription = feeRow?.fee_type === "RENEWAL" ? "Renovação de matrícula" : "Taxa de matrícula";
  } else if (pay.meal_fee_id) {
    const { data: feeRow } = await supabase
      .from("meal_fees")
      .select("student_id, meal_program:meal_programs(name), student:students(id, full_name, parent_id)")
      .eq("id", pay.meal_fee_id)
      .maybeSingle();
    studentId = feeRow?.student_id ?? studentId;
    feeStudent = (feeRow?.student as { id?: string; full_name?: string | null; parent_id?: string | null } | null) ?? null;
    const mName = (feeRow?.meal_program as { name?: string | null } | null)?.name ?? "refeições";
    lineDescription = `Refeições escolares (${mName})`;
  } else if (pay.event_fee_id) {
    const { data: feeRow } = await supabase
      .from("event_fees")
      .select("student_id, event:events(title), student:students(id, full_name, parent_id)")
      .eq("id", pay.event_fee_id)
      .maybeSingle();
    studentId = feeRow?.student_id ?? studentId;
    feeStudent = (feeRow?.student as { id?: string; full_name?: string | null; parent_id?: string | null } | null) ?? null;
    const evTitle = (feeRow?.event as { title?: string | null } | null)?.title ?? "evento";
    lineDescription = `Evento escolar (${evTitle})`;
  }

  // Se o aluno não veio das fees, tentar buscar direto por student_id
  if (!feeStudent && studentId) {
    const { data: stRow } = await supabase
      .from("students")
      .select("id, full_name, parent_id")
      .eq("id", studentId)
      .maybeSingle();
    if (stRow) feeStudent = stRow;
  }

  // Preencher nome do cliente e encarregado com validação estrita em profiles
  if (feeStudent) {
    if (feeStudent.full_name) clienteNome = feeStudent.full_name;
    if (feeStudent.parent_id) {
      const { data: prof } = await supabase.from("profiles").select("full_name, nif").eq("id", feeStudent.parent_id).maybeSingle();
      if (prof) {
        parentProfileId = feeStudent.parent_id;
        if (prof.full_name) clienteNome = prof.full_name;
        if (prof.nif?.trim()) clienteNif = prof.nif.trim();
      }
    }
  }

  // Se ainda não temos parentProfileId mas o pagamento tem payer_id, verificar se existe em profiles
  const rawPayerId = (pay as { payer_id?: string | null })?.payer_id;
  if (!parentProfileId && rawPayerId) {
    const { data: prof } = await supabase.from("profiles").select("full_name, nif").eq("id", rawPayerId).maybeSingle();
    if (prof) {
      parentProfileId = rawPayerId;
      if (prof.full_name) clienteNome = prof.full_name;
      if (prof.nif?.trim()) clienteNif = prof.nif.trim();
    }
  }

  // 4. Reservar sequência oficial via billing_reserve_next_invoice
  const { data: rpcRows, error: rpcErr } = await supabase.rpc("billing_reserve_next_invoice", {
    _school_id: pay.school_id,
  });

  if (rpcErr) {
    return { ok: false, payment_id: pid, message: rpcErr.message || "Erro ao reservar número de fatura." };
  }

  const slot = (Array.isArray(rpcRows) ? rpcRows[0] : rpcRows) as { serie?: string; seq?: number } | null;
  const series = String(slot?.serie || "EDK").trim().toUpperCase();
  const seq = Number(slot?.seq || 1);
  const documentNumberFull = `FT ${series}/${seq}`;

  // 5. Obter hash do documento anterior na série para encadeamento AGT
  let previousHash = "";
  if (seq > 1) {
    const { data: prevInv } = await supabase
      .from("invoices")
      .select("digital_signature_sha1_b64, document_hash")
      .eq("school_id", pay.school_id)
      .eq("series", series)
      .order("doc_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    previousHash = prevInv?.digital_signature_sha1_b64?.trim() || prevInv?.document_hash?.trim() || "";
  }

  // 6. Preparar dados para assinatura AGT
  const timeBasis = pay.validated_at ?? pay.payment_date ?? new Date().toISOString();
  const invoiceDateYYYYMMDD = timeBasis.slice(0, 10);
  const amountNumber = Number(pay.amount_paid) || 0;
  const amountStr = formatMoneyDecimal(amountNumber);

  const plaintext = buildAgtSigningPlaintext({
    invoiceDateYYYYMMDD,
    systemEntryDateISO: timeBasis,
    documentNumberFull,
    grossTotal: amountNumber,
    previousDocumentHash: previousHash,
  });

  const docHashSha1 = calculateSha1Hex(plaintext);
  const privateKey = (import.meta.env.VITE_AGT_RSA_PRIVATE_KEY_PEM as string) || DEFAULT_AGT_PRIVATE_KEY_PEM;
  const signatureBase64 = signPlaintextRSA_SHA1(plaintext, privateKey);
  const hashControl = extractHashControl(signatureBase64);

  // Buscar NIF da escola
  const { data: school } = await supabase
    .from("schools")
    .select("nif")
    .eq("id", pay.school_id)
    .maybeSingle();
  const schoolNif = (school as { nif?: string | null } | null)?.nif?.trim() || "000000000";

  const qrPayload = buildAgtQrPayload({
    nifEmissor: schoolNif,
    nifCliente: clienteNif,
    pais: "AO",
    tipoDoc: "FT",
    estado: "N",
    data: invoiceDateYYYYMMDD,
    numDoc: documentNumberFull,
    hash4Chars: hashControl,
    totalLiquido: amountNumber,
    totalIva: 0,
    totalDocumento: amountNumber,
  });

  // Codificação da linha: "Descricao:Valor:0_M11"
  const lineDescriptionEncoded = `${lineDescription}:${amountStr}:0_M11`;

  // 7. Inserir fatura na tabela invoices
  const { data: inserted, error: insErr } = await supabase
    .from("invoices")
    .insert({
      school_id: pay.school_id,
      payment_id: pay.id,
      student_id: studentId,
      parent_profile_id: parentProfileId,
      series,
      doc_number: seq,
      document_number: documentNumberFull,
      doc_type: "FT",
      invoice_date: invoiceDateYYYYMMDD,
      invoice_issued_at: new Date().toISOString(),
      gross_total: amountNumber,
      net_total: amountNumber,
      tax_payable: 0,
      currency: "AOA",
      line_description: lineDescriptionEncoded,
      exemption_code: "M11",
      exemption_reason: "Isenção no domínio da educação",
      agt_signing_plaintext: plaintext,
      digital_signature_sha1_b64: signatureBase64,
      document_hash: docHashSha1,
      previous_document_hash: previousHash || null,
      hash_control: hashControl,
      cliente_nome: clienteNome,
      cliente_nif: clienteNif,
    })
    .select("id, document_number")
    .single();

  if (insErr) {
    if (insErr.code === "23505") {
      // Concorrência — buscar fatura já existente
      const { data: dup } = await supabase
        .from("invoices")
        .select("id, document_number, pdf_url")
        .eq("payment_id", pid)
        .maybeSingle();
      if (dup?.id) {
        return {
          ok: true,
          payment_id: pid,
          invoice_id: dup.id,
          document_number: dup.document_number,
          pdf_url: dup.pdf_url,
        };
      }
    }
    return { ok: false, payment_id: pid, message: insErr.message };
  }

  // Atualizar qr_code_payload se coluna existir
  try {
    await supabase.from("invoices").update({ qr_code_payload: qrPayload }).eq("id", inserted.id);
  } catch {
    /* não bloqueante */
  }

  // Vincular pagamento à fatura gerada
  try {
    await supabase
      .from("payments")
      .update({
        invoice_id: inserted.id,
        status: "validado",
      })
      .eq("id", pid);
  } catch (linkErr) {
    console.warn("[emitFiscalInvoiceDirect] Erro ao associar invoice_id ao pagamento:", linkErr);
  }

  // 8. Gerar PDF e enviar para o Cloudflare R2 em segundo plano
  let pdfUrl: string | null = null;
  try {
    const { data: fullInv } = await supabase.from("invoices").select("*").eq("id", inserted.id).single();
    if (fullInv) {
      const fmtAOA = (n: number) =>
        new Intl.NumberFormat("pt-AO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0) + " Kz";
      const pdfInput = await resolveFiscalInvoicePdfInput(fullInv as Tables<"invoices">, fmtAOA);
      const pdfDoc = buildInvoicePdf(pdfInput);
      const pdfBlob = pdfDoc.output("blob");
      const safeDocNum = documentNumberFull.replace(/[\/\s]/g, "_");
      pdfUrl = await uploadBlobToR2(pdfBlob, `${safeDocNum}.pdf`, { prefix: "documents" });
      if (pdfUrl) {
        await supabase.from("invoices").update({ pdf_url: pdfUrl }).eq("id", inserted.id);
      }
    }
  } catch (pdfErr) {
    console.warn("[emitFiscalInvoiceDirect] Geração de PDF no R2 em background (não bloqueante):", pdfErr);
  }

  return {
    ok: true,
    payment_id: pid,
    invoice_id: inserted.id,
    document_number: documentNumberFull,
    pdf_url: pdfUrl,
  };
}
