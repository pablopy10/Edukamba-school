import { useMemo, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
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

type Props = { schoolId: string };

export function SaftExportCard({ schoolId }: Props) {
  const { t } = useTranslation("pages", { keyPrefix: "financas.saft" });
  const { t: tCommon } = useTranslation("common");

  const monthOpts = useMemo(() => {
    const names = tCommon("dashboard.calendar_months_long", { returnObjects: true }) as string[];
    return names.map((l, i) => ({ v: String(i + 1), l }));
  }, [tCommon]);

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
          "invoice_date, document_number, document_hash, digital_signature_sha1_b64, hash_control, invoice_issued_at, cliente_nome, cliente_nif, gross_total, currency, exemption_code, exemption_reason, line_description, invoice_status, cancellation_reason, cancelled_at",
        )
        .eq("school_id", schoolId)
        .order("invoice_date", { ascending: true });
      if (iErr) throw iErr;

      const inv: SaftInvoiceRow[] = (rows ?? []).map((r: Record<string, unknown>) => ({
        invoice_date: String(r.invoice_date ?? ""),
        document_number: String(r.document_number ?? ""),
        document_hash: r.document_hash ? String(r.document_hash) : null,
        digital_signature_sha1_b64: r.digital_signature_sha1_b64
          ? String(r.digital_signature_sha1_b64)
          : null,
        hash_control: r.hash_control ? String(r.hash_control) : null,
        invoice_issued_at: r.invoice_issued_at ? String(r.invoice_issued_at) : null,
        customer_name: String(r.cliente_nome ?? ""),
        customer_nif: String(r.cliente_nif ?? ""),
        gross_total: Number(r.gross_total ?? 0),
        currency: r.currency ? String(r.currency) : "AOA",
        exemption_code: r.exemption_code ? String(r.exemption_code) : "M11",
        exemption_reason: r.exemption_reason ? String(r.exemption_reason) : "Isenção no domínio da educação",
        line_description: r.line_description ? String(r.line_description) : undefined,
        invoice_status: r.invoice_status ? String(r.invoice_status) : "N",
        cancellation_reason: r.cancellation_reason ? String(r.cancellation_reason) : null,
        cancelled_at: r.cancelled_at ? String(r.cancelled_at) : null,
      }));

      const prodTax = import.meta.env.VITE_SAFT_PRODUCT_COMPANY_TAX_ID?.trim();

      const xml = generateSaftXml({
        year,
        month,
        school: {
          name: school?.name ?? t("default_school_name"),
          fiscalName: "PJ AB- SERVICOS LDA",
          taxRegistrationNumber: school?.nif ?? null,
          address: school?.address ?? null,
        },
        productCompanyTaxId: prodTax?.length ? prodTax : undefined,
        invoices: inv,
      });

      const fn = `SAFT_${schoolId.slice(0, 8)}_${year}-${String(month).padStart(2, "0")}.xml`;
      downloadSaftXmlInBrowser(fn, xml);
      toast({
        title: t("toast_generated_title"),
        description: t("toast_generated_desc", { filename: fn }),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: t("toast_error_title"), description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          <Trans
            t={t}
            i18nKey="description"
            components={{
              1: <code className="text-xs font-mono" />,
              2: <code className="text-xs font-mono" />,
            }}
          />
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">{t("label_month")}</label>
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
          <label className="text-xs font-medium text-muted-foreground">{t("label_year")}</label>
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
          {t("download_button")}
        </Button>
      </CardContent>
    </Card>
  );
}
