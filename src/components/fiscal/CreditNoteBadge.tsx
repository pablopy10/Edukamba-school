import React, { useState } from "react";
import { AlertTriangle, ExternalLink, Loader2, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { openCreditNotePdfInNewTabById, downloadCreditNotePdfById } from "@/lib/fiscal/downloadCreditNotePdf";
import { toast } from "@/hooks/use-toast";

const fmtKz = (n: number): string => {
  const formatted = new Intl.NumberFormat("pt-PT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n || 0);
  return `${formatted} Kz`;
};

export interface CreditNoteBadgeProps {
  creditNoteId?: string | null;
  creditNoteNumber?: string | null;
  creditedAmount?: number | null;
  creditedAt?: string | null;
  creditReason?: string | null;
  isFullCredit?: boolean;
  className?: string;
  onClickPdf?: () => void;
}

/**
 * Badge visual de Nota de Crédito para linhas de pagamentos e faturas.
 * Exibe:
 * - Badge estilizado: [⚠️ Nota de Crédito: NC 2026/X]
 * - Tooltip com: motivo do estorno, data e valor creditado
 * - Link clicável para abrir o PDF da NC correspondente
 */
export const CreditNoteBadge: React.FC<CreditNoteBadgeProps> = ({
  creditNoteId,
  creditNoteNumber,
  creditedAmount,
  creditedAt,
  creditReason,
  isFullCredit,
  className = "",
  onClickPdf,
}) => {
  const [opening, setOpening] = useState(false);

  const docNumber = creditNoteNumber?.trim() || "NC";
  const formattedDate = creditedAt ? new Date(creditedAt).toLocaleDateString("pt-PT") : null;

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (onClickPdf) {
      onClickPdf();
      return;
    }

    if (!creditNoteId) {
      toast({
        title: "Nota de Crédito",
        description: `Documento ${docNumber} vinculado a este pagamento.`,
      });
      return;
    }

    setOpening(true);
    try {
      await openCreditNotePdfInNewTabById(creditNoteId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({
        title: "Erro ao abrir Nota de Crédito",
        description: msg || "A tentar descarregar o PDF...",
        variant: "destructive",
      });
      try {
        await downloadCreditNotePdfById(creditNoteId);
      } catch {
        // ignora fallback
      }
    } finally {
      setOpening(false);
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            disabled={opening}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold font-mono tracking-tight transition-all cursor-pointer border shadow-xs ${
              isFullCredit
                ? "bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
                : "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
            } ${className}`}
            title="Clique para abrir a Nota de Crédito em PDF"
          >
            {opening ? (
              <Loader2 className="h-3 w-3 animate-spin shrink-0 text-amber-600 dark:text-amber-400" />
            ) : (
              <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
            )}
            <span>Nota de Crédito: {docNumber}</span>
            <ExternalLink className="h-2.5 w-2.5 opacity-70 ml-0.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs p-3 text-xs space-y-1.5 shadow-lg">
          <div className="font-bold flex items-center gap-1.5 text-foreground border-b pb-1">
            <Receipt className="h-3.5 w-3.5 text-primary" />
            <span>Estorno Fiscal AGT ({docNumber})</span>
          </div>
          {creditReason && (
            <div>
              <span className="text-muted-foreground">Motivo: </span>
              <span className="font-medium text-foreground">{creditReason}</span>
            </div>
          )}
          {typeof creditedAmount === "number" && creditedAmount > 0 && (
            <div>
              <span className="text-muted-foreground">Valor Creditado: </span>
              <span className="font-semibold text-rose-600 dark:text-rose-400">-{fmtKz(creditedAmount)}</span>
            </div>
          )}
          {formattedDate && (
            <div>
              <span className="text-muted-foreground">Data do Estorno: </span>
              <span className="text-foreground">{formattedDate}</span>
            </div>
          )}
          <div className="text-[10px] text-muted-foreground pt-1 italic">
            Clique no badge para visualizar o PDF homologado.
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export interface CreditNoteAmountDisplayProps {
  originalAmount: number;
  hasCreditNote?: boolean;
  creditNoteNumber?: string | null;
  creditedAmount?: number | null;
  isFullCredit?: boolean;
  creditStatus?: "NONE" | "PARTIALLY_CREDITED" | "FULLY_CREDITED" | string | null;
  className?: string;
}

/**
 * Componente visual para exibir valores financeiros com suporte a sinalização de estorno.
 * - Estorno total: valor original riscado + etiqueta "Estornado Totalmente"
 * - Estorno parcial: valor original + detalhe "Estornado: -X Kz (Saldo: Y Kz)"
 */
export const CreditNoteAmountDisplay: React.FC<CreditNoteAmountDisplayProps> = ({
  originalAmount,
  hasCreditNote,
  creditNoteNumber,
  creditedAmount,
  isFullCredit,
  creditStatus,
  className = "",
}) => {
  const isFullyCredited =
    isFullCredit ||
    creditStatus === "FULLY_CREDITED" ||
    (typeof creditedAmount === "number" && creditedAmount >= (originalAmount - 0.01));

  const isPartiallyCredited =
    !isFullyCredited &&
    (hasCreditNote ||
      creditStatus === "PARTIALLY_CREDITED" ||
      (typeof creditedAmount === "number" && creditedAmount > 0));

  if (!isFullyCredited && !isPartiallyCredited) {
    return <span className={`font-semibold ${className}`}>{fmtKz(originalAmount)}</span>;
  }

  const credited = creditedAmount ?? (isFullyCredited ? originalAmount : 0);
  const remaining = Math.max(0, originalAmount - credited);

  if (isFullyCredited) {
    return (
      <div className={`flex flex-col items-end ${className}`}>
        <span className="line-through opacity-60 text-muted-foreground text-xs font-mono">
          {fmtKz(originalAmount)}
        </span>
        <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-700 border-rose-300 dark:text-rose-300 dark:border-rose-800 px-1 py-0 font-medium">
          Estornado Totalmente
        </Badge>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-end ${className}`}>
      <span className="font-semibold text-xs font-mono">{fmtKz(originalAmount)}</span>
      <span className="text-[10px] text-amber-700 dark:text-amber-400 font-mono">
        Estornado: -{fmtKz(credited)} (Saldo: {fmtKz(remaining)})
      </span>
    </div>
  );
};
