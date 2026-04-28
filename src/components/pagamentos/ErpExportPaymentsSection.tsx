import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileSpreadsheet } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import {
  enrichErpPaymentsWithStudentNames,
  fetchValidatedPaymentsForErpYear,
  resolveStudentsForPayments,
  runErpExcelExport,
  type ErpPaymentExportRow,
} from "@/lib/erpExport";

type ErpPaymentLine = ErpPaymentExportRow & { studentName: string };

const fmtAOA = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "AOA", maximumFractionDigits: 0 }).format(n || 0);

type Props = { schoolId: string | null };

export const ErpExportPaymentsSection = ({ schoolId }: Props) => {
  const { role } = useUserRole();
  const staffOk = role === "ADMIN" || role === "SUPER_ADMIN" || role === "TEACHER";

  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [lines, setLines] = useState<ErpPaymentLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [exportFilter, setExportFilter] = useState<"all" | "pending" | "exported">("all");
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!schoolId || !staffOk) {
      setLines([]);
      return;
    }
    setLoading(true);
    const { data, error } = await fetchValidatedPaymentsForErpYear(supabase, schoolId, year);
    if (error) {
      toast({ title: "Erro a carregar pagamentos", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const rows = data ?? [];
    const studentMap = await resolveStudentsForPayments(supabase, rows);
    setLines(enrichErpPaymentsWithStudentNames(rows, studentMap));
    setLoading(false);
  }, [schoolId, year, staffOk]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (exportFilter === "pending") return lines.filter((p) => !p.erp_exported_at);
    if (exportFilter === "exported") return lines.filter((p) => !!p.erp_exported_at);
    return lines;
  }, [lines, exportFilter]);

  const exportExcel = async () => {
    if (!schoolId || filtered.length === 0) {
      toast({
        title: "Nada a exportar",
        description: "Não há pagamentos validados no filtro seleccionado.",
        variant: "destructive",
      });
      return;
    }
    setExporting(true);
    const paymentsPayload = filtered.map(({ studentName: _, ...row }) => row);
    const result = await runErpExcelExport({
      supabase,
      schoolId,
      payments: paymentsPayload,
      filenameYearSegment: year,
      markAsExported: true,
    });
    setExporting(false);
    if (result.empty) {
      toast({ title: "Nada a exportar", variant: "destructive" });
      return;
    }
    if (result.exportMarkedError) {
      toast({
        title: "Ficheiro gerado; erro ao marcar exportação",
        description: result.exportMarkedError,
        variant: "destructive",
      });
      await load();
      return;
    }
    toast({
      title: "Excel gerado",
      description: `${result.count} linha(s); cabeçalhos conforme mapeamento ERP. Registos marcados como exportados.`,
    });
    await load();
  };

  if (!schoolId || !staffOk) return null;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle className="text-lg">Exportar pagamentos (Excel ERP)</CardTitle>
          <CardDescription className="mt-1">
            Gera um ficheiro .xlsx com os cabeçalhos definidos acima para Primavera ou outro ERP. Apenas pagamentos com
            estado validado; valores numéricos e datas ISO (YYYY-MM-DD).
          </CardDescription>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-end">
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Ano civil</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-full sm:w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[year + 1, year, year - 1, year - 2].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Select value={exportFilter} onValueChange={(v) => setExportFilter(v as typeof exportFilter)}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="Filtro" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os pagamentos</SelectItem>
              <SelectItem value="pending">Ainda não exportados</SelectItem>
              <SelectItem value="exported">Já exportados</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            className="gap-2 sm:self-auto"
            disabled={exporting || filtered.length === 0}
            onClick={exportExcel}
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Exportar Excel (ERP)
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum pagamento validado neste ano para o filtro seleccionado.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                  <th className="py-2 px-3">Data</th>
                  <th className="py-2 px-3">Aluno</th>
                  <th className="py-2 px-3">Valor</th>
                  <th className="py-2 px-3">Método</th>
                  <th className="py-2 px-3">Exportação ERP</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="py-2 px-3 font-mono text-xs">{p.payment_date ? p.payment_date.slice(0, 10) : "—"}</td>
                    <td className="py-2 px-3 font-medium">{p.studentName}</td>
                    <td className="py-2 px-3">{fmtAOA(Number(p.amount_paid))}</td>
                    <td className="py-2 px-3">{p.method ?? "—"}</td>
                    <td className="py-2 px-3">
                      {p.erp_exported_at ? (
                        <Badge variant="secondary" className="font-normal">
                          Exportado em{" "}
                          {new Date(p.erp_exported_at).toLocaleString("pt-PT", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-amber-500/50 text-amber-800 dark:text-amber-200"
                        >
                          Pendente
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
