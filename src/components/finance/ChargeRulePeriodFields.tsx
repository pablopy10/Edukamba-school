import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  startValue: string;
  endValue: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  startLabel: string;
  endLabel: string;
  hint?: string;
  disabled?: boolean;
};

/** Período de cobrança com mês e ano explícitos (input nativo type="month"). */
export function ChargeRulePeriodFields({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  startLabel,
  endLabel,
  hint,
  disabled,
}: Props) {
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>{startLabel}</Label>
          <Input
            type="month"
            className="bg-card"
            value={startValue}
            disabled={disabled}
            onChange={(e) => onStartChange(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label>{endLabel}</Label>
          <Input
            type="month"
            className="bg-card"
            value={endValue}
            disabled={disabled}
            onChange={(e) => onEndChange(e.target.value)}
          />
        </div>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
