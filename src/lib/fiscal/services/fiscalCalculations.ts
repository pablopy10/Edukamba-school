import {
  CalculatedFiscalDocument,
  CalculatedFiscalLine,
  FiscalDocumentInput,
  FiscalLineInput,
  FiscalTaxSummaryItem,
} from "../types";

/**
 * Arredondamento bancário standard (half-up) para 2 casas decimais.
 * Evita aberrações de ponto flutuante do JavaScript (ex: 40 * 0.14).
 */
export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Converte valor para string decimal formatada com 2 casas decimais.
 */
export function formatMoney(amount: number): string {
  return roundMoney(amount).toFixed(2);
}

/**
 * Valida linha de documento com regras estritas de isenção de IVA da AGT.
 */
export function validateFiscalLineTax(line: FiscalLineInput, lineIndex: number): void {
  if (line.taxPercentage < 0 || line.taxPercentage > 100) {
    throw new Error(
      `Linha ${lineIndex + 1}: Taxa de IVA inválida (${line.taxPercentage}%). Deve estar entre 0 e 100.`
    );
  }

  if (line.taxPercentage === 0) {
    if (!line.taxExemptionCode || !line.taxExemptionCode.trim()) {
      throw new Error(
        `Linha ${lineIndex + 1} (${line.productDescription}): Isenção de IVA (0%) exige obrigatoriamente um código oficial AGT (ex: M02, M04, M11).`
      );
    }
    if (!line.taxExemptionReason || !line.taxExemptionReason.trim()) {
      throw new Error(
        `Linha ${lineIndex + 1} (${line.productDescription}): Isenção de IVA (0%) exige obrigatoriamente a fundamentação legal (TaxExemptionReason).`
      );
    }
  }
}

/**
 * Atribui código de taxa AGT caso não tenha sido explicitamente passado.
 */
export function resolveTaxCode(taxPercentage: number, explicitCode?: string): string {
  if (explicitCode && explicitCode.trim()) return explicitCode.trim().toUpperCase();
  if (taxPercentage === 0) return "ISE";
  if (taxPercentage >= 14) return "NOR";
  return "RED";
}

/**
 * Motor central de cálculo financeiro e tributário da AGT para documentos fiscais.
 */
