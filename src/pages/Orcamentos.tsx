import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { buildProformaInvoicePdf, type ProformaInvoicePdfInput } from "@/lib/fiscal/proformaInvoicePdf";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Download, FileText, FileCheck, Trash2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { invokeCreditNote } from "@/lib/fiscal/invokeCreditNote";
import { downloadCreditNotePdfById } from "@/lib/fiscal/downloadCreditNotePdf";
import {
  CREDIT_NOTE_REASON_CODES,
  type CreditNoteReasonCode,
  resolveCreditNoteReasonText,
} from "@/lib/fiscal/creditNoteReasons";
import { effectiveSchoolIdFromProfile } from "@/lib/effectiveTenant";
import { useUserRole } from "@/hooks/useUserRole";

const CONSUMER_FALLBACK_NIF = "999999999";

type ProformaRow = {
  id: string;
  document_number: string;
  issue_date: string;
  validity_days: number;
  client_name: string;
  client_lines: string[];
  client_nif: string | null;
  client_email: string | null;
  items: Array<{ description: string; quantity: number; unit_amount: string; total_amount: string }>;
  subtotal: string;
  iva_percentage: number;
  iva_amount: string;
  total: string;
  currency: string;
  footer_note: string | null;
  hash_control: string | null;
  converted_invoice_id: string | null;
  created_at: string;
  created_by_id: string | null;
  school_id: string | null;
};

