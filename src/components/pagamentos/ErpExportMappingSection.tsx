import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import type { ErpConfigFields } from "@/lib/erpExport";
import { ERP_HEADER_DEFAULTS } from "@/lib/erpExport";

type Props = { schoolId: string | null };

const emptyForm = (): Record<keyof ErpConfigFields, string> => ({
  header_student_id: "",
  header_student_name: "",
  header_tax_id: "",
  header_amount_paid: "",
  header_payment_date: "",
  header_article_code: "",
  header_payment_method: "",
  default_article_code_propina: "PROPINA",
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
        .select("*")
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
          default_article_code_propina: data.default_article_code_propina ?? "PROPINA",
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
    const payload = {
      school_id: schoolId,
      header_student_id: form.header_student_id.trim() || null,
      header_student_name: form.header_student_name.trim() || null,
      header_tax_id: form.header_tax_id.trim() || null,
      header_amount_paid: form.header_amount_paid.trim() || null,
      header_payment_date: form.header_payment_date.trim() || null,
      header_article_code: form.header_article_code.trim() || null,
      header_payment_method: form.header_payment_method.trim() || null,
      default_article_code_propina: form.default_article_code_propina.trim() || null,
    };
    const { error } = await supabase.from("erp_export_configs").upsert(payload, { onConflict: "school_id" });
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
        <CardTitle className="text-lg">Exportação para ERP / faturação</CardTitle>
        <CardDescription>
          Defina o nome das colunas que o seu software (ex.: Primavera) espera em CSV/Excel. Campos vazios usam os nomes por defeito indicados abaixo.
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
            <div className="grid max-w-md gap-2">
              <Label htmlFor="default_article_code_propina">Código de artigo para propina (valor nas linhas)</Label>
              <Input
                id="default_article_code_propina"
                placeholder="PROPINA"
                value={form.default_article_code_propina}
                onChange={(e) => setForm((f) => ({ ...f, default_article_code_propina: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Para extracurricular, transporte e matrículas são usados códigos internos distintos (ex.: EXTRA_*, TRANSPORTE, MATRICULA_*).
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              O NIF do aluno pode ser preenchido no perfil do aluno (campo fiscal) quando disponível.
            </p>
            <Button type="button" onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar mapeamento
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