export function calculateFiscalDocument(input: FiscalDocumentInput): CalculatedFiscalDocument {
  if (!input.lines || input.lines.length === 0) {
    throw new Error("O documento deve conter pelo menos uma linha de artigo/serviço.");
  }

  // 1. Calcular valores brutos e descontos por linha
  let sumGrossBeforeDiscount = 0;
  let sumLineDiscounts = 0;

  const rawLineCalculations = input.lines.map((line, idx) => {
    validateFiscalLineTax(line, idx);

    const qty = Number(line.quantity) || 1;
    const unitPrice = roundMoney(Number(line.unitPrice) || 0);
    const grossBeforeDiscount = roundMoney(qty * unitPrice);

    let lineDiscount = 0;
    if (line.discountPct && line.discountPct > 0) {
      lineDiscount = roundMoney(grossBeforeDiscount * (line.discountPct / 100));
    } else if (line.discountAmount && line.discountAmount > 0) {
      lineDiscount = roundMoney(line.discountAmount);
    }

    // O desconto de linha não pode exceder o total da linha
    if (lineDiscount > grossBeforeDiscount) {
      lineDiscount = grossBeforeDiscount;
    }

    sumGrossBeforeDiscount += grossBeforeDiscount;
    sumLineDiscounts += lineDiscount;

    return {
      line,
      idx: idx + 1,
      qty,
      unitPrice,
      grossBeforeDiscount,
      lineDiscount,
      netAfterLineDiscount: roundMoney(grossBeforeDiscount - lineDiscount),
    };
  });

  sumGrossBeforeDiscount = roundMoney(sumGrossBeforeDiscount);
  sumLineDiscounts = roundMoney(sumLineDiscounts);

  // 2. Desconto Global no Cabeçalho
  const totalSubtotalAfterLineDiscounts = roundMoney(sumGrossBeforeDiscount - sumLineDiscounts);
  let globalDiscountAmount = 0;

  if (input.discountGlobalPct && input.discountGlobalPct > 0) {
    globalDiscountAmount = roundMoney(
      totalSubtotalAfterLineDiscounts * (input.discountGlobalPct / 100)
    );
  } else if (input.discountGlobalAmount && input.discountGlobalAmount > 0) {
    globalDiscountAmount = roundMoney(input.discountGlobalAmount);
  }

  if (globalDiscountAmount > totalSubtotalAfterLineDiscounts) {
    globalDiscountAmount = totalSubtotalAfterLineDiscounts;
  }

  // 3. Ratear desconto global proporcionalmente entre as linhas para apuramento da base de incidência
  const calculatedLines: CalculatedFiscalLine[] = [];
  const taxSummaryMap = new Map<string, FiscalTaxSummaryItem>();

  let accumulatedProratedDiscount = 0;

  for (let i = 0; i < rawLineCalculations.length; i++) {
    const item = rawLineCalculations[i];
    let proratedGlobal = 0;

    if (globalDiscountAmount > 0 && totalSubtotalAfterLineDiscounts > 0) {
      if (i === rawLineCalculations.length - 1) {
        // Na última linha, ajusta resíduo de arredondamento
        proratedGlobal = roundMoney(globalDiscountAmount - accumulatedProratedDiscount);
      } else {
        const ratio = item.netAfterLineDiscount / totalSubtotalAfterLineDiscounts;
        proratedGlobal = roundMoney(globalDiscountAmount * ratio);
        accumulatedProratedDiscount += proratedGlobal;
      }
    }

    const totalDiscountOnLine = roundMoney(item.lineDiscount + proratedGlobal);
    const lineNetAmount = roundMoney(item.grossBeforeDiscount - totalDiscountOnLine);

    // Calcular IVA sobre a base tributável efectiva
    const taxRate = item.line.taxPercentage;
    const taxCode = resolveTaxCode(taxRate, item.line.taxCode);
    const lineTaxAmount = taxRate > 0 ? roundMoney(lineNetAmount * (taxRate / 100)) : 0;
    const lineTotalGross = roundMoney(lineNetAmount + lineTaxAmount);

    const calculatedLine: CalculatedFiscalLine = {
      ...item.line,
      lineNumber: item.idx,
      unitOfMeasure: item.line.unitOfMeasure || "UN",
      taxCode,
      grossAmountBeforeDiscount: item.grossBeforeDiscount,
      effectiveDiscountAmount: totalDiscountOnLine,
      netAmount: lineNetAmount,
      taxAmount: lineTaxAmount,
      totalGrossAmount: lineTotalGross,
    };

    calculatedLines.push(calculatedLine);

    // Agregação no Resumo de Impostos (TaxSummary)
    const taxKey = `${taxCode}_${taxRate}_${item.line.taxExemptionCode || ""}`;
    const existingSummary = taxSummaryMap.get(taxKey);
    if (existingSummary) {
      existingSummary.taxBase = roundMoney(existingSummary.taxBase + lineNetAmount);
      existingSummary.taxAmount = roundMoney(existingSummary.taxAmount + lineTaxAmount);
    } else {
      taxSummaryMap.set(taxKey, {
        taxCode,
        taxPercentage: taxRate,
        taxBase: lineNetAmount,
        taxAmount: lineTaxAmount,
        taxExemptionCode: item.line.taxExemptionCode,
        taxExemptionReason: item.line.taxExemptionReason,
      });
    }
  }

  // 4. Totais Finais do Documento
  let totalNet = 0;
  let totalTax = 0;
  let totalGross = 0;

  for (const cl of calculatedLines) {
    totalNet = roundMoney(totalNet + cl.netAmount);
    totalTax = roundMoney(totalTax + cl.taxAmount);
    totalGross = roundMoney(totalGross + cl.totalGrossAmount);
  }

  const taxSummary = Array.from(taxSummaryMap.values());

  return {
    docType: input.docType,
    lines: calculatedLines,
    subtotalGross: sumGrossBeforeDiscount,
    totalLineDiscounts: sumLineDiscounts,
    globalDiscountAmount,
    totalDiscountAmount: roundMoney(sumLineDiscounts + globalDiscountAmount),
    totalNet,
    totalTax,
    totalGross,
    taxSummary,
  };
}
