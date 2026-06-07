import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useParentChildren } from "@/hooks/useParentChildren";
import { ArrowLeft, FileDown, Loader2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { downloadFiscalInvoicePdfFromInvoice } from "@/lib/fiscal/downloadFiscalInvoicePdf";
import { downloadVendusDocumentPdf } from "@/lib/vendus/invokeVendusBilling";

type PaymentRow = Pick<
  Tables<"payments">,
  | "id"
  | "amount_paid"
  | "payment_date"
  | "status"
  | "method"
  | "student_fee_id"
  | "activity_fee_id"
  | "transport_fee_id"
  | "enrollment_fee_id"
  | "school_id"
>;

type EnrichedPayment = PaymentRow & { label: string; studentLabel: string };

const fmtAOA = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "AOA", maximumFractionDigits: 0 }).format(n || 0);

async function enrichPaymentLabels(rows: PaymentRow[]): Promise<EnrichedPayment[]> {
  const sfIds = rows.map((r) => r.student_fee_id).filter(Boolean) as string[];
  const afIds = rows.map((r) => r.activity_fee_id).filter(Boolean) as string[];
  const tfIds = rows.map((r) => r.transport_fee_id).filter(Boolean) as string[];
  const efIds = rows.map((r) => r.enrollment_fee_id).filter(Boolean) as string[];

  const [sfData, afData, tfData, efData] = await Promise.all([
    sfIds.length
      ? supabase
          .from("student_fees")
          .select("id, student:students(full_name)")
          .in("id", sfIds)
      : Promise.resolve({ data: [] as { id: string; student: { full_name: string } | null }[] }),
    afIds.length
      ? supabase
          .from("activity_fees")
          .select("id, student:students(full_name), activity:extracurricular_activities(name)")
          .in("id", afIds)
      : Promise.resolve({ data: [] as { id: string; student: { full_name: string } | null; activity: { name: string } | null }[] }),
    tfIds.length
      ? supabase
          .from("transport_fees")
          .select("id, student:students(full_name), route:transport_routes(name)")
          .in("id", tfIds)
      : Promise.resolve({ data: [] as { id: string; student: { full_name: string } | null; route: { name: string } | null }[] }),
    efIds.length
      ? supabase
          .from("enrollment_fees")
          .select("id, student:students(full_name), fee_type")
          .in("id", efIds)
      : Promise.resolve({ data: [] as { id: string; student: { full_name: string } | null; fee_type: string | null }[] }),
  ]);

  const sfMap = new Map<string, string>();
  ((sfData as { data: { id: string; student: { full_name: string } | null }[] | null }).data ?? []).forEach((r) =>
    sfMap.set(r.id, r.student?.full_name ?? ""),
  );

  const afMap = new Map<string, { s: string; l: string }>();
  (
    (
      afData as {
        data: {
          id: string;
          student: { full_name: string } | null;
          activity: { name: string } | null;
        }[];
      }
    ).data ?? []
  ).forEach((r) =>
    afMap.set(r.id, { s: r.student?.full_name ?? "", l: r.activity?.name ?? "Atividade" }),
  );

  const tfMap = new Map<string, { s: string; l: string }>();
  (
    (
      tfData as {
        data: {
          id: string;
          student: { full_name: string } | null;
          route: { name: string } | null;
        }[];
      }
    ).data ?? []
  ).forEach((r) =>
    tfMap.set(r.id, { s: r.student?.full_name ?? "", l: r.route?.name ?? "Transporte" }),
  );

  const efMap = new Map<string, { s: string; l: string }>();
  (
    (
      efData as {
        data: {
          id: string;
          student: { full_name: string } | null;
          fee_type: string | null;
        }[];
      }
    ).data ?? []
  ).forEach((r) =>
    efMap.set(r.id, {
      s: r.student?.full_name ?? "",
      l: r.fee_type === "RENEWAL" ? "Renovação matrícula" : "Matrícula",
    }),
  );

  return rows.map((p) => {
    let label = "Pagamento";
    let studentLabel = "";

    if (p.student_fee_id) {
      label = "Propina";
      studentLabel = sfMap.get(p.student_fee_id) ?? "";
    } else if (p.activity_fee_id) {
      const x = afMap.get(p.activity_fee_id);
      label = x?.l ?? "Atividade extracurricular";
      studentLabel = x?.s ?? "";
    } else if (p.transport_fee_id) {
      const x = tfMap.get(p.transport_fee_id);
      label = x ? `Transporte (${x.l})` : "Transporte";
      studentLabel = x?.s ?? "";
    } else if (p.enrollment_fee_id) {
      const x = efMap.get(p.enrollment_fee_id);
      label = x?.l ?? "Matrícula";
      studentLabel = x?.s ?? "";
    }

    return { ...p, label, studentLabel };
  });
}

