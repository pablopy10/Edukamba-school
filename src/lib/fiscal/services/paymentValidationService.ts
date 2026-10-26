/**
 * ============================================================================
 * SERVIÇO TRANSACIONAL DE VALIDAÇÃO DE PAGAMENTO E EMISSÃO FISCAL AGT (ACID)
 * EduCamba — Módulo de Faturação Certificada AGT (Angola)
 * ============================================================================
 */

import { supabase } from "@/integrations/supabase/client";
import {
  buildAgtSigningPlaintext,
  buildCertificationFooter,
  calculateSha1Hex,
  extractHashControl,
  formatMoneyDecimal,
  signPlaintextRSA_SHA1,
} from "../crypto/agtCrypto";
import { buildAgtQrPayload, generateAgtQrDataUrl } from "../qr/agtQrCode";
import { buildInvoicePdf, fetchLogoAsDataUrl, FiscalInvoicePdfInput } from "../invoicePdf";
import { uploadBlobToR2 } from "@/lib/r2/uploadFileToR2";

export type PaymentMethodType =
  | "MULTICAIXA_EXPRESS"
  | "TPA"
  | "TRANSFERENCIA"
  | "DEPOSITO"
  | "NUMERARIO";

export type PaymentStatusType = "PENDING" | "APPROVED" | "REJECTED";

export interface PaymentItemInput {
  itemType: "TUITION" | "ENROLLMENT" | "UNIFORM" | "TRANSPORT" | "MEAL" | "ACTIVITY" | "EVENT" | "OTHER";
  description: string;
  unitPrice: number;
  quantity?: number;
  discountAmount?: number;
  taxId?: string;
  taxPercentage?: number;
  taxExemptionCode?: string;
  taxExemptionReason?: string;
}

export interface ValidatePaymentOptions {
  /** Tipo de documento fiscal: 'FR' (Fatura/Recibo - padrão) ou 'FT' (Fatura) */
  docType?: "FR" | "FT";
  /** Canais de distribuição da fatura */
  channels?: Array<"EMAIL" | "WHATSAPP" | "PUSH">;
  /** Se deve gerar e enviar o PDF para o Cloudflare R2 */
  generatePdfAndUpload?: boolean;
  /** Chave privada PEM para assinatura local (se não estiver usando backend/Edge Function) */
  privateKeyPem?: string;
  /** Número de certificação AGT */
  certificationNumber?: string;
  /** Versão do software */
  softwareVersion?: string;
}

export interface ValidatePaymentResult {
  ok: boolean;
  paymentId: string;
  invoiceId?: string;
  documentNumber?: string;
  docType?: "FR" | "FT" | string;
  pdfUrl?: string | null;
  qrCodePayload?: string;
  qrCodeDataUrl?: string;
  hashControl?: string;
  digitalSignature?: string;
  channelsSent?: string[];
  sentAt?: string;
  grossTotal?: number;
  customerNif?: string;
  customerName?: string;
  error?: string;
}

export class PaymentValidationError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = "PaymentValidationError";
  }
}

/**
 * Validação transacional (ACID) de pagamento e emissão automática de fatura AGT.
 * Previne concorrência e duplo clique com lock pessimista no PostgreSQL.
 */
