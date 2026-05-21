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
import { Loader2, Plus, Download, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";

const CONSUMER_FALLBACK_NIF = "999999999";

const EDUKAMBA_ISSUER = {
  schoolName: "Edukamba",
  schoolNif: "5480041924",
  schoolAddress: "Zona Verde, Rua 18, Casa 26, Belas, Luanda",
  schoolContactLines: ["Email: geral@edukamba.com", "Website: www.edukamba.com"],
} as const;

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
  created_at: string;
  created_by_id: string | null;
};

type LeadOption = {
  id: string;
  organization_name: string;
  nif: string | null;
  contact_email: string | null;
};

const SuperProformaInvoices = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<ProformaRow[] | null>(null);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    leadId: "__none",
    clientName: "",
    clientLines: "",
    clientNif: "",
    clientEmail: "",
    issueDate: new Date().toISOString().slice(0, 10),
    validityDays: "30",
    items: [{ description: "", quantity: 1, unitAmount: "", totalAmount: "" }],
    currency: "AOA",
    ivaPct: "14",
    footerNote: "",
  });
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);

  const reload = useCallback(() => {
    void (async () => {
      try {
        const [pfRes, leRes] = await Promise.all([
          supabase.from("proforma_invoices").select("*").order("created_at", { ascending: false }),
          supabase.from("saas_sales_leads").select("id, organization_name, nif, contact_email").order("organization_name"),
        ]);
        if (pfRes.error) throw pfRes.error;
        setRows((pfRes.data ?? []) as unknown as ProformaRow[]);
        setLeads((leRes.data ?? []) as unknown as LeadOption[]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao carregar pro-formas");
      }
    })();
  }, []);

  // Quando a lead muda, pré-preenche nome, email e NIF
  const handleLeadChange = (leadId: string) => {
    if (leadId === "__none") {
      setForm((f) => ({ ...f, leadId: "__none" }));
      return;
    }
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    const resolvedNif = lead.nif?.trim() || CONSUMER_FALLBACK_NIF;
    setForm((f) => ({
      ...f,
      leadId,
      clientName: lead.organization_name,
      clientNif: resolvedNif,
      clientEmail: lead.contact_email ?? f.clientEmail,
    }));
  };

  useEffect(() => {
    reload();
  }, [reload]);

  const currencyLabel = form.currency === "AOA" ? "AKZ" : form.currency;

  // Calculate totals
  const totalsCalc = useMemo(() => {
    let subtotal = 0;
    for (const item of form.items) {
      const total = parseFloat(item.totalAmount) || 0;
      subtotal += total;
    }
    const ivaPct = parseFloat(form.ivaPct) || 0;
    const iva = (subtotal * ivaPct) / 100;
    const total = subtotal + iva;
    const fmt = (n: number) =>
      new Intl.NumberFormat("pt-AO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
    return { subtotal: fmt(subtotal), iva: fmt(iva), total: fmt(total) };
  }, [form.items, form.ivaPct]);

  const getNextDocNumber = async (): Promise<string> => {
    const year = new Date().getFullYear();
    try {
      const { count } = await supabase
        .from("proforma_invoices")
        .select("id", { count: "exact", head: true })
        .like("document_number", `PP ${year}/%`);
      const nextSeq = (count ?? 0) + 1;
      return `PP ${year}/${nextSeq}`;
    } catch {
      return `PP ${year}/1`;
    }
  };

  const handleAddItem = () => {
    setForm({
      ...form,
      items: [...form.items, { description: "", quantity: 1, unitAmount: "", totalAmount: "" }],
    });
  };

  const handleRemoveItem = (idx: number) => {
    setForm({
      ...form,
      items: form.items.filter((_, i) => i !== idx),
    });
  };

  const handleItemChange = (idx: number, key: string, value: string | number) => {
    const newItems = [...form.items];
    newItems[idx] = { ...newItems[idx], [key]: value };
    setForm({ ...form, items: newItems });
  };

  const handleCreateProforma = async () => {
    if (!form.clientName.trim()) {
      toast.error("Nome do cliente é obrigatório");
      return;
    }
    if (form.items.length === 0 || form.items.some((it) => !it.description.trim())) {
      toast.error("Adicione pelo menos um item com descrição");
      return;
    }

    setBusy(true);
    try {
      const docNumber = await getNextDocNumber();
      const resolvedClientNif = form.clientNif.trim() || CONSUMER_FALLBACK_NIF;
      const pdfInput: ProformaInvoicePdfInput = {
        documentNumber: docNumber,
        issueDateYYYYMMDD: form.issueDate,
        validityDays: parseInt(form.validityDays) || 30,
        ...EDUKAMBA_ISSUER,
        clientName: form.clientName.trim(),
        clientLines: form.clientLines
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l),
        clientNif: resolvedClientNif,
        clientEmail: form.clientEmail.trim() || undefined,
        lineItems: form.items.map((it) => ({
          description: it.description,
          quantity: parseInt(String(it.quantity)) || 1,
          unitAmountFmt: it.unitAmount,
          totalAmountFmt: it.totalAmount,
        })),
        subtotalFmt: totalsCalc.subtotal,
        ivaPercentage: parseFloat(form.ivaPct) || 0,
        ivaFmt: totalsCalc.iva,
        totalFmt: totalsCalc.total,
        currencyLabel,
        footerNote: form.footerNote.trim() || null,
      };

      // Generate PDF
      const pdf = buildProformaInvoicePdf(pdfInput);
      const pdfBase64 = pdf.output("dataurlstring").split(",")[1];

      // Insert into database
      const { data: newProforma, error: insertError } = await supabase
        .from("proforma_invoices")
        .insert({
          document_number: docNumber,
          issue_date: form.issueDate,
          validity_days: parseInt(form.validityDays) || 30,
          client_name: form.clientName.trim(),
          client_lines: form.clientLines.split("\n").map((l) => l.trim()).filter((l) => l),
          client_nif: resolvedClientNif,
          client_email: form.clientEmail.trim() || null,
          items: form.items.map((it) => ({
            description: it.description,
            quantity: parseInt(String(it.quantity)) || 1,
            unit_amount: it.unitAmount,
            total_amount: it.totalAmount,
          })),
          subtotal: totalsCalc.subtotal,
          iva_percentage: parseFloat(form.ivaPct) || 0,
          iva_amount: totalsCalc.iva,
          total: totalsCalc.total,
          currency: form.currency,
          footer_note: form.footerNote.trim() || null,
          pdf_base64: pdfBase64,
          created_by_id: user?.id,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      toast.success(`Pro-forma ${docNumber} criada com sucesso!`);
      setDialogOpen(false);
      setForm({
        leadId: "__none",
        clientName: "",
        clientLines: "",
        clientNif: "",
        clientEmail: "",
        issueDate: new Date().toISOString().slice(0, 10),
        validityDays: "30",
        items: [{ description: "", quantity: 1, unitAmount: "", totalAmount: "" }],
        currency: "AOA",
        ivaPct: "14",
        footerNote: "",
      });
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar pro-forma");
    } finally {
      setBusy(false);
    }
  };

  const downloadPdf = async (row: ProformaRow) => {
    try {
      const pdfInput: ProformaInvoicePdfInput = {
        documentNumber: row.document_number,
        issueDateYYYYMMDD: row.issue_date,
        validityDays: row.validity_days,
        ...EDUKAMBA_ISSUER,
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
      };

      const pdf = buildProformaInvoicePdf(pdfInput);
      pdf.save(`${row.document_number}.pdf`);
      toast.success("PDF descarregado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao descarregar PDF");
    }
  };

  const deleteProforma = async (id: string, docNumber: string) => {
    if (!confirm(`Tem a certeza que deseja eliminar ${docNumber}?`)) return;

    try {
      const { error } = await supabase
        .from("proforma_invoices")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success("Pro-forma eliminada");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao eliminar");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-900">Faturas Pró-Forma (PP)</h1>
            <p className="text-slate-600 mt-2">Crie e gira orçamentos e faturas pró-forma para escolas</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
                <Plus className="w-5 h-5" />
                Nova Pró-Forma
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nova Fatura Pró-Forma / Orçamento</DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <Label>Vincular a lead (opcional)</Label>
                  <Select value={form.leadId} onValueChange={handleLeadChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sem lead" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Sem lead</SelectItem>
                      {leads.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.organization_name}{l.nif ? ` · NIF ${l.nif}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Nome do Cliente *</Label>
                  <Input
                    value={form.clientName}
                    onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                    placeholder="Ex: Colégio XYZ"
                  />
                </div>

                <div>
                  <Label>NIF do Cliente</Label>
                  <Input
                    value={form.clientNif}
                    onChange={(e) => setForm({ ...form, clientNif: e.target.value })}
                    placeholder="0000000000"
                    maxLength={10}
                  />
                  {form.clientNif === CONSUMER_FALLBACK_NIF && (
                    <p className="text-xs text-muted-foreground mt-1">NIF padrão consumidor final (AGT)</p>
                  )}
                </div>

                <div className="md:col-span-2">
                  <Label>Morada e Localidade</Label>
                  <Textarea
                    value={form.clientLines}
                    onChange={(e) => setForm({ ...form, clientLines: e.target.value })}
                    placeholder="Linha 1&#10;Linha 2"
                    rows={3}
                  />
                </div>

                <div>
                  <Label>Email do Cliente</Label>
                  <Input
                    type="email"
                    value={form.clientEmail}
                    onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
                    placeholder="cliente@exemplo.com"
                  />
                </div>

                <div>
                  <Label>Data de Emissão</Label>
                  <Input
                    type="date"
                    value={form.issueDate}
                    onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
                  />
                </div>

                <div>
                  <Label>Validade (dias)</Label>
                  <Input
                    type="number"
                    value={form.validityDays}
                    onChange={(e) => setForm({ ...form, validityDays: e.target.value })}
                    min="1"
                    max="365"
                  />
                </div>

                <div>
                  <Label>Moeda</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AOA">AOA (AKZ)</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>IVA (%)</Label>
                  <Select value={form.ivaPct} onValueChange={(v) => setForm({ ...form, ivaPct: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0% (Isento)</SelectItem>
                      <SelectItem value="14">14%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Items section */}
              <div className="mt-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">Serviços/Itens</h3>
                  <Button variant="outline" size="sm" onClick={handleAddItem}>
                    <Plus className="w-4 h-4 mr-1" /> Adicionar Item
                  </Button>
                </div>

                <div className="space-y-3 max-h-48 overflow-y-auto">
                  {form.items.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-end bg-slate-50 p-3 rounded">
                      <div className="flex-1">
                        <Label className="text-xs">Descrição</Label>
                        <Input
                          value={item.description}
                          onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                          placeholder="Ex: Propinas mensais"
                          size={30}
                        />
                      </div>
                      <div className="w-16">
                        <Label className="text-xs">Qtd</Label>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(idx, "quantity", parseInt(e.target.value) || 1)}
                          min="1"
                          size={10}
                        />
                      </div>
                      <div className="w-24">
                        <Label className="text-xs">P. Unitário</Label>
                        <Input
                          value={item.unitAmount}
                          onChange={(e) => handleItemChange(idx, "unitAmount", e.target.value)}
                          placeholder="0,00"
                          size={10}
                        />
                      </div>
                      <div className="w-24">
                        <Label className="text-xs">Total</Label>
                        <Input
                          value={item.totalAmount}
                          onChange={(e) => handleItemChange(idx, "totalAmount", e.target.value)}
                          placeholder="0,00"
                          size={10}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Totals display */}
                <div className="bg-slate-100 p-4 rounded mt-4 text-right text-sm">
                  <div className="flex justify-end gap-12">
                    <div>
                      <p className="text-slate-600">Subtotal:</p>
                      <p className="font-semibold">{totalsCalc.subtotal} {currencyLabel}</p>
                    </div>
                    <div>
                      <p className="text-slate-600">IVA ({form.ivaPct}%):</p>
                      <p className="font-semibold">{totalsCalc.iva} {currencyLabel}</p>
                    </div>
                    <div>
                      <p className="text-slate-600">Total:</p>
                      <p className="font-bold text-lg">{totalsCalc.total} {currencyLabel}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <Label>Nota adicional (opcional)</Label>
                <Textarea
                  value={form.footerNote}
                  onChange={(e) => setForm({ ...form, footerNote: e.target.value })}
                  placeholder="Informações adicionais..."
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreateProforma} disabled={busy}>
                  {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Criar Fatura Pró-Forma
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Proposals List */}
        <div className="space-y-4">
          {!rows ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400 mb-2" />
              <p className="text-slate-500">Carregando...</p>
            </div>
          ) : rows.length === 0 ? (
            <Card className="p-12 text-center">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">Nenhuma fatura pró-forma criada ainda</p>
            </Card>
          ) : (
            <div className="grid gap-4">
              {rows.map((row) => (
                <Card key={row.id} className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{row.document_number}</h3>
                      <p className="text-slate-600">{row.client_name}</p>
                      <p className="text-sm text-slate-500 mt-1">
                        Emitida: {new Date(row.issue_date).toLocaleDateString("pt-PT")} | Validade: {row.validity_days} dias
                      </p>
                      <p className="text-lg font-bold text-blue-600 mt-2">
                        {row.total} {row.currency === "AOA" ? "AKZ" : row.currency}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadPdf(row)}
                        className="gap-1"
                      >
                        <Download className="w-4 h-4" />
                        PDF
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteProforma(row.id, row.document_number)}
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SuperProformaInvoices;