const HistoricoPagamentosEncarregado = () => {
  const { isParent, loading: parentLoading } = useParentChildren();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<EnrichedPayment[]>([]);
  const [invoiceByPayment, setInvoiceByPayment] = useState<Map<string, Tables<"invoices">>>(new Map());
  const [vendusByPayment, setVendusByPayment] = useState<
    Map<string, { documentId: string; documentNumber: string }>
  >(new Map());
  const [pdfLoadingPaymentId, setPdfLoadingPaymentId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const uid = user?.id;
    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: pays, error } = await supabase
      .from("payments")
      .select(
        "id, amount_paid, payment_date, status, method, student_fee_id, activity_fee_id, transport_fee_id, enrollment_fee_id, school_id",
      )
      .eq("submitted_by", uid)
      .order("payment_date", { ascending: false });

    if (error) {
      toast({ title: "Erro ao carregar histórico", description: error.message, variant: "destructive" });
      setRows([]);
      setLoading(false);
      return;
    }

    const list = ((pays ?? []) as PaymentRow[]).filter((p) => p.status === "validado");

    const enriched = await enrichPaymentLabels(list);
    setRows(enriched);

    const pids = enriched.map((p) => p.id);

    if (pids.length > 0) {
      const [{ data: invs }, { data: receipts }] = await Promise.all([
        supabase.from("invoices").select("*").in("payment_id", pids),
        supabase
          .from("payment_receipts")
          .select("payment_id, vendus_document_id, vendus_document_number")
          .in("payment_id", pids),
      ]);
      const map = new Map<string, Tables<"invoices">>();
      ((invs ?? []) as Tables<"invoices">[]).forEach((inv) => {
        if (inv.payment_id) map.set(inv.payment_id, inv);
      });
      setInvoiceByPayment(map);

      const vendusMap = new Map<string, { documentId: string; documentNumber: string }>();
      for (const row of receipts ?? []) {
        const payId = row.payment_id as string | null;
        const docId = String(row.vendus_document_id ?? "").trim();
        if (!payId?.trim() || !docId) continue;
        vendusMap.set(payId, {
          documentId: docId,
          documentNumber: String(row.vendus_document_number ?? "").trim(),
        });
      }
      setVendusByPayment(vendusMap);
    } else {
      setInvoiceByPayment(new Map());
      setVendusByPayment(new Map());
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (!parentLoading && isParent) void load();
  }, [parentLoading, isParent, load]);

  const handlePdf = async (p: EnrichedPayment) => {
    const vendus = vendusByPayment.get(p.id);
    if (vendus?.documentId) {
      setPdfLoadingPaymentId(p.id);
      try {
        await downloadVendusDocumentPdf({
          documentId: vendus.documentId,
          paymentId: p.id,
          filenameHint: vendus.documentNumber || undefined,
        });
        toast({
          title: "PDF transferido",
          description: vendus.documentNumber
            ? `Fatura ${vendus.documentNumber} guardada.`
            : "Fatura descarregada.",
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        toast({ title: "Erro ao gerar PDF", description: msg, variant: "destructive" });
      } finally {
        setPdfLoadingPaymentId(null);
      }
      return;
    }

    const inv = invoiceByPayment.get(p.id);
    if (!inv) {
      toast({
        title: "Fatura ainda não disponível",
        description: "A escola pode emitir documento oficial após registar esta cobrança no sistema fiscal.",
        variant: "destructive",
      });
      return;
    }

    setPdfLoadingPaymentId(p.id);
    try {
      await downloadFiscalInvoicePdfFromInvoice(inv);
      toast({
        title: "PDF transferido",
        description: inv.document_number?.trim()
          ? `FACTURA‑RECIBO ${inv.document_number.trim()} guardada.`
          : "Guarde ou partilhe o ficheiro conforme necessário.",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro ao gerar PDF", description: msg, variant: "destructive" });
    } finally {
      setPdfLoadingPaymentId(null);
    }
  };

  if (parentLoading) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isParent) {
    return <Navigate to="/financas" replace />;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/propinas" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar a Propinas
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Histórico de pagamentos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pagamentos validados pela escola. Pode descarregar a fatura em PDF quando existir documento fiscal emitido.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registos validados</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Sem pagamentos validados registados como enviados por si.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-2">Data</th>
                    <th className="py-2 pr-2">Tipo</th>
                    <th className="py-2 pr-2">Educando</th>
                    <th className="py-2 pr-2 text-right">Valor</th>
                    <th className="py-2 text-right">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const hasDoc = invoiceByPayment.has(p.id) || vendusByPayment.has(p.id);
                    const pdfBusy = pdfLoadingPaymentId === p.id;
                    return (
                      <tr key={p.id} className="border-b border-border/70">
                        <td className="py-3 pr-2">
                          {p.payment_date ? new Date(p.payment_date).toLocaleDateString("pt-PT") : "—"}
                        </td>
                        <td className="py-3 pr-2 font-medium">{p.label}</td>
                        <td className="py-3 pr-2">{p.studentLabel || "—"}</td>
                        <td className="py-3 pr-2 text-right font-semibold">{fmtAOA(Number(p.amount_paid))}</td>
                        <td className="py-3 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            onClick={() => void handlePdf(p)}
                            disabled={!hasDoc || pdfBusy}
                            title={
                              hasDoc
                                ? vendusByPayment.has(p.id)
                                  ? "Transferir PDF da fatura"
                                  : "Transferir PDF da factura‑recibo (AGT)"
                                : "Ainda não existe documento fiscal para este pagamento."
                            }
                          >
                            {pdfBusy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <FileDown className="h-3.5 w-3.5" />
                            )}
                            Transferir PDF
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default HistoricoPagamentosEncarregado;
