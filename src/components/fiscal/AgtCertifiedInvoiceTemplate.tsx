import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Printer, Download, Copy, CheckCircle2, ShieldCheck, AlertTriangle } from "lucide-react";
import { buildAgtQrPayload, buildAgtQrUrl } from "@/lib/fiscal/qr/agtQrCode";

export interface AgtCertifiedInvoiceLine {
  lineNumber: number;
  description: string;
  quantity: number;
  unitPrice: number; // Preço unitário sem imposto
  discountAmount?: number; // Desconto em valor
  discountPct?: number; // Desconto em percentagem (ex: 5 para 5%)
  taxPercentage: number; // Ex: 14, 7, 0
  taxExemptionCode?: string; // Ex: "M02", "M11", "M04"
  taxExemptionReason?: string; // Ex: "Isenção no domínio da educação (Artigo 12.º do CIVA)"
  totalNet: number; // Total Líquido da linha (sem imposto)
  totalGross?: number; // Total com imposto
}

export interface AgtTaxSummaryItem {
  taxLabel: string; // Ex: "Isento - M11", "IVA Normal (14%)"
  taxRate: number; // 0, 14, 7
  taxBase: number; // Base de Incidência
  taxAmount: number; // Valor do IVA
  exemptionCode?: string;
  exemptionReason?: string;
}

export interface AgtCertifiedInvoiceData {
  // A. Cabeçalho (Partes Envolvidas)
  school: {
    name: string;
    nif: string;
    address: string;
    phone?: string | null;
    email?: string | null;
    logoUrl?: string | null;
  };
  customer: {
    name?: string | null;
    address?: string | null;
    nif?: string | null; // Se vazio -> 999999999 e Consumidor Final
  };
  student?: {
    name?: string | null;
    classroom?: string | null;
    academicYear?: string | null;
  };
  copyType?: "Original" | "Duplicado" | "2.ª via em conformidade com o original";

  // B. Metadados do Documento
  docType: "FT" | "FR" | "NC" | "ND" | "PF" | string;
  documentNumber: string; // Ex: "FR 2026/145"
  seriesCode?: string;
  invoiceDate: string; // AAAA-MM-DD
  systemEntryDate: string; // AAAA-MM-DD HH:MM:SS
  originReference?: {
    documentNumber: string; // Ex: "FT 2026/22"
    documentDate?: string; // Ex: "2026-09-15"
    reason?: string; // Motivo da retificação (NC) ou conversão
  } | null;

  // C. Tabela de Linhas (Itens Faturados)
  lines: AgtCertifiedInvoiceLine[];

  // D. Quadro de Resumo de Impostos e Totais Financeiros
  taxSummary: AgtTaxSummaryItem[];
  totals: {
    totalNet: number; // Total Ilíquido (Sem impostos)
    totalDiscount: number; // Total de Descontos
    totalTax: number; // Total de IVA
    totalGross: number; // Total a Pagar / Total do Documento (em Kwanzas - AOA)
  };

  // E. Rodapé Fiscal e Elementos de Certificação (CRÍTICO)
  hash: string; // Hash SHA-1 completo assinado
  hashControl?: string; // 4 caracteres: hash[0] + hash[10] + hash[20] + hash[30]
  certificationNumber?: string; // Ex: "99/AGT/2026"
  softwareVersion?: string; // Ex: "1.0.0"
  qrCodePayload?: string;
  qrCodeDataUrl?: string;
  isCancelled?: boolean;
  cancellationReason?: string | null;
}

export interface AgtCertifiedInvoiceTemplateProps {
  data: AgtCertifiedInvoiceData;
  onDownloadPdf?: () => void;
  showActions?: boolean;
  className?: string;
}

