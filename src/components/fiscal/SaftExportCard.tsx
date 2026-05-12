import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { generateSaftXml, downloadSaftXmlInBrowser, type SaftInvoiceRow } from "@/lib/fiscal/generateSaftXml";

const monthOpts = [
  { v: "1", l: "Janeiro" }, { v: "2", l: "Fevereiro" }, { v: "3", l: "Março" }, { v: "4", l: "Abril" },
  { v: "5", l: "Maio" }, { v: "6", l: "Junho" }, { v: "7", l: "Julho" }, { v: "8", l: "Agosto" },
  { v: "9", l: "Setembro" }, { v: "10", l: "Outubro" }, { v: "11", l: "Novembro" }, { v: "12", l: "Dezembro" },
];

type Props = { schoolId: string };

export function SaftExportCard({ schoolId }: Props) {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [busy, setBusy] = useState(false);

  const years = useMemo(() => {
    const y = now.getFullYear();
    return [y - 1, y, y + 1];
  }, [now]);

  const runExport = async () => {
    setBusy(true);
    try {
      const { data: school, error: sErr } = await supabase
        .from("schools")
        .select("name, nif, address")
        .eq("id", schoolId)
        .maybeSingle();
      if (sErr) throw sErr;

      const { data: rows, error: iErr } = await supabase
        .from("invoices")
        .select(
          "invoice_date, document_number, document_hash, hash_control, invoice_issued_at, cliente_nome, cliente_nif, gross_total, currency, exemption_code, exemption_reason, line_description",
        )
        .eq("school_id", schoolId)
        .order("invoice_date", { ascending: true });
      if (iErr) throw iErr;

      const inv: SaftInvoiceRow[] = (rows ?? []).map((r: Record<string, unknown>) => ({
        invoice_date: String(r.invoice_date ?? ""),
        document_number: String(r.document_number ?? ""),
        document_hash: r.document_hash ? String(r.document_hash) : null,
        hash_control: r.hash_control ? String(r.hash_control) : null,
        invoice_issued_at: r.invoice_issued_at ? String(r.invoice_issued_at) : null,
        customer_name: String(r.cliente_nome ?? ""),
        customer_nif: String(r.cliente_nif ?? ""),
        gross_total: Number(r.gross_total ?? 0),
        currency: r.currency ? String(r.currency) : "AOA",
        exemption_code: r.exemption_code ? String(r.exemption_code) : "M10",
        exemption_reason: r.exemption_reason ? String(r.exemption_reason) : "Isenção no domínio da educação",
        line_description: r.line_description ? String(r.line_description) : undefined,
      }));

      const prodTax = import.meta.env.VITE_SAFT_PRODUCT_COMPANY_TAX_ID?.trim();

      const xml = generateSaftXml({
        year,
        month,
        school: {
          name: school?.name ?? "Escola",
          taxRegistrationNumber: school?.nif ?? null,
          address: school?.address ?? null,
        },
        productCompanyTaxId: prodTax?.length ? prodTax : undefined,
        invoices: inv,
      });

      const fn = `SAFT_${schoolId.slice(0, 8)}_${year}-${String(month).padStart(2, "0")}.xml`;
      downloadSaftXmlInBrowser(fn, xml);
      toast({ title: "SAF-T gerado", description: `Download: ${fn}` });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro ao gerar SAF-T", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Exportar SAF-T (AGT Angola)</CardTitle>
        <p className="text-sm text-muted-foreground">
          XSD oficial 1.01_01 (estruturas completas como DocumentStatus/SpecialRegimes/two SourceID, não só exemplos resumidos). Header: NIF emitente ≠ NIF produtor —
          pode definir <code className="text-xs font-mono">VITE_SAFT_PRODUCT_COMPANY_TAX_ID</code> para{' '}
          <code className="text-xs font-mono">ProductCompanyTaxID</code>. SAF-T habitualmente obriga software certificado; entrega mensal até ~dia 5 e validação antes do envio ficam ao cargo da AGT/contabilidade.
          Facturas no ficheiro necessitam de hash/control já registados na base.
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Mês</label>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOpts.map((m) => (
                <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Ano</label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" onClick={runExport} disabled={busy} className="gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Descarregar XML
        </Button>
      </CardContent>
    </Card>
  );
}
