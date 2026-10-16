import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateAndInvoicePayment,
  PaymentValidationError,
} from "../lib/fiscal/services/paymentValidationService";
import { buildAgtQrPayload, parseAgtQrPayload } from "../lib/fiscal/qr/agtQrCode";
import { extractHashControl, buildAgtSigningPlaintext } from "../lib/fiscal/crypto/agtCrypto";
import { supabase } from "@/integrations/supabase/client";

// Mock do supabase client
vi.mock("@/integrations/supabase/client", () => {
  const rpcMock = vi.fn();
  const fromMock = vi.fn();
  return {
    supabase: {
      rpc: rpcMock,
      from: fromMock,
    },
  };
});

// Mock do uploadBlobToR2
vi.mock("@/lib/r2/uploadFileToR2", () => ({
  uploadBlobToR2: vi.fn().mockResolvedValue("https://pub-r2.dev/documents/FR_EDK_1.pdf"),
}));

// Mock do buildInvoicePdf
vi.mock("../lib/fiscal/invoicePdf", () => ({
  buildInvoicePdf: vi.fn().mockReturnValue({
    output: vi.fn().mockReturnValue(new Blob(["mock-pdf"], { type: "application/pdf" })),
  }),
  fetchLogoAsDataUrl: vi.fn().mockResolvedValue(null),
}));

describe("Módulo de Validação de Pagamento e Emissão Fiscal AGT", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Geração do Payload do QR Code Oficial AGT", () => {
    it("deve montar o payload rigorosamente no formato especificado pela AGT", () => {
      const payload = buildAgtQrPayload({
        nifEmissor: "5000123456",
        nifCliente: "001699891LA037",
        pais: "AO",
        tipoDoc: "FR",
        estado: "N",
        data: "2026-10-16",
        numDoc: "FR EDK/1",
        hash4Chars: "A1B2",
        totalLiquido: 35000,
        totalIva: 0,
        totalDocumento: 35000,
      });

      expect(payload).toBe(
        "A:5000123456*B:001699891LA037*C:AO*D:FR*E:N*F:20261016*G:FR EDK/1*H:A1B2*I1:35000.00*I2:0.00*I3:35000.00"
      );

      const parsed = parseAgtQrPayload(payload);
      expect(parsed.nifEmissor).toBe("5000123456");
      expect(parsed.nifCliente).toBe("001699891LA037");
      expect(parsed.tipoDoc).toBe("FR");
      expect(parsed.totalDocumento).toBe(35000);
    });

    it("deve injetar automaticamente NIF 999999999 se o cliente não possuir NIF", () => {
      const payload = buildAgtQrPayload({
        nifEmissor: "5000123456",
        nifCliente: "",
        pais: "AO",
        tipoDoc: "FR",
        estado: "N",
        data: "20261016",
        numDoc: "FR EDK/2",
        hash4Chars: "C3D4",
        totalLiquido: 50000,
        totalIva: 7000,
        totalDocumento: 57000,
      });

      expect(payload).toContain("*B:999999999*");
      expect(payload).toContain("*D:FR*");
      expect(payload).toContain("*I1:50000.00*I2:7000.00*I3:57000.00");
    });
  });

  describe("2. Hash Control e Encadeamento", () => {
    it("deve extrair os 4 caracteres de controle das posições 1, 11, 21 e 31 da assinatura Base64", () => {
      // String simulando assinatura Base64
      // Posição 0: 'X'
      // Posição 10: 'Y'
      // Posição 20: 'Z'
      // Posição 30: 'W'
      const fakeSig = "X123456789Y123456789Z123456789W123456789ABCDEF==";
      const ctrl = extractHashControl(fakeSig);
      expect(ctrl).toBe("XYZW");
    });

    it("deve construir o plaintext de assinatura com documento anterior para encadeamento", () => {
      const plaintext = buildAgtSigningPlaintext({
        invoiceDateYYYYMMDD: "2026-10-16",
        systemEntryDateISO: "2026-10-16T10:30:00",
        documentNumberFull: "FR EDK/2",
        grossTotal: 45000,
        previousDocumentHash: "PREV_SIGNATURE_HASH_BASE64",
      });

      expect(plaintext).toBe(
        "2026-10-16;2026-10-16T10:30:00;FR EDK/2;45000.00;PREV_SIGNATURE_HASH_BASE64"
      );
    });
  });

  describe("3. Serviço Transacional validateAndInvoicePayment (ACID)", () => {
    it("deve validar com sucesso um pagamento pendente gerando FR e faturas associadas", async () => {
      // Mock do retorno da RPC validate_and_invoice_payment
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            payment_id: "pay-123",
            invoice_id: "inv-456",
            document_number: "FR EDK/1",
            doc_type: "FR",
            series: "EDK",
            doc_number: 1,
            invoice_date: "2026-10-16",
            gross_total: 45000,
            net_total: 45000,
            tax_payable: 0,
            cliente_nif: "999999999",
            cliente_nome: "Consumidor Final",
            student_name: "Kamba Aluno",
            hash_control: "1",
            qr_code_payload: "A:5000000000*B:999999999*C:AO*D:FR*E:N*F:20261016*G:FR EDK/1*H:1*I1:45000.00*I2:0.00*I3:45000.00",
            status: "APPROVED",
          },
        ],
        error: null,
      } as any);

      // Mock da query de escola e faturas
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            school_id: "sch-1",
            schools: {
              id: "sch-1",
              name: "Colégio EduCamba",
              tax_id: "5000123456",
              address: "Luanda, Angola",
              logo_url: null,
            },
          },
        }),
        update: vi.fn().mockReturnThis(),
      } as any);

      const result = await validateAndInvoicePayment("pay-123", "admin-999", {
        docType: "FR",
        channels: ["EMAIL", "PUSH"],
        generatePdfAndUpload: true,
      });

      expect(result.ok).toBe(true);
      expect(result.paymentId).toBe("pay-123");
      expect(result.invoiceId).toBe("inv-456");
      expect(result.documentNumber).toBe("FR EDK/1");
      expect(result.docType).toBe("FR");
      expect(result.customerNif).toBe("999999999");
      expect(result.pdfUrl).toBe("https://pub-r2.dev/documents/FR_EDK_1.pdf");
      expect(result.channelsSent).toEqual(["EMAIL", "PUSH"]);
    });

    it("deve rejeitar pagamento se já estiver aprovado/faturado (proteção contra duplo clique)", async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: {
          message: "Pagamento já foi aprovado e faturado anteriormente (duplo clique prevenido).",
          code: "P0001",
        },
      } as any);

      await expect(
        validateAndInvoicePayment("pay-already-approved", "admin-999")
      ).rejects.toThrow("Pagamento já foi aprovado e faturado anteriormente");
    });
  });
});
