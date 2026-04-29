import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import type { ErpConfigFields } from "@/lib/erpExport";
import { ERP_HEADER_DEFAULTS, upsertErpExportConfigMerged } from "@/lib/erpExport";

type Props = { schoolId: string | null };

type HeaderFormKey = keyof Pick<
  ErpConfigFields,
  | "header_student_id"
  | "header_student_name"
  | "header_tax_id"
  | "header_amount_paid"
  | "header_payment_date"
  | "header_article_code"
  | "header_payment_method"
>;

const emptyForm = (): Record<HeaderFormKey, string> => ({
  header_student_id: "",
  header_student_name: "",
  header_tax_id: "",
  header_amount_paid: "",
  header_payment_date: "",
  header_article_code: "",
  header_payment_method: "",
});

export const ErpExportMappingSection = ({ schoolId }: Props) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!schoolId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("erp_export_configs")
        .select(
          "header_student_id, header_student_name, header_tax_id, header_amount_paid, header_payment_date, header_article_code, header_payment_method",
        )
        .eq("school_id", schoolId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        toast({ title: "Erro a carregar configuração ERP", description: error.message, variant: "destructive" });
        setLoading(false);
        return;
      }
      if (data) {
        setForm({
          header_student_id: data.header_student_id ?? "",
          header_student_name: data.header_student_name ?? "",
          header_tax_id: data.header_tax_id ?? "",
          header_amount_paid: data.header_amount_paid ?? "",
          header_payment_date: data.header_payment_date ?? "",
          header_article_code: data.header_article_code ?? "",
          header_payment_method: data.header_payment_method ?? "",
        });
      } else {
        setForm(emptyForm());
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  const save = async () => {
    if (!schoolId) return;
    setSaving(true);
    const { error } = await upsertErpExportConfigMerged(supabase, schoolId, {
      header_student_id: form.header_student_id.trim() || null,
      header_student_name: form.header_student_name.trim() || null,
      header_tax_id: form.header_tax_id.trim() || null,
      header_amount_paid: form.header_amount_paid.trim() || null,
      header_payment_date: form.header_payment_date.trim() || null,
      header_article_code: form.header_article_code.trim() || null,
      header_payment_method: form.header_payment_method.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erro a guardar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Mapeamento guardado", description: "Os cabeçalhos do Excel seguirão estas definições." });
  };

  if (!schoolId) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Colunas do Excel (cabeçalhos)</CardTitle>
        <CardDescription>
          Defina o nome das colunas que o seu software (ex.: Primavera) espera. Campos vazios usam os nomes por defeito
          indicados abaixo. Estes cabeçalhos são aplicados ao ficheiro Excel gerado em baixo e na página Finanças.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["header_student_id", "ID do aluno", ERP_HEADER_DEFAULTS.student_id],
                  ["header_student_name", "Nome do aluno", ERP_HEADER_DEFAULTS.student_name],
                  ["header_tax_id", "NIF / contribuinte", ERP_HEADER_DEFAULTS.tax_id],
                  ["header_amount_paid", "Valor pago", ERP_HEADER_DEFAULTS.amount_paid],
                  ["header_payment_date", "Data do pagamento", ERP_HEADER_DEFAULTS.payment_date],
                  ["header_article_code", "Código do artigo (coluna)", ERP_HEADER_DEFAULTS.article_code],
                  ["header_payment_method", "Método de pagamento", ERP_HEADER_DEFAULTS.payment_method],
                ] as const
              ).map(([key, label, def]) => (
                <div key={key} className="grid gap-2">
                  <Label htmlFor={key}>{label}</Label>
                  <Input
                    id={key}
                    placeholder={`Por defeito: ${def}`}
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                  <p className="text-[11px] text-muted-foreground">Coluna por defeito: {def}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Sem NIF no registo do aluno, a exportação usa o valor placeholder definido para o ERP (ex.: 999999999).
            </p>
            <Button type="button" onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar cabeçalhos
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
