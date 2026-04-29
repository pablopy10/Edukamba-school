import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Package } from "lucide-react";
import { upsertErpExportConfigMerged } from "@/lib/erpExport";

type Props = { schoolId: string | null };

type ArticleCodesForm = {
  default_article_code_propina: string;
  article_code_matricula: string;
  article_code_extracurricular: string;
  article_code_transporte: string;
};

const emptyForm = (): ArticleCodesForm => ({
  default_article_code_propina: "",
  article_code_matricula: "",
  article_code_extracurricular: "",
  article_code_transporte: "",
});

export const ErpArticleCodesCard = ({ schoolId }: Props) => {
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
          "default_article_code_propina, article_code_matricula, article_code_extracurricular, article_code_transporte",
        )
        .eq("school_id", schoolId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        toast({ title: "Erro a carregar códigos", description: error.message, variant: "destructive" });
        setLoading(false);
        return;
      }
      if (data) {
        setForm({
          default_article_code_propina: data.default_article_code_propina ?? "",
          article_code_matricula: data.article_code_matricula ?? "",
          article_code_extracurricular: data.article_code_extracurricular ?? "",
          article_code_transporte: data.article_code_transporte ?? "",
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
      default_article_code_propina: form.default_article_code_propina.trim() || null,
      article_code_matricula: form.article_code_matricula.trim() || null,
      article_code_extracurricular: form.article_code_extracurricular.trim() || null,
      article_code_transporte: form.article_code_transporte.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erro a guardar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Códigos guardados", description: "Usados na coluna de código de artigo ao exportar Excel." });
  };

  if (!schoolId) return null;

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Package className="h-5 w-5 text-primary" />
          Códigos de artigo (faturação)
        </CardTitle>
        <CardDescription>
          Indique os códigos que o seu software de faturação espera por tipo de cobrança. Se deixar em branco, na
          exportação será usado o nome do serviço no Edukamba (ex.: nome da atividade, da rota de transporte).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="code-propinas">Código Propinas</Label>
                <Input
                  id="code-propinas"
                  placeholder="Ex.: ART-PROP"
                  value={form.default_article_code_propina}
                  onChange={(e) => setForm((f) => ({ ...f, default_article_code_propina: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="code-matriculas">Código Matrículas</Label>
                <Input
                  id="code-matriculas"
                  placeholder="Ex.: ART-MAT"
                  value={form.article_code_matricula}
                  onChange={(e) => setForm((f) => ({ ...f, article_code_matricula: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="code-extra">Código Extracurriculares</Label>
                <Input
                  id="code-extra"
                  placeholder="Ex.: ART-EXT"
                  value={form.article_code_extracurricular}
                  onChange={(e) => setForm((f) => ({ ...f, article_code_extracurricular: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="code-transporte">Código Transporte</Label>
                <Input
                  id="code-transporte"
                  placeholder="Ex.: ART-TRANSP"
                  value={form.article_code_transporte}
                  onChange={(e) => setForm((f) => ({ ...f, article_code_transporte: e.target.value }))}
                />
              </div>
            </div>
            <Button type="button" onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar códigos de artigo
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