const Orcamentos = () => {
  const { user } = useAuth();
  const { role } = useUserRole();
  const [rows, setRows] = useState<ProformaRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState("Edukamba");
  const [schoolNif, setSchoolNif] = useState<string | null>(null);
  const [schoolAddress, setSchoolAddress] = useState<string | null>(null);

  const [form, setForm] = useState({
    clientName: "",
    clientLines: "",
    clientNif: "",
    clientEmail: "",
    issueDate: new Date().toISOString().slice(0, 10),
    validityDays: "30",
    items: [{ description: "", quantity: 1, unitAmount: "", totalAmount: "" }],
    currency: "AOA",
    ivaPct: "0",
    footerNote: "",
  });

  // Credit Note dialog
  const [creditNoteDialog, setCreditNoteDialog] = useState<{
    invoiceId: string;
    documentNumber: string;
    grossTotal: number;
  } | null>(null);
  const [creditNoteReasonCode, setCreditNoteReasonCode] = useState<CreditNoteReasonCode>("data_error");
  const [creditNoteReasonOther, setCreditNoteReasonOther] = useState("");
  const [creditNotePartialAmount, setCreditNotePartialAmount] = useState("");
  const [emittingCreditNote, setEmittingCreditNote] = useState(false);

  const reload = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("school_id")
        .eq("id", user.id)
        .maybeSingle();
      const sid = effectiveSchoolIdFromProfile(profile);
      setSchoolId(sid);

      // Escola obrigatória — sem school_id não mostra nada
      if (!sid) {
        setRows([]);
        return;
      }

      const { data: sch } = await supabase
        .from("schools")
        .select("name, nif, address")
        .eq("id", sid)
        .maybeSingle();
      if (sch) {
        setSchoolName(sch.name || "Edukamba");
        setSchoolNif(sch.nif || null);
        setSchoolAddress(sch.address || null);
      }

      // Tentar filtrar por school_id; se a coluna não existir, mostrar vazio
      const { data, error } = await supabase
        .from("proforma_invoices")
        .select("*")
        .eq("school_id", sid)
        .order("created_at", { ascending: false });

      if (error) {
        // Se erro é por coluna inexistente, mostrar lista vazia
        if (error.message?.includes("school_id") || error.code === "PGRST204") {
          setRows([]);
          return;
        }
        throw error;
      }
      setRows((data ?? []) as unknown as ProformaRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar orçamentos");
    }
  }, [user?.id]);

  useEffect(() => { void reload(); }, [reload]);

  const currencyLabel = form.currency === "AOA" ? "AKZ" : form.currency;

  const totalsCalc = useMemo(() => {
    let subtotal = 0;
    for (const item of form.items) subtotal += parseFloat(item.totalAmount) || 0;
    const ivaPct = parseFloat(form.ivaPct) || 0;
    const iva = (subtotal * ivaPct) / 100;
    const total = subtotal + iva;
    const fmt = (n: number) =>
      new Intl.NumberFormat("pt-AO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
    return { subtotal: fmt(subtotal), iva: fmt(iva), total: fmt(total) };
  }, [form.items, form.ivaPct]);

  const getNextDocNumber = async (): Promise<string> => {
    const year = new Date().getFullYear();
    const { count } = await supabase
      .from("proforma_invoices")
      .select("id", { count: "exact", head: true })
      .like("document_number", `PP ${year}/%`);
    return `PP ${year}/${(count ?? 0) + 1}`;
  };

  const handleAddItem = () => {
    setForm({ ...form, items: [...form.items, { description: "", quantity: 1, unitAmount: "", totalAmount: "" }] });
  };
  const handleRemoveItem = (idx: number) => {
    setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });
  };
  const handleItemChange = (idx: number, key: string, value: string | number) => {
    const newItems = [...form.items];
    newItems[idx] = { ...newItems[idx], [key]: value };
    setForm({ ...form, items: newItems });
  };

  const handleCreateProforma = async () => {
    if (!form.clientName.trim()) { toast.error("Nome do cliente é obrigatório"); return; }
    if (form.items.some((it) => !it.description.trim())) { toast.error("Todos os itens precisam de descrição"); return; }

    setBusy(true);
    try {
      const docNumber = await getNextDocNumber();
      const resolvedNif = form.clientNif.trim() || CONSUMER_FALLBACK_NIF;

      let subtotalNum = 0;
      for (const item of form.items) subtotalNum += parseFloat(item.totalAmount) || 0;
      const ivaPct = parseFloat(form.ivaPct) || 0;
      const totalNum = subtotalNum + (subtotalNum * ivaPct) / 100;
      const totalForSigning = (Math.round((totalNum + Number.EPSILON) * 100) / 100).toFixed(2);

      let hashExtract: string | null = null;
      try {
        const { data: signData, error: signError } = await supabase.functions.invoke("sign-proforma", {
          body: { document_number: docNumber, issue_date: form.issueDate, total: totalForSigning },
        });
        if (!signError && signData?.hash_control) hashExtract = String(signData.hash_control).slice(0, 4).toUpperCase();
      } catch { /* continua sem hash */ }

      const pdfInput: ProformaInvoicePdfInput = {
        documentNumber: docNumber,
        issueDateYYYYMMDD: form.issueDate,
        validityDays: parseInt(form.validityDays) || 30,
        schoolName,
        schoolNif,
        schoolAddress,
        schoolContactLines: ["Email: geral@edukamba.com", "Website: www.edukamba.com"],
        clientName: form.clientName.trim(),
        clientLines: form.clientLines.split("\n").map((l) => l.trim()).filter(Boolean),
        clientNif: resolvedNif,
        clientEmail: form.clientEmail.trim() || undefined,
        hashExtract,
        lineItems: form.items.map((it) => ({
          description: it.description,
          quantity: parseInt(String(it.quantity)) || 1,
          unitAmountFmt: it.unitAmount,
          totalAmountFmt: it.totalAmount,
        })),
        subtotalFmt: totalsCalc.subtotal,
        ivaPercentage: ivaPct,
        ivaFmt: totalsCalc.iva,
        totalFmt: totalsCalc.total,
        currencyLabel,
        footerNote: form.footerNote.trim() || null,
      };

      const { error: insertError } = await supabase
        .from("proforma_invoices")
        .insert({
          document_number: docNumber,
          issue_date: form.issueDate,
          validity_days: parseInt(form.validityDays) || 30,
          client_name: form.clientName.trim(),
          client_lines: form.clientLines.split("\n").map((l) => l.trim()).filter(Boolean),
          client_nif: resolvedNif,
          client_email: form.clientEmail.trim() || null,
          items: form.items.map((it) => ({
            description: it.description,
            quantity: parseInt(String(it.quantity)) || 1,
            unit_amount: it.unitAmount,
            total_amount: it.totalAmount,
          })),
          subtotal: totalsCalc.subtotal,
          iva_percentage: ivaPct,
          iva_amount: totalsCalc.iva,
          total: totalsCalc.total,
          currency: form.currency,
          footer_note: form.footerNote.trim() || null,
          hash_control: hashExtract,
          school_id: schoolId,
          created_by_id: user?.id,
        });

      if (insertError) throw insertError;

      const pdf = buildProformaInvoicePdf(pdfInput);
      pdf.save(`${docNumber.replace(/\s+/g, "_")}.pdf`);

      toast.success(`Orçamento ${docNumber} criado!`);
      setDialogOpen(false);
      setForm({
        clientName: "", clientLines: "", clientNif: "", clientEmail: "",
        issueDate: new Date().toISOString().slice(0, 10), validityDays: "30",
        items: [{ description: "", quantity: 1, unitAmount: "", totalAmount: "" }],
        currency: "AOA", ivaPct: "0", footerNote: "",
      });
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar orçamento");
    } finally {
      setBusy(false);
    }
  };

  const downloadPdf = (row: ProformaRow) => {
    const pdfInput: ProformaInvoicePdfInput = {
      documentNumber: row.document_number,
      issueDateYYYYMMDD: row.issue_date,
      validityDays: row.validity_days,
      schoolName,
      schoolNif,
      schoolAddress,
      schoolContactLines: ["Email: geral@edukamba.com", "Website: www.edukamba.com"],
      clientName: row.client_name,
      clientLines: row.client_lines,
      clientNif: row.client_nif,
      clientEmail: row.client_email,
      lineItems: row.items.map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unitAmountFmt: it.unit_amount,
        totalAmountFmt: it.total_amount,
      })),
      subtotalFmt: row.subtotal,
      ivaPercentage: row.iva_percentage,
      ivaFmt: row.iva_amount,
      totalFmt: row.total,
      currencyLabel: row.currency === "AOA" ? "AKZ" : row.currency,
      footerNote: row.footer_note,
      hashExtract: row.hash_control ?? null,
    };
    const pdf = buildProformaInvoicePdf(pdfInput);
    pdf.save(`${row.document_number.replace(/\s+/g, "_")}.pdf`);
  };

  const [convertingId, setConvertingId] = useState<string | null>(null);
  const convertToInvoice = async (row: ProformaRow) => {
    if (row.converted_invoice_id) { toast.info("Já convertida."); return; }
    if (!confirm(`Converter ${row.document_number} numa Fatura (FT)?`)) return;
    setConvertingId(row.id);
    try {
      const { data, error } = await supabase.functions.invoke("convert-proforma-to-invoice", {
        body: { proforma_id: row.id, school_id: schoolId },
      });
      if (error) throw error;
      const result = data as { ok?: boolean; error?: string; document_number?: string };
      if (!result?.ok && result?.error) { toast.error(result.error); return; }
      toast.success(`Fatura ${result.document_number} gerada!`);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao converter");
    } finally {
      setConvertingId(null);
    }
  };

  const confirmEmitCreditNote = async () => {
    if (!creditNoteDialog) return;
    let reasonText: string;
    try {
      reasonText = resolveCreditNoteReasonText(creditNoteReasonCode, creditNoteReasonOther);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Motivo inválido");
      return;
    }
    const partialAmount = creditNotePartialAmount.trim()
      ? parseFloat(creditNotePartialAmount.replace(/\./g, "").replace(",", "."))
      : undefined;
    if (partialAmount !== undefined && (isNaN(partialAmount) || partialAmount <= 0 || partialAmount > creditNoteDialog.grossTotal)) {
      toast.error("Valor parcial inválido.");
      return;
    }
    setEmittingCreditNote(true);
    const fx = await invokeCreditNote(creditNoteDialog.invoiceId, reasonText, partialAmount);
    setEmittingCreditNote(false);
    if (!fx.ok) { toast.error(fx.message ?? "Erro ao emitir NC."); return; }
    setCreditNoteDialog(null);
    setCreditNoteReasonOther("");
    setCreditNoteReasonCode("data_error");
    setCreditNotePartialAmount("");
    toast.success(`Nota de Crédito ${fx.documentNumber} emitida!`);
    if (fx.creditNoteId) {
      try { await downloadCreditNotePdfById(fx.creditNoteId); } catch { /* não bloqueia */ }
    }
  };

  const canManage = role === "ADMIN" || role === "SUPER_ADMIN" || role === "DIRECTOR" || role === "TREASURER";

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Orçamentos</h1>
          <p className="text-muted-foreground text-sm">Faturas pró-forma e orçamentos da escola</p>
        </div>
        {canManage && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> Novo Orçamento</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Novo Orçamento / Fatura Pró-Forma</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Nome do Cliente *</Label>
                  <Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} placeholder="Ex: Encarregado / Empresa" />
                </div>
                <div>
                  <Label>NIF do Cliente</Label>
                  <Input value={form.clientNif} onChange={(e) => setForm({ ...form, clientNif: e.target.value })} placeholder="0000000000" maxLength={10} />
                </div>
                <div className="md:col-span-2">
                  <Label>Morada</Label>
                  <Textarea value={form.clientLines} onChange={(e) => setForm({ ...form, clientLines: e.target.value })} rows={2} placeholder="Linha 1&#10;Linha 2" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} />
                </div>
                <div>
                  <Label>Data de Emissão</Label>
                  <Input type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
                </div>
                <div>
                  <Label>Validade (dias)</Label>
                  <Input type="number" value={form.validityDays} onChange={(e) => setForm({ ...form, validityDays: e.target.value })} min="1" />
                </div>
                <div>
                  <Label>IVA (%)</Label>
                  <Select value={form.ivaPct} onValueChange={(v) => setForm({ ...form, ivaPct: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0% (Isento)</SelectItem>
                      <SelectItem value="14">14%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold">Itens</h3>
                  <Button variant="outline" size="sm" onClick={handleAddItem}><Plus className="w-4 h-4 mr-1" /> Item</Button>
                </div>
                <div className="space-y-2">
                  {form.items.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-end bg-muted/30 p-2 rounded">
                      <div className="flex-1">
                        <Label className="text-xs">Descrição</Label>
                        <Input value={item.description} onChange={(e) => handleItemChange(idx, "description", e.target.value)} placeholder="Serviço" />
                      </div>
                      <div className="w-16">
                        <Label className="text-xs">Qtd</Label>
                        <Input type="number" value={item.quantity} onChange={(e) => handleItemChange(idx, "quantity", parseInt(e.target.value) || 1)} min="1" />
                      </div>
                      <div className="w-24">
                        <Label className="text-xs">P. Unit.</Label>
                        <Input value={item.unitAmount} onChange={(e) => handleItemChange(idx, "unitAmount", e.target.value)} placeholder="0,00" />
                      </div>
                      <div className="w-24">
                        <Label className="text-xs">Total</Label>
                        <Input value={item.totalAmount} onChange={(e) => handleItemChange(idx, "totalAmount", e.target.value)} placeholder="0,00" />
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleRemoveItem(idx)} className="text-destructive"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  ))}
                </div>
                <div className="bg-muted/50 p-3 rounded mt-3 text-right text-sm">
                  <span className="mr-6">Subtotal: {totalsCalc.subtotal} {currencyLabel}</span>
                  <span className="mr-6">IVA: {totalsCalc.iva} {currencyLabel}</span>
                  <span className="font-bold">Total: {totalsCalc.total} {currencyLabel}</span>
                </div>
              </div>
              <div>
                <Label>Nota adicional (opcional)</Label>
                <Textarea value={form.footerNote} onChange={(e) => setForm({ ...form, footerNote: e.target.value })} rows={2} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreateProforma} disabled={busy}>
                  {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Criar Orçamento
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!rows ? (
        <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Nenhum orçamento criado</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => (
            <Card key={row.id} className="p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="font-semibold">{row.document_number}</h3>
                  <p className="text-sm text-muted-foreground">{row.client_name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(row.issue_date).toLocaleDateString("pt-PT")} · Validade: {row.validity_days} dias
                  </p>
                  <p className="font-bold text-primary mt-1">{row.total} {row.currency === "AOA" ? "AKZ" : row.currency}</p>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  <Button variant="outline" size="sm" onClick={() => downloadPdf(row)} className="gap-1">
                    <Download className="w-4 h-4" /> PDF
                  </Button>
                  {canManage && !row.converted_invoice_id && (
                    <Button size="sm" onClick={() => convertToInvoice(row)} disabled={convertingId === row.id} className="gap-1">
                      {convertingId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
                      Converter em FT
                    </Button>
                  )}
                  {row.converted_invoice_id && (
                    <>
                      <span className="text-xs text-green-600 font-medium self-center">✓ Convertida</span>
                      {canManage && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const totalNum = parseFloat(row.total.replace(/\./g, "").replace(",", ".")) || 0;
                            setCreditNoteReasonCode("data_error");
                            setCreditNoteReasonOther("");
                            setCreditNotePartialAmount("");
                            setCreditNoteDialog({
                              invoiceId: row.converted_invoice_id!,
                              documentNumber: row.document_number,
                              grossTotal: totalNum,
                            });
                          }}
                          className="gap-1"
                          title="Emitir Nota de Crédito"
                        >
                          <Receipt className="w-4 h-4" /> NC
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Credit Note Dialog */}
      <Dialog
        open={!!creditNoteDialog}
        onOpenChange={(o) => { if (!o && !emittingCreditNote) { setCreditNoteDialog(null); setCreditNoteReasonOther(""); setCreditNoteReasonCode("data_error"); setCreditNotePartialAmount(""); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Emitir Nota de Crédito</DialogTitle>
            <DialogDescription>
              A NC retifica a fatura convertida a partir de {creditNoteDialog?.documentNumber ?? "—"} sem apagar o documento original.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Motivo da retificação</Label>
              <Select value={creditNoteReasonCode} onValueChange={(v) => setCreditNoteReasonCode(v as CreditNoteReasonCode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CREDIT_NOTE_REASON_CODES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code === "data_error" ? "Erro de digitação nos dados"
                        : code === "value_error" ? "Erro no valor cobrado"
                        : code === "enrollment_cancellation" ? "Desistência de matrícula"
                        : code === "commercial_discount" ? "Desconto comercial concedido"
                        : code === "service_not_provided" ? "Serviço não prestado"
                        : code === "duplicate_charge" ? "Cobrança duplicada"
                        : "Outro motivo"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {creditNoteReasonCode === "other" && (
              <div className="grid gap-2">
                <Label>Descreva o motivo</Label>
                <Textarea rows={3} value={creditNoteReasonOther} onChange={(e) => setCreditNoteReasonOther(e.target.value)} placeholder="Mínimo 6 caracteres…" />
              </div>
            )}
            <div className="grid gap-2">
              <Label>Valor parcial (opcional)</Label>
              <Input type="text" value={creditNotePartialAmount} onChange={(e) => setCreditNotePartialAmount(e.target.value)} placeholder="Deixe vazio para creditar o total" />
              <p className="text-xs text-muted-foreground">Deixe vazio para creditar o valor total da fatura</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={emittingCreditNote} onClick={() => setCreditNoteDialog(null)}>Cancelar</Button>
            <Button disabled={emittingCreditNote} onClick={() => void confirmEmitCreditNote()}>
              {emittingCreditNote ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Receipt className="w-4 h-4 mr-2" />}
              Emitir NC
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Orcamentos;
