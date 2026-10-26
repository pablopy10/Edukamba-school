import QRCode from "qrcode";
import { formatMoneyDecimal } from "../crypto/agtCrypto";

export interface AgtQrParams {
  /** NIF da entidade emissora (Escola) */
  nifEmissor: string;
  /** NIF do adquirente (ou 999999999 para Consumidor Final) */
  nifCliente: string;
  /** Código do país (ex: 'AO') */
  pais: string;
  /** Tipo de documento ('FT', 'FR', 'NC', 'ND') */
  tipoDoc: string;
  /** Estado do documento: 'N' (Normal) ou 'A' (Anulado) */
  estado: "N" | "A" | string;
  /** Data no formato YYYYMMDD ou YYYY-MM-DD */
  data: string;
  /** Identificação completa do documento, ex: 'FT 2026/1' */
  numDoc: string;
  /** Os 4 caracteres de controlo do hash */
  hash4Chars: string;
  /** Total Líquido / Incidência */
  totalLiquido: number | string;
  /** Total do IVA */
  totalIva: number | string;
  /** Total do Documento / Bruto */
  totalDocumento: number | string;
  /** Formato de saída: 'structured' (Padrão A:*B:*C:*) ou 'url' (Padrão Quiosque AGT Oficial) */
  format?: "structured" | "url";
}

/**
 * Constrói o URL oficial da AGT (Administração Geral Tributária - Angola)
 * para consulta e validação imediata de faturas eletrónicas no Quiosque Tributário.
 * Em conformidade com o Manual de Integração API Facturação Electrónica e Decreto Presidencial n.º 292/18:
 * https://quiosqueagt.minfin.gov.ao/facturacao-eletronica/consultar-fe?emissor={NIF}&document={NUM_DOC}
 */
export function buildAgtQrUrl(params: {
  nifEmissor: string;
  numDoc: string;
}): string {
  const nifEmissor = (params.nifEmissor || "5000000000").trim();
  const numDoc = (params.numDoc || "").trim();
  return `https://quiosqueagt.minfin.gov.ao/facturacao-eletronica/consultar-fe?emissor=${encodeURIComponent(nifEmissor)}&document=${encodeURIComponent(numDoc)}`;
}

/**
 * Normaliza data para o padrão de 8 dígitos (YYYYMMDD) exigido no QR Code AGT.
 */
function normalizeDateYYYYMMDD(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 8) {
    return digits.slice(0, 8);
  }
  return raw.trim();
}

/**
 * Constrói a string do QR Code oficial da AGT Angola:
 * No formato 'structured' (padrão):
 * A:{NIF_EMISSOR}*B:{NIF_CLIENTE}*C:{PAIS}*D:{TIPO_DOC}*E:{ESTADO}*F:{DATA}*G:{NUM_DOC}*H:{HASH_4_CHARS}*I1:{TOTAL_LIQUIDO}*I2:{TOTAL_IVA}*I3:{TOTAL_DOCUMENTO}
 * No formato 'url':
 * https://quiosqueagt.minfin.gov.ao/facturacao-eletronica/consultar-fe?emissor={NIF}&document={NUM_DOC}
 */
export function buildAgtQrPayload(params: AgtQrParams): string {
  if (params.format === "url") {
    return buildAgtQrUrl({ nifEmissor: params.nifEmissor, numDoc: params.numDoc });
  }

  const nifEmissor = params.nifEmissor.trim();
  const nifCliente = (params.nifCliente || "999999999").trim();
  const pais = (params.pais || "AO").trim().toUpperCase();
  const tipoDoc = params.tipoDoc.trim().toUpperCase();
  const estado = (params.estado || "N").trim().toUpperCase();
  const data = normalizeDateYYYYMMDD(params.data);
  const numDoc = params.numDoc.trim();
  const hash4 = params.hash4Chars.trim();
  const i1 = formatMoneyDecimal(params.totalLiquido);
  const i2 = formatMoneyDecimal(params.totalIva);
  const i3 = formatMoneyDecimal(params.totalDocumento);

  return `A:${nifEmissor}*B:${nifCliente}*C:${pais}*D:${tipoDoc}*E:${estado}*F:${data}*G:${numDoc}*H:${hash4}*I1:${i1}*I2:${i2}*I3:${i3}`;
}

/**
 * Analisa uma string do QR Code AGT e extrai os campos estruturados.
 * Suporta tanto a URL oficial de validação da AGT quanto a string delimitada por asteriscos.
 */
export function parseAgtQrPayload(payload: string): Partial<AgtQrParams> {
  if (!payload) return {};

  // Se for o URL oficial de validação da AGT
  if (payload.includes("quiosqueagt.minfin.gov.ao") || payload.includes("consultar-fe")) {
    try {
      const url = new URL(payload);
      return {
        nifEmissor: url.searchParams.get("emissor") || undefined,
        numDoc: url.searchParams.get("document") || undefined,
        pais: "AO",
      };
    } catch {
      /* Continua para fallback estruturado caso não seja URL válida */
    }
  }

  const parts = payload.split("*");
  const result: Record<string, string> = {};

  for (const part of parts) {
    const colonIdx = part.indexOf(":");
    if (colonIdx > 0) {
      const key = part.slice(0, colonIdx);
      const val = part.slice(colonIdx + 1);
      result[key] = val;
    }
  }

  return {
    nifEmissor: result["A"],
    nifCliente: result["B"],
    pais: result["C"],
    tipoDoc: result["D"],
    estado: result["E"],
    data: result["F"],
    numDoc: result["G"],
    hash4Chars: result["H"],
    totalLiquido: result["I1"] ? parseFloat(result["I1"]) : undefined,
    totalIva: result["I2"] ? parseFloat(result["I2"]) : undefined,
    totalDocumento: result["I3"] ? parseFloat(result["I3"]) : undefined,
  };
}

/**
 * Gera o DataURL em base64 da imagem PNG do QR Code para exibição em PDF ou HTML.
 * Por padrão usa resolução nítida de 512px e margem de 4 módulos (quiet zone oficial ISO/IEC 18004).
 */
export async function generateAgtQrDataUrl(
  payload: string,
  options?: { width?: number; margin?: number; errorCorrectionLevel?: "L" | "M" | "Q" | "H" }
): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: options?.errorCorrectionLevel ?? "M",
    width: options?.width ?? 512,
    margin: options?.margin ?? 4,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
  });
}
