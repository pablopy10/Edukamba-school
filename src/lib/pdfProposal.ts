import jsPDF from "jspdf";
import {
  buildProformaProposalPdf,
  buildProformaRenderInput,
} from "@/lib/proformaProposal";

export type EdukambaProposalPdfInput = {
  /** Identificador estável para número de documento (ex.: UUID da linha em `saas_sales_proposals`). */
  id: string;
  title: string;
  recipientEmail?: string;
  summary?: string;
  body: string;
  amount?: string;
  currency?: string;
  created_at?: string | null;
  /** Nome da organização do lead CRM (secção «Dados do Cliente»). */
  leadOrganizationName?: string | null;
};

function pdfInputToRender(input: EdukambaProposalPdfInput) {
  const amountEstimate =
    input.amount != null && String(input.amount).trim() !== "" && !Number.isNaN(Number(input.amount))
      ? Number(input.amount)
      : null;
  return buildProformaRenderInput({
    proposal: {
      id: input.id,
      title: input.title,
      summary: input.summary ?? null,
      body_text: input.body,
      amount_estimate: amountEstimate,
      currency: input.currency ?? "AOA",
      recipient_email: input.recipientEmail ?? null,
      created_at: input.created_at ?? null,
    },
    lead: input.leadOrganizationName ? { organization_name: input.leadOrganizationName } : null,
  });
}

function buildProposalPdfDoc(input: EdukambaProposalPdfInput): jsPDF {
  return buildProformaProposalPdf(pdfInputToRender(input));
}

export function downloadEdukambaProposalPdf(input: EdukambaProposalPdfInput, filename = "proposta-edukamba.pdf") {
  const doc = buildProposalPdfDoc(input);
  doc.save(filename);
}

/** Base64 (sem prefixo data:...) para anexos via Edge Function. */
export function proposalPdfBase64(input: EdukambaProposalPdfInput): string {
  const doc = buildProposalPdfDoc(input);
  const dataUri = doc.output("datauristring") as string;
  const i = dataUri.indexOf(",");
  return i >= 0 ? dataUri.slice(i + 1) : dataUri;
}
