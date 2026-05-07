import { useRef, useState, useCallback, useEffect } from "react";
import ReactSignatureCanvas from "react-signature-canvas";
import { RotateCcw, CheckCircle2, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Props {
  onSave: (dataUrl: string) => void;
  onClear?: () => void;
  disabled?: boolean;
  /** Already-saved signature to show in read-only mode */
  existingDataUrl?: string | null;
  className?: string;
}

export function SignatureCanvas({ onSave, onClear, disabled, existingDataUrl, className }: Props) {
  const canvasRef = useRef<ReactSignatureCanvas | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [confirmed, setConfirmed] = useState(false);

  // If there's an existing signature, show it as confirmed
  useEffect(() => {
    if (existingDataUrl) {
      setConfirmed(true);
      setIsEmpty(false);
    }
  }, [existingDataUrl]);

  const handleClear = useCallback(() => {
    canvasRef.current?.clear();
    setIsEmpty(true);
    setConfirmed(false);
    onClear?.();
  }, [onClear]);

  const handleConfirm = useCallback(() => {
    if (!canvasRef.current || canvasRef.current.isEmpty()) return;
    const dataUrl = canvasRef.current.getTrimmedCanvas().toDataURL("image/png");
    setConfirmed(true);
    onSave(dataUrl);
  }, [onSave]);

  const handleEnd = useCallback(() => {
    if (canvasRef.current && !canvasRef.current.isEmpty()) {
      setIsEmpty(false);
      setConfirmed(false);
    }
  }, []);

  if (confirmed && existingDataUrl) {
    return (
      <div className={cn("flex flex-col items-center gap-3", className)}>
        <div className="w-full rounded-2xl border-2 border-pastel-green bg-pastel-green/10 p-3">
          <img
            src={existingDataUrl}
            alt="Assinatura"
            className="mx-auto max-h-24 object-contain"
          />
        </div>
        <div className="flex items-center gap-2 text-sm font-medium text-pastel-green-foreground">
          <CheckCircle2 className="h-4 w-4" />
          Assinatura registada
        </div>
        {!disabled && (
          <button
            onClick={handleClear}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Assinar novamente
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <PenLine className="h-4 w-4" />
        Assine abaixo com o dedo ou rato
      </div>

      <div
        className={cn(
          "relative w-full overflow-hidden rounded-2xl border-2 transition-colors",
          confirmed
            ? "border-pastel-green bg-pastel-green/10"
            : isEmpty
              ? "border-dashed border-border bg-muted/30"
              : "border-pastel-blue bg-background",
          disabled && "pointer-events-none opacity-60",
        )}
        style={{ touchAction: "none" }}
      >
        {isEmpty && !confirmed && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-sm text-muted-foreground/50">Área de assinatura</span>
          </div>
        )}
        <ReactSignatureCanvas
          ref={canvasRef}
          onEnd={handleEnd}
          canvasProps={{
            className: "w-full",
            style: { height: 160, display: "block" },
          }}
          backgroundColor="transparent"
          penColor="#1a1a1a"
          dotSize={2}
          minWidth={1.5}
          maxWidth={3}
          throttle={16}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleClear}
          disabled={isEmpty || disabled}
          className={cn(
            "flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground shadow-soft transition-colors",
            "hover:bg-muted/60 disabled:pointer-events-none disabled:opacity-40",
          )}
        >
          <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
          Limpar
        </button>

        <Button
          onClick={handleConfirm}
          disabled={isEmpty || disabled || confirmed}
          className={cn(
            "flex-1 rounded-full font-semibold shadow-soft",
            confirmed
              ? "bg-pastel-green text-pastel-green-foreground"
              : "bg-pastel-blue text-pastel-blue-foreground",
          )}
        >
          {confirmed ? (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Assinatura confirmada
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Confirmar assinatura
            </>
          )}
        </Button>
      </div>

      {confirmed && !existingDataUrl && (
        <p className="text-center text-xs text-pastel-green-foreground">
          ✓ Assinatura capturada. Pode agora submeter o documento.
        </p>
      )}
    </div>
  );
}