export const AgtCertifiedInvoiceTemplate: React.FC<AgtCertifiedInvoiceTemplateProps> = ({
  data,
  onDownloadPdf,
  showActions = true,
  className = "",
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(data.qrCodeDataUrl || null);
  const [selectedVia, setSelectedVia] = useState<"Original" | "Duplicado" | "2.ª via em conformidade com o original">(
    data.copyType || "Original"
  );
  const [copiedPayload, setCopiedPayload] = useState(false);

  // Normalização do NIF e Nome do Adquirente (Regra AGT: 999999999 / Consumidor Final)
  const isGenericConsumer =
    !data.customer.nif || data.customer.nif.trim() === "" || data.customer.nif.trim() === "999999999";
  const customerNif = isGenericConsumer ? "999999999" : data.customer.nif?.trim();
  const customerName = isGenericConsumer
    ? data.customer.name?.trim() || "Consumidor Final"
    : data.customer.name?.trim() || "Cliente";
  const customerAddress = data.customer.address?.trim() || "Luanda, Angola";

  // Identificação do Tipo de Documento em Destaque
  const docTypeUpper = (data.docType || "FR").toUpperCase();
  const docTypeLabel =
    docTypeUpper === "FT"
      ? "FATURA"
      : docTypeUpper === "FR"
      ? "FATURA / RECIBO"
      : docTypeUpper === "NC"
      ? "NOTA DE CRÉDITO"
      : docTypeUpper === "ND"
      ? "NOTA DE DÉBITO"
      : docTypeUpper === "PF"
      ? "FATURA PRÓ-FORMA"
      : docTypeUpper;

  // Extração dos 4 caracteres do Hash (Índices 0, 10, 20, 30)
  const hashControl = data.hashControl || getHashControl(data.hash) || "0000";
  const certNumber = data.certificationNumber || "99/AGT/2026";
  const softVersion = data.softwareVersion || "1.0.0";
  const certificationLegalText = `${hashControl} - Processado por programa validado n.º ${certNumber} Edukamba v${softVersion}`;

  // Formatação de Dinheiro em Kwanzas (AOA)
  const fmtMoney = (val: number | undefined) => {
    const num = typeof val === "number" && !isNaN(val) ? val : 0;
    return (
      new Intl.NumberFormat("pt-AO", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(num) + " Kz"
    );
  };

  // Montagem do QR Code Oficial AGT (Decreto Presidencial n.º 292/18)
  // Utiliza o URL oficial de consulta do Quiosque Tributário para leitura universal em smartphones
  const qrPayload =
    data.qrCodePayload ||
    buildAgtQrUrl({
      nifEmissor: data.school.nif || "5000000000",
      numDoc: data.documentNumber,
    });

  // Gerar QR Code DataURL caso ainda não esteja disponível
  useEffect(() => {
    let isMounted = true;
    if (data.qrCodeDataUrl) {
      setQrDataUrl(data.qrCodeDataUrl);
      return;
    }
    QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: "M",
      width: 512,
      margin: 4,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((url) => {
        if (isMounted) setQrDataUrl(url);
      })
      .catch((err) => {
        console.error("Erro ao gerar QR code AGT:", err);
      });
    return () => {
      isMounted = false;
    };
  }, [qrPayload, data.qrCodeDataUrl]);

  const handlePrint = () => {
    window.print();
  };

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(qrPayload);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  return (
    <div className={`agt-certified-invoice-container font-sans text-slate-800 ${className}`}>
      {/* Barra de Ações Interativa (Não visível na impressão) */}
      {showActions && (
        <div className="no-print mb-6 p-4 bg-slate-900 text-white rounded-xl shadow-lg flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-sm">Fatura Certificada AGT Angola</h4>
              <p className="text-xs text-slate-400">
                Padrão SAF-T (AO) 1.01_01 &bull; Software Validado Edukamba
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Seletor de Via */}
            <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
              {(["Original", "Duplicado", "2.ª via em conformidade com o original"] as const).map((via) => (
                <button
                  key={via}
                  onClick={() => setSelectedVia(via)}
                  className={`text-xs px-2.5 py-1 rounded transition-colors ${
                    selectedVia === via
                      ? "bg-blue-600 text-white font-medium shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {via === "2.ª via em conformidade com o original" ? "2.ª Via" : via}
                </button>
              ))}
            </div>

            <button
              onClick={handleCopyPayload}
              title="Copiar string oficial do QR Code AGT"
              className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              {copiedPayload ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedPayload ? "Copiado!" : "QR Payload"}</span>
            </button>

            {onDownloadPdf && (
              <button
                onClick={onDownloadPdf}
                className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" />
                <span>Baixar PDF</span>
              </button>
            )}

            <button
              onClick={handlePrint}
              className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 font-medium text-white rounded-lg flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir / Salvar A4</span>
            </button>
          </div>
        </div>
      )}

      {/* ─── FOLHA A4 DA FATURA (Estrutura Rigorosa em 5 Seções) ─── */}
      <div
        className="invoice-a4-page relative mx-auto bg-white p-8 md:p-12 shadow-2xl rounded-sm border border-slate-200 text-slate-800 max-w-[210mm] min-h-[297mm] box-border print:p-0 print:border-none print:shadow-none"
        style={{
          width: "100%",
          maxWidth: "210mm",
          backgroundColor: "#ffffff",
          color: "#1e293b",
        }}
      >
        {/* Marca d'água de Cancelado ou Pró-forma */}
        {data.isCancelled && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 overflow-hidden">
            <div className="transform -rotate-45 text-rose-500/20 text-7xl font-extrabold uppercase tracking-widest border-8 border-rose-500/20 p-8 rounded-2xl select-none">
              DOCUMENTO ANULADO
            </div>
          </div>
        )}
        {docTypeUpper === "PF" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 overflow-hidden">
            <div className="transform -rotate-45 text-slate-400/15 text-5xl font-black uppercase tracking-wider border-4 border-slate-400/20 p-6 rounded-xl select-none text-center">
              ESTE DOCUMENTO NÃO SERVE DE FATURA
            </div>
          </div>
        )}

        {/* ─── SEÇÃO A: CABEÇALHO (Partes Envolvidas & Via) ─── */}
        <header className="border-b-2 border-slate-800/80 pb-5 mb-5">
          {/* Identificação da Via no Canto Superior Direito */}
          <div className="flex justify-end mb-2">
            <span className="inline-block text-[10px] font-bold tracking-wider uppercase px-2.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300">
              {selectedVia}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* Emissor (Escola) */}
            <div className="space-y-1">
              <div className="flex items-center gap-3 mb-2">
                {data.school.logoUrl && (
                  <img
                    src={data.school.logoUrl}
                    alt={data.school.name}
                    className="w-12 h-12 object-contain rounded-md border border-slate-200"
                  />
                )}
                <div>
                  <h1 className="text-lg font-bold text-slate-900 leading-tight">
                    {data.school.name}
                  </h1>
                  <p className="text-xs font-semibold text-slate-700">
                    NIF: <span className="font-mono text-slate-900">{data.school.nif}</span>
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-600 leading-snug">{data.school.address}</p>
              <div className="text-[11px] text-slate-600 flex flex-wrap gap-x-4">
                {data.school.phone && <span>Tel: {data.school.phone}</span>}
                {data.school.email && <span>E-mail: {data.school.email}</span>}
              </div>
            </div>

            {/* Adquirente (Aluno / Encarregado de Educação) */}
            <div className="bg-slate-50/80 p-3.5 rounded-lg border border-slate-200/90 text-xs space-y-1">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1 mb-1.5">
                <span className="font-bold text-slate-800 uppercase tracking-wide text-[10px]">
                  Adquirente / Cliente
                </span>
                <span className="font-mono text-[11px] font-semibold text-slate-900">
                  NIF: {customerNif}
                </span>
              </div>
              <p className="font-bold text-slate-900 text-sm leading-tight">{customerName}</p>
              <p className="text-slate-600">{customerAddress}</p>
              {data.student?.name && (
                <div className="pt-1 mt-1 border-t border-slate-200/70 text-[11px] text-slate-700">
                  <span className="font-medium text-slate-800">Aluno:</span> {data.student.name}
                  {data.student.classroom && (
                    <span className="ml-2 text-slate-500">| Turma: {data.student.classroom}</span>
                  )}
                  {data.student.academicYear && (
                    <span className="ml-2 text-slate-500">| Ano: {data.student.academicYear}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ─── SEÇÃO B: METADADOS DO DOCUMENTO ─── */}
        <section className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-lg p-4 mb-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-[10px] tracking-widest uppercase text-slate-300 font-semibold block">
                Tipo de Documento Fiscal
              </span>
              <h2 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
                <span>{docTypeLabel}</span>
                <span className="text-slate-300 font-mono text-lg font-bold">
                  {data.documentNumber}
                </span>
              </h2>
            </div>

            <div className="flex flex-wrap gap-6 text-right">
              <div>
                <span className="text-[10px] text-slate-300 uppercase block font-semibold">
                  Data de Emissão
                </span>
                <span className="font-mono text-xs font-semibold text-white">
                  {data.invoiceDate.slice(0, 10)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-300 uppercase block font-semibold">
                  Registo no Sistema
                </span>
                <span className="font-mono text-xs font-medium text-slate-200">
                  {data.systemEntryDate || `${data.invoiceDate.slice(0, 10)} 12:00:00`}
                </span>
              </div>
            </div>
          </div>

          {/* Referência de Origem (Para Nota de Crédito ou Conversão de Pró-Forma) */}
          {data.originReference && (
            <div className="mt-3 pt-2.5 border-t border-slate-700/80 text-[11px] flex flex-wrap items-center justify-between text-slate-300">
              <div>
                <span className="font-semibold text-white">Documento de Origem: </span>
                <span className="font-mono text-amber-300 font-bold">
                  {data.originReference.documentNumber}
                </span>
                {data.originReference.documentDate && (
                  <span className="ml-1 text-slate-400">
                    de {data.originReference.documentDate}
                  </span>
                )}
              </div>
              {data.originReference.reason && (
                <div className="italic text-slate-300">
                  <span className="font-semibold not-italic text-white">Motivo: </span>
                  {data.originReference.reason}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ─── SEÇÃO C: TABELA DE LINHAS (ITENS FATURADOS) ─── */}
        <section className="mb-6">
          <table className="w-full text-left border-collapse border border-slate-200">
            <thead>
              <tr className="bg-slate-100/90 text-slate-800 text-[10px] font-bold uppercase tracking-wider border-b border-slate-300">
                <th className="py-2.5 px-2.5 text-center w-10 border-r border-slate-200">N.º</th>
                <th className="py-2.5 px-3 border-r border-slate-200">Descrição</th>
                <th className="py-2.5 px-2 text-center w-12 border-r border-slate-200">Qtd</th>
                <th className="py-2.5 px-3 text-right w-28 border-r border-slate-200">
                  P. Unitário
                </th>
                <th className="py-2.5 px-2 text-center w-16 border-r border-slate-200">Desc.</th>
                <th className="py-2.5 px-2.5 text-center w-20 border-r border-slate-200">
                  Taxa IVA
                </th>
                <th className="py-2.5 px-3 text-right w-32 font-bold">Total Líquido</th>
              </tr>
            </thead>
            <tbody className="text-xs divide-y divide-slate-200">
              {data.lines.map((line, idx) => {
                const isExempt = line.taxPercentage === 0;
                const exemptionCode = line.taxExemptionCode || "M02";
                const exemptionReason =
                  line.taxExemptionReason || "Isento nos termos do Código do IVA";
                const discountDisplay = line.discountPct
                  ? `${line.discountPct}%`
                  : line.discountAmount
                  ? fmtMoney(line.discountAmount)
                  : "—";

                return (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="py-2 px-2.5 text-center font-mono text-slate-500 border-r border-slate-200">
                      {line.lineNumber || idx + 1}
                    </td>
                    <td className="py-2 px-3 border-r border-slate-200">
                      <div className="font-semibold text-slate-900">{line.description}</div>
                      {/* REGRA OBRIGATÓRIA: Se taxa 0%, exibir código e motivo oficial AGT */}
                      {isExempt && (
                        <div className="text-[10px] text-slate-500 italic mt-0.5 flex items-center gap-1">
                          <span className="font-semibold text-slate-700 not-italic">
                            {exemptionCode}:
                          </span>
                          <span>{exemptionReason}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2 text-center font-mono border-r border-slate-200">
                      {line.quantity}
                    </td>
                    <td className="py-2 px-3 text-right font-mono border-r border-slate-200">
                      {fmtMoney(line.unitPrice)}
                    </td>
                    <td className="py-2 px-2 text-center font-mono text-slate-600 border-r border-slate-200">
                      {discountDisplay}
                    </td>
                    <td className="py-2 px-2.5 text-center font-mono font-medium border-r border-slate-200">
                      {isExempt ? "0%" : `${line.taxPercentage}%`}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900">
                      {fmtMoney(line.totalNet)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* ─── SEÇÃO D: RESUMO DE IMPOSTOS E TOTAIS FINANCEIROS ─── */}
        <section className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-6 items-start">
          {/* Tabela de Resumo de IVA (Segregada por Taxa) */}
          <div className="md:col-span-7">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-2">
              Quadro de Resumo de Impostos (IVA)
            </h3>
            <table className="w-full text-left border-collapse border border-slate-200 text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 text-[10px] font-bold uppercase border-b border-slate-200">
                  <th className="py-1.5 px-3 border-r border-slate-200">Taxa / Isenção</th>
                  <th className="py-1.5 px-3 text-right border-r border-slate-200">
                    Incidência (Base)
                  </th>
                  <th className="py-1.5 px-3 text-right">Valor do IVA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                {data.taxSummary.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-1.5 px-3 font-sans text-slate-800 border-r border-slate-200">
                      {item.taxLabel}
                      {item.exemptionCode && (
                        <span className="block text-[10px] text-slate-500 italic">
                          ({item.exemptionCode}) {item.exemptionReason}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-right text-slate-700 border-r border-slate-200">
                      {fmtMoney(item.taxBase)}
                    </td>
                    <td className="py-1.5 px-3 text-right font-semibold text-slate-900">
                      {fmtMoney(item.taxAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totais Financeiros */}
          <div className="md:col-span-5 bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs space-y-2">
            <div className="flex justify-between items-center text-slate-600">
              <span>Total Ilíquido (Sem Imposto):</span>
              <span className="font-mono font-medium text-slate-800">
                {fmtMoney(data.totals.totalNet)}
              </span>
            </div>
            {data.totals.totalDiscount > 0 && (
              <div className="flex justify-between items-center text-emerald-700">
                <span>Total de Descontos:</span>
                <span className="font-mono font-medium">
                  -{fmtMoney(data.totals.totalDiscount)}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center text-slate-600">
              <span>Total de IVA:</span>
              <span className="font-mono font-medium text-slate-800">
                {fmtMoney(data.totals.totalTax)}
              </span>
            </div>

            {/* Total a Pagar em Kwanzas (Destaque Principal) */}
            <div className="pt-2 border-t border-slate-300 flex justify-between items-center">
              <div>
                <span className="block text-[10px] font-bold text-slate-900 uppercase tracking-wider">
                  Total a Pagar
                </span>
                <span className="text-[10px] text-slate-500">Kwanzas (AOA)</span>
              </div>
              <span className="text-base font-extrabold font-mono text-slate-900">
                {fmtMoney(data.totals.totalGross)}
              </span>
            </div>
          </div>
        </section>

        {/* ─── SEÇÃO E: RODAPÉ FISCAL E CERTIFICAÇÃO AGT (CRÍTICO) ─── */}
        <footer className="mt-8 pt-4 border-t-2 border-slate-800/80">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
            {/* QR Code Oficial AGT */}
            <div className="flex-shrink-0 bg-white p-1 rounded border border-slate-200 shadow-sm">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="QR Code Oficial AGT"
                  className="w-28 h-28 object-contain"
                />
              ) : (
                <div className="w-28 h-28 bg-slate-100 flex items-center justify-center text-[10px] text-slate-400">
                  Gerando QR...
                </div>
              )}
            </div>

            {/* Menções Legais Obrigatórias e Assinatura */}
            <div className="flex-1 text-[10px] text-slate-600 space-y-1 text-center sm:text-left">
              {/* Texto Legal de Homologação AGT com os 4 caracteres do Hash */}
              <p className="font-mono font-bold text-slate-900 text-xs leading-relaxed">
                {certificationLegalText}
              </p>

              <p className="text-slate-500 leading-normal">
                Os bens ou serviços foram colocados à disposição do adquirente na data e local
                indicados no presente documento. Documento processado por computador com certificação
                tributária da AGT.
              </p>

              {data.isCancelled && data.cancellationReason && (
                <div className="p-1.5 bg-rose-50 text-rose-700 border border-rose-200 rounded font-medium text-[10px]">
                  <strong>Motivo da Anulação:</strong> {data.cancellationReason}
                </div>
              )}

              <div className="pt-1 flex flex-wrap justify-between items-center text-[9px] text-slate-400 border-t border-slate-200">
                <span>{data.school.name} &bull; NIF {data.school.nif}</span>
                <span>Edukamba Sistema Escolar Certificado</span>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {/* Regras CSS de Impressão A4 de Alta Definição */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 12mm 12mm 12mm;
          }
          body {
            background: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          .invoice-a4-page {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            min-height: auto !important;
          }
        }
      `}</style>
    </div>
  );
};

export default AgtCertifiedInvoiceTemplate;