export async function validateAndInvoicePayment(
  paymentId: string,
  adminUserId: string,
  options?: ValidatePaymentOptions
): Promise<ValidatePaymentResult> {
  const docType = options?.docType ?? "FR";
  const channels = options?.channels ?? ["EMAIL", "PUSH"];
  const certNumber = options?.certificationNumber ?? "0/AGT/2026";
  const softVersion = options?.softwareVersion ?? "1.0.0";
  const shouldUploadPdf = options?.generatePdfAndUpload !== false;

  // 1. EXECUÇÃO DA TRANSAÇÃO ACID VIA RPC NO POSTGRESQL
  const { data: rpcData, error: rpcErr } = await supabase.rpc("validate_and_invoice_payment", {
    _payment_id: paymentId,
    _admin_user_id: adminUserId,
    _doc_type: docType,
    _channels: channels,
  });

  if (rpcErr) {
    throw new PaymentValidationError(
      rpcErr.message || "Erro na validação transacional do pagamento.",
      rpcErr.code
    );
  }

  const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as {
    payment_id: string;
    invoice_id: string;
    document_number: string;
    doc_type: string;
    series: string;
    doc_number: number;
    invoice_date: string;
    gross_total: number;
    net_total: number;
    tax_payable: number;
    cliente_nif: string;
    cliente_nome: string;
    student_name: string;
    hash_control: string;
    qr_code_payload: string;
    status: string;
  } | null;

  if (!row || !row.invoice_id) {
    throw new PaymentValidationError("Falha ao registar liquidação e fatura.");
  }

  const invoiceId = row.invoice_id;
  const documentNumber = row.document_number;
  const invoiceDateStr = String(row.invoice_date).slice(0, 10);
  const nowIso = new Date().toISOString();

  // 2. BUSCAR DADOS DA ESCOLA (NIF, morada, logótipo)
  const { data: invWithSchool } = await supabase
    .from("invoices")
    .select(`
      school_id,
      schools (
        id,
        name,
        tax_id,
        address,
        logo_url,
        phone,
        email
      )
    `)
    .eq("id", invoiceId)
    .maybeSingle();

  const school = (invWithSchool as { schools?: {
    id: string;
    name: string;
    tax_id: string | null;
    address: string | null;
    logo_url: string | null;
    phone: string | null;
    email: string | null;
  } | null } | null)?.schools;

  const schoolNif = school?.tax_id || "000000000";
  const schoolName = school?.name || "EduCamba";

  // 3. RECUPERAR HASH DO DOCUMENTO ANTERIOR NA SÉRIE
  let previousHash = "";
  if (row.doc_number > 1) {
    const { data: prevInv } = await supabase
      .from("invoices")
      .select("digital_signature_sha1_b64, document_hash")
      .eq("school_id", invWithSchool?.school_id || "")
      .eq("series", row.series)
      .eq("doc_number", row.doc_number - 1)
      .maybeSingle();

    previousHash = prevInv?.digital_signature_sha1_b64?.trim() || prevInv?.document_hash?.trim() || "";
  }

  // 4. CRIPTOGRAFIA E ASSINATURA AGT (RSA-SHA1)
  const plaintext = buildAgtSigningPlaintext({
    invoiceDateYYYYMMDD: invoiceDateStr,
    systemEntryDateISO: nowIso,
    documentNumberFull: documentNumber,
    grossTotal: row.gross_total,
    previousDocumentHash: previousHash,
  });

  const docHashSha1 = calculateSha1Hex(plaintext);

  let signatureBase64 = "";
  let hashControl = row.hash_control;

  if (options?.privateKeyPem) {
    try {
      signatureBase64 = signPlaintextRSA_SHA1(plaintext, options.privateKeyPem);
      hashControl = extractHashControl(signatureBase64);
    } catch {
      // Chave opcional no browser; mantém hashControl calculado pela sequência
    }
  }

  // 5. GERAÇÃO DO PAYLOAD E IMAGEM DO QR CODE OFICIAL AGT
  const qrPayload = buildAgtQrPayload({
    nifEmissor: schoolNif,
    nifCliente: row.cliente_nif,
    pais: "AO",
    tipoDoc: row.doc_type,
    estado: "N",
    data: invoiceDateStr,
    numDoc: documentNumber,
    hash4Chars: hashControl,
    totalLiquido: row.net_total,
    totalIva: row.tax_payable,
    totalDocumento: row.gross_total,
  });

  let qrCodeDataUrl = "";
  try {
    qrCodeDataUrl = await generateAgtQrDataUrl(qrPayload, { width: 512, margin: 4 });
  } catch {
    /* QR code opcional se ambiente não suportar canvas */
  }

  const footerText = buildCertificationFooter(hashControl, certNumber, softVersion);

  // 6. ATUALIZAR INVOICE COM CRIPTOGRAFIA E QR CODE
  await supabase
    .from("invoices")
    .update({
      agt_signing_plaintext: plaintext,
      document_hash: docHashSha1,
      previous_document_hash: previousHash || null,
      digital_signature_sha1_b64: signatureBase64 || null,
      hash_control: hashControl,
      qr_code_payload: qrPayload,
    })
    .eq("id", invoiceId);

  // 7. RENDERIZAÇÃO DO PDF E UPLOAD PARA CLOUDFLARE R2
  let pdfPublicUrl: string | null = null;

  if (shouldUploadPdf) {
    try {
      let logoDataUrl: string | null = null;
      if (school?.logo_url) {
        logoDataUrl = await fetchLogoAsDataUrl(school.logo_url);
      }

      const pdfInput: FiscalInvoicePdfInput = {
        schoolName: schoolName,
        schoolNif: schoolNif,
        schoolAddress: school?.address ?? "Angola",
        schoolContactLines: [school?.phone, school?.email].filter(Boolean) as string[],
        logoDataUrl,
        documentNumber: documentNumber,
        invoiceDateYYYYMMDD: invoiceDateStr,
        clienteNome: row.cliente_nome,
        clienteNif: row.cliente_nif,
        studentName: row.student_name,
        grossTotalFmt: formatMoneyDecimal(row.gross_total) + " Kz",
        subtotalFmt: formatMoneyDecimal(row.net_total) + " Kz",
        ivaFmt: formatMoneyDecimal(row.tax_payable) + " Kz",
        lineItems: [
          {
            description: row.doc_type === "FR" ? "Fatura/Recibo — Liquidação Financeira" : "Serviços Escolares",
            quantity: 1,
            unitPriceFmt: formatMoneyDecimal(row.net_total) + " Kz",
            totalAmountFmt: formatMoneyDecimal(row.gross_total) + " Kz",
            taxLabel: row.tax_payable > 0 ? "IVA 14%" : "Isento (M11)",
          },
        ],
        docType: row.doc_type,
        qrCodeDataUrl,
        hashControl: hashControl,
        certificationNumber: certNumber,
        softwareVersion: softVersion,
        documentHashFootnote: footerText,
      };

      const pdfDoc = buildInvoicePdf(pdfInput);
      const pdfBlob = pdfDoc.output("blob");
      const cleanDocNumber = documentNumber.replace(/[^\w-]/g, "_");
      const fileName = `${cleanDocNumber}.pdf`;

      pdfPublicUrl = await uploadBlobToR2(pdfBlob, fileName, {
        prefix: "documents",
        contentType: "application/pdf",
      });

      // Atualizar URL do PDF na fatura e no pagamento
      if (pdfPublicUrl) {
        await supabase
          .from("invoices")
          .update({ pdf_url: pdfPublicUrl })
          .eq("id", invoiceId);

        await supabase
          .from("payments")
          .update({
            pdf_url: pdfPublicUrl,
            sent_at: nowIso,
            channels_sent: channels,
          })
          .eq("id", paymentId);
      }
    } catch (pdfErr) {
      console.warn("[PaymentValidationService] Falha na geração/upload do PDF (não-bloqueante):", pdfErr);
    }
  }

  return {
    ok: true,
    paymentId,
    invoiceId,
    documentNumber,
    docType: row.doc_type as "FR" | "FT",
    pdfUrl: pdfPublicUrl,
    qrCodePayload: qrPayload,
    qrCodeDataUrl,
    hashControl,
    digitalSignature: signatureBase64 || undefined,
    channelsSent: channels,
    sentAt: nowIso,
    grossTotal: row.gross_total,
    customerNif: row.cliente_nif,
    customerName: row.cliente_nome,
  };
}
