import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, FileDown, Loader2, Receipt, ShieldAlert } from "lucide-react";
import {
  CREDIT_NOTE_REASON_CODES,
  CREDIT_NOTE_REASON_LABELS_PT,
  type CreditNoteReasonCode,
  resolveCreditNoteReasonText,
} from "@/lib/fiscal/creditNoteReasons";
import { CreditNoteService, type IssueCreditNoteResult } from "@/lib/fiscal/services/creditNoteService";
import { downloadCreditNotePdfById, openCreditNotePdfInNewTabById } from "@/lib/fiscal/downloadCreditNotePdf";
import { toast } from "@/hooks/use-toast";

const fmtKz = (n: number): string => {
  const formatted = new Intl.NumberFormat("pt-PT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n || 0);
  return `${formatted} Kz`;
};

export interface InvoiceItemOption {
  description: string;
  amount: number;
  quantity?: number;
  ivaPct?: number;
}

export interface CreditNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string;
  documentNumber: string;
  grossTotal: number;
  alreadyCredited?: number;
  items?: InvoiceItemOption[];
  onSuccess?: (result: IssueCreditNoteResult) => void;
}

export const CreditNoteModal: React.FC<CreditNoteModalProps> = ({
  isOpen,
  onClose,
  invoiceId,
  documentNumber,
  grossTotal,
  alreadyCredited = 0,
  items = [],
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [creditMode, setCreditMode] = useState<"full" | "partial">("full");
  const [reasonCode, setReasonCode] = useState<CreditNoteReasonCode>("value_error");
  const [customReason, setCustomReason] = useState("");
  const [partialAmountInput, setPartialAmountInput] = useState("");
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);
  const [confirmIrreversible, setConfirmIrreversible] = useState(false);

  // Calcular saldo disponível
  const remainingBalance = Math.max(0, grossTotal - alreadyCredited);

  useEffect(() => {
    if (isOpen) {
      setCreditMode("full");
      setReasonCode("value_error");
      setCustomReason("");
      setPartialAmountInput("");
      setSelectedItemIndex(null);
      setConfirmIrreversible(false);
    }
  }, [isOpen]);

  const handleItemSelect = (idxStr: string) => {
    if (idxStr === "all") {
      setSelectedItemIndex(null);
      setPartialAmountInput("");
      return;
    }
    const idx = parseInt(idxStr, 10);
    if (!isNaN(idx) && items[idx]) {
      setSelectedItemIndex(idx);
      setPartialAmountInput(String(items[idx].amount));
    }
  };

  // Valor a creditar calculado
  const currentCreditAmount = (() => {
    if (creditMode === "full") return remainingBalance;
    const p = parseFloat(partialAmountInput.replace(/\./g, "").replace(",", "."));
    return isNaN(p) || p <= 0 ? 0 : p;
  })();

  const isOvercredit = currentCreditAmount > remainingBalance + 0.01;
  const newRemainingBalance = Math.max(0, remainingBalance - currentCreditAmount);

  const handleSubmit = async () => {
    let resolvedReason = "";
    try {
      resolvedReason = resolveCreditNoteReasonText(reasonCode, customReason);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Motivo obrigatório", description: msg, variant: "destructive" });
      return;
    }

    if (resolvedReason.length < 6) {
      toast({
        title: "Motivo muito curto",
        description: "O motivo do estorno deve ter pelo menos 6 caracteres.",
        variant: "destructive",
      });
      return;
    }

    if (currentCreditAmount <= 0) {
      toast({
        title: "Valor inválido",
        description: "Indique um valor válido para estorno.",
        variant: "destructive",
      });
      return;
    }

    if (isOvercredit) {
      toast({
        title: "Sobrecrédito rejeitado",
        description: `O valor (${fmtKz(currentCreditAmount)}) excede o saldo remanescente disponível (${fmtKz(remainingBalance)}).`,
        variant: "destructive",
      });
      return;
    }

    if (!confirmIrreversible) {
      toast({
        title: "Confirmação necessária",
        description: "Deve confirmar que compreende o caráter irreversível do estorno fiscal.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const partialAmount = creditMode === "partial" ? currentCreditAmount : undefined;
      const selectedItemDesc =
        selectedItemIndex !== null && items[selectedItemIndex]
          ? `${items[selectedItemIndex].description}:${items[selectedItemIndex].amount}:${items[selectedItemIndex].ivaPct ?? 0}`
          : undefined;

      const res = await CreditNoteService.issueCreditNote({
        originalInvoiceId: invoiceId,
        reason: resolvedReason,
        partialAmount,
        selectedItemDesc,
      });

      if (!res.ok) {
        toast({
          title: "Erro ao emitir Nota de Crédito",
          description: res.message || "Não foi possível emitir o documento fiscal.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Nota de Crédito Emitida com Sucesso!",
        description: `Documento ${res.documentNumber ?? "NC"} retificando ${documentNumber}.`,
      });

      onClose();
      if (onSuccess) {
        onSuccess(res);
      }

      // Download ou visualização automática do PDF
      if (res.creditNoteId) {
        try {
          await openCreditNotePdfInNewTabById(res.creditNoteId);
        } catch {
          try {
            await downloadCreditNotePdfById(res.creditNoteId);
          } catch {
            // ignora fallback de visualização
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({
        title: "Falha na emissão",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !loading && !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Receipt className="h-5 w-5 text-amber-600" />
            <DialogTitle className="text-lg">Emitir Nota de Crédito (Estorno AGT)</DialogTitle>
          </div>
          <DialogDescription>
            Retificação oficial da fatura <strong className="text-foreground">{documentNumber}</strong> em conformidade com o Decreto Presidencial n.º 292/18.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Alerta Legal de Irreversibilidade */}
          <Alert variant="destructive" className="bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-xs font-bold uppercase tracking-wider">Ato Fiscal Irreversível</AlertTitle>
            <AlertDescription className="text-xs">
              A emissão da Nota de Crédito gera uma assinatura digital própria na AGT e não pode ser cancelada nem apagada. Os dados constarão no SAF-T (AO) da escola.
            </AlertDescription>
          </Alert>

          {/* Resumo Financeiro da Fatura de Origem */}
          <div className="grid grid-cols-3 gap-2 p-3 rounded-lg border bg-muted/40 text-xs">
            <div>
              <span className="text-muted-foreground block">Total Original:</span>
              <span className="font-bold text-foreground text-sm">{fmtKz(grossTotal)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Já Creditado:</span>
              <span className="font-bold text-rose-600 text-sm">
                {alreadyCredited > 0 ? `-${fmtKz(alreadyCredited)}` : "0 Kz"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Saldo Disponível:</span>
              <span className="font-bold text-emerald-600 text-sm">{fmtKz(remainingBalance)}</span>
            </div>
          </div>

          {/* Tipo de Estorno: Total vs Parcial */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Tipo de Estorno</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={creditMode === "full" ? "default" : "outline"}
                size="sm"
                className="w-full text-xs"
                onClick={() => {
                  setCreditMode("full");
                  setPartialAmountInput("");
                  setSelectedItemIndex(null);
                }}
              >
                Anulação Total ({fmtKz(remainingBalance)})
              </Button>
              <Button
                type="button"
                variant={creditMode === "partial" ? "default" : "outline"}
                size="sm"
                className="w-full text-xs"
                onClick={() => setCreditMode("partial")}
              >
                Estorno Parcial / Por Linha
              </Button>
            </div>
          </div>

          {/* Seletor de Linha / Valor Parcial */}
          {creditMode === "partial" && (
            <div className="space-y-3 p-3 rounded-md border bg-card">
              {items.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Selecionar Linha da Fatura (Opcional)</Label>
                  <Select
                    value={selectedItemIndex !== null ? String(selectedItemIndex) : "all"}
                    onValueChange={handleItemSelect}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="Escolha um item para estornar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Digitar valor personalizado...</SelectItem>
                      {items.map((it, idx) => (
                        <SelectItem key={idx} value={String(idx)}>
                          {it.description} — {fmtKz(it.amount)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs">Valor do Estorno (Kz) *</Label>
                <Input
                  type="text"
                  placeholder="Ex: 15.000,00"
                  value={partialAmountInput}
                  onChange={(e) => setPartialAmountInput(e.target.value)}
                  className="font-mono text-sm"
                />
                {isOvercredit && (
                  <p className="text-[11px] text-destructive flex items-center gap-1 mt-1">
                    <AlertTriangle className="h-3 w-3" />
                    O valor excede o saldo remanescente ({fmtKz(remainingBalance)}).
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Motivo Obrigatório AGT */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Motivo da Nota de Crédito (Regra AGT) *</Label>
            <Select
              value={reasonCode}
              onValueChange={(v) => setReasonCode(v as CreditNoteReasonCode)}
            >
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CREDIT_NOTE_REASON_CODES.map((code) => (
                  <SelectItem key={code} value={code} className="text-xs">
                    {CREDIT_NOTE_REASON_LABELS_PT[code]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {reasonCode === "other" ? (
              <div className="space-y-1 pt-1">
                <Label className="text-[11px] text-muted-foreground">Especifique o motivo detalhado (mínimo 6 caracteres) *</Label>
                <Textarea
                  placeholder="Ex: Cancelamento de propina por transferência escolar..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  rows={2}
                  className="text-xs"
                />
              </div>
            ) : (
              <div className="space-y-1 pt-1">
                <Label className="text-[11px] text-muted-foreground">Observação complementar (opcional)</Label>
                <Input
                  placeholder="Ex: Ref. Reunião de Diretoria de 20/Out..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  className="text-xs"
                />
              </div>
            )}
          </div>

          {/* Resumo do Impacto */}
          <div className="p-3 rounded-md bg-amber-500/5 border border-amber-500/20 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor a Estornar:</span>
              <span className="font-bold text-rose-600">-{fmtKz(currentCreditAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Saldo Remanescente da FT:</span>
              <span className="font-bold text-foreground">{fmtKz(newRemainingBalance)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Estado Final da FT:</span>
              <span className="font-semibold text-primary">
                {newRemainingBalance <= 0.01 ? "TOTALMENTE ANULADA (100%)" : "PARCIALMENTE CREDITADA"}
              </span>
            </div>
          </div>

          {/* Checkbox de Confirmação Irreversível */}
          <div className="flex items-start gap-2 pt-1">
            <Checkbox
              id="confirm-credit"
              checked={confirmIrreversible}
              onCheckedChange={(v) => setConfirmIrreversible(v === true)}
            />
            <Label htmlFor="confirm-credit" className="text-xs leading-snug cursor-pointer select-none">
              Confirmo que as informações fiscais e os valores acima indicados são exatos e que este ato não poderá ser desfeito.
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleSubmit}
            disabled={loading || currentCreditAmount <= 0 || isOvercredit || !confirmIrreversible}
            className="gap-2 bg-rose-600 hover:bg-rose-700"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
            Emitir Nota de Crédito
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
