import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AgtCertifiedInvoiceTemplate,
  AgtCertifiedInvoiceData,
} from "./AgtCertifiedInvoiceTemplate";

interface AgtInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceData: AgtCertifiedInvoiceData | null;
  onDownloadPdf?: () => void;
}

export const AgtInvoiceModal: React.FC<AgtInvoiceModalProps> = ({
  isOpen,
  onClose,
  invoiceData,
  onDownloadPdf,
}) => {
  if (!invoiceData) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-4 sm:p-6 bg-slate-900/95 border-slate-700">
        <DialogHeader className="no-print">
          <DialogTitle className="text-white text-lg flex items-center justify-between">
            <span>Visualização da Fatura Certificada AGT</span>
            <span className="text-xs font-mono font-normal text-slate-400">
              {invoiceData.documentNumber}
            </span>
          </DialogTitle>
          <DialogDescription className="text-slate-400 text-xs">
            Documento em conformidade com o Decreto Presidencial n.º 292/18 e especificações AGT Angola.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          <AgtCertifiedInvoiceTemplate
            data={invoiceData}
            onDownloadPdf={onDownloadPdf}
            showActions={true}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AgtInvoiceModal;
