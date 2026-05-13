import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Tables } from "@/integrations/supabase/types";
import { Loader2, Download, ArrowLeft, Copy } from "lucide-react";
import { buildInvoicePdf, resolveFiscalInvoicePdfInput } from "@/lib/fiscal/invoicePdf";
import { PageLoadingSkeleton } from "@/components/dashboard/PageLoadingSkeleton";
import { useParentChildren } from "@/hooks/useParentChildren";
import { useUserRole, type UserRole } from "@/hooks/useUserRole";
import { roleCanAccessFaturaPage } from "@/lib/staffNavAccess";

const fmtAOA = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "AOA", maximumFractionDigits: 0 }).format(n || 0);

function invoiceBackHref(role: UserRole | null, isParentUser: boolean): string {
  if (isParentUser || role === "PARENT") return "/pagamentos/historico";
  const nonFinanceStaff = role === "TEACHER" || role === "STUDENT" || role === "LIBRARIAN" || role === "RECEPTIONIST" || role === "STOCK_MANAGER";
  if (nonFinanceStaff) return "/dashboard";
  return "/pagamentos";
}

export default function FiscalInvoice() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const { role, loading: roleLoading } = useUserRole();
  const { isParent, loading: parentLoading } = useParentChildren();

  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<Tables<"invoices"> | null>(null);
  const [studentName, setStudentName] = useState<string>("");
  const [downloading, setDownloading] = useState(false);

  const backHref = useMemo(() => invoiceBackHref(role, isParent), [role, isParent]);

  const allowedFaturaViewer = useMemo(
    () => role === "PARENT" || isParent || roleCanAccessFaturaPage(role),
    [role, isParent],
  );

  const load = useCallback(async () => {
    const id = invoiceId?.trim();
    if (!id) {
      setInvoice(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: inv, error } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();

    if (error || !inv) {
      setInvoice(null);
      setStudentName("");
      setLoading(false);
      if (error) {
        toast({ title: "Fatura não disponível", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Fatura não encontrada", description: "Não tem permissão ou o documento não existe.", variant: "destructive" });
      }
      return;
    }

    const row = inv as Tables<"invoices">;
    setInvoice(row);

    if (row.student_id) {
      const { data: st } = await supabase.from("students").select("full_name").eq("id", row.student_id).maybeSingle();
      setStudentName(st?.full_name?.trim() ?? "");
    } else {
      setStudentName("");
    }
    setLoading(false);
  }, [invoiceId]);

  useEffect(() => {
    if (roleLoading || parentLoading) return;
    if (!allowedFaturaViewer) {
      setLoading(false);
      setInvoice(null);
      return;
    }
    void load();
  }, [load, roleLoading, parentLoading, allowedFaturaViewer]);

  const downloadPdf = async () => {
    if (!invoice) return;
    setDownloading(true);
    try {
      const payload = await resolveFiscalInvoicePdfInput(invoice, fmtAOA);
      const doc = buildInvoicePdf(payload);
      doc.save(`${invoice.document_number.replace(/\s+/g, "_")}.pdf`);
      toast({ title: "PDF transferido", description: "Guarde ou partilhe o ficheiro conforme necessário." });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro ao gerar PDF", description: msg, variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const copyPageLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({ title: "Ligação copiada", description: "Envie apenas a quem gere finanças ou administração na escola ou ao encarregado." });
    } catch {
      toast({ title: "Não foi possível copiar", description: "Copie manualmente da barra de endereços.", variant: "destructive" });
    }
  };

  if (roleLoading || parentLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!allowedFaturaViewer) {
    return <Navigate to="/dashboard" replace />;
  }

  if (loading) {
    return <PageLoadingSkeleton />;
  }

  if (!invoice || !invoiceId) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-10">
        <Button variant="ghost" size="sm" className="w-fit gap-2" asChild>
          <Link to={backHref}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Fatura indisponível</CardTitle>
            <CardDescription>Não existe documento fiscal para este identificador ou não tem permissão para o ver.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-2" asChild>
          <Link to={backHref}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Factura-recibo fiscal</CardTitle>
          <CardDescription>
            Documento válido nos dados registados pela escola. O PDF pode ser guardado ou impresso como comprovativo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm space-y-1">
            <p className="font-semibold">{invoice.document_number}</p>
            <p className="text-muted-foreground">Data: {invoice.invoice_date}</p>
            <p>Montante total: <span className="font-semibold">{fmtAOA(Number(invoice.gross_total))}</span></p>
            {studentName ? <p>Educando: {studentName}</p> : null}
            <p className="text-muted-foreground">Cliente (efeitos fiscais): {invoice.cliente_nome} · NIF {invoice.cliente_nif}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="gap-2" onClick={() => void downloadPdf()} disabled={downloading}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Gerar PDF
            </Button>
            <Button type="button" variant="outline" className="gap-2" onClick={() => void copyPageLink()}>
              <Copy className="h-4 w-4" /> Copiar ligação
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Administração, secretaria ou tesouraria podem consultar todas as FT da escola; encarregados apenas as suas.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
