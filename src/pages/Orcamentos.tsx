import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { buildProformaInvoicePdf, type ProformaInvoicePdfInput } from "@/lib/fiscal/proformaInvoicePdf";
import { downloadFiscalInvoicePdfById } from "@/lib/fiscal/downloadFiscalInvoicePdf";
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

type ClientType = "encarregado" | "aluno" | "empresa" | "outro";

const IVA_OPTIONS = [
  { value: "0", label: "Isento (M11)", code: "M11", reason: "Isenção no domínio da educação, Art. 12.º CIVA" },
  { value: "14", label: "14%", code: "", reason: "" },
  { value: "5", label: "5%", code: "", reason: "" },
  { value: "0_M04", label: "Não sujeito (M04)", code: "M04", reason: "Não sujeição nos termos do Art. 4.º CIVA" },
] as const;

type FormItem = {
  description: string;
  quantity: number;
  totalAmount: string;
  ivaPct: string; // "0", "14", "5", "0_M04"
};

type ProformaRow = {
  id: string;
  document_number: string;
  issue_date: string;
  validity_days: number;
  client_name: string;
  client_lines: string[];
  client_nif: string | null;
  client_email: string | null;
  items: Array<{ description: string; quantity: number; unit_amount: string; total_amount: string; iva_pct?: string }>;
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

type PersonOption = { id: string; full_name: string; tax_id?: string | null };

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

  // Client type
  const [clientType, setClientType] = useState<ClientType>("encarregado");
  const [guardians, setGuardians] = useState<PersonOption[]>([]);
  const [students, setStudents] = useState<PersonOption[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState("");

  const [form, setForm] = useState({
    clientName: "",
    clientLines: "",
    clientNif: "",
    clientEmail: "",
    issueDate: new Date().toISOString().slice(0, 10),
    validityDays: "30",
    items: [{ description: "", quantity: 1, totalAmount: "", ivaPct: "0" }] as FormItem[],
    currency: "AOA",
    footerNote: "",
  });

  // Credit Note dialog
  const [creditNoteDialog, setCreditNoteDialog] = useState<{
    invoiceId: string;
    documentNumber: string;
    grossTotal: number;
    /** Itens parseados da FT original (carregados ao abrir diálogo) */
    items: Array<{ description: string; amount: number; ivaPct: string; taxLabel: string }>;
  } | null>(null);
  const [creditNoteReasonCode, setCreditNoteReasonCode] = useState<CreditNoteReasonCode>("data_error");
  const [creditNoteReasonOther, setCreditNoteReasonOther] = useState("");
  /** "all" = fatura total, ou índice do item específico */
  const [creditNoteItemSelection, setCreditNoteItemSelection] = useState<string>("all");
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

      if (!sid) { setRows([]); return; }

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

      // Load guardians and students for the school
      const guardiansRes = await supabase.from("profiles").select("id, full_name, tax_id").eq("school_id", sid).in("role", ["PARENT"]);
      const studentsRes = await supabase.from("students").select("id, full_name, tax_id").eq("school_id", sid);
      setGuardians((guardiansRes.data ?? []) as PersonOption[]);
      setStudents((studentsRes.data ?? []) as PersonOption[]);

      const { data, error } = await (supabase
        .from("proforma_invoices" as any)
        .select("*")
        .eq("school_id", sid)
        .order("created_at", { ascending: false }) as any);

      if (error) {
        if (error.message?.includes("school_id")) { setRows([]); return; }
        throw error;
      }
      setRows((data ?? []) as unknown as ProformaRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar orçamentos");
    }
  }, [user?.id]);

  useEffect(() => { void reload(); }, [reload]);

  // When client type or person changes, update name/nif
  const handleClientTypeChange = (type: ClientType) => {
    setClientType(type);
    setSelectedPersonId("");
    if (type === "empresa" || type === "outro") {
      setForm((f) => ({ ...f, clientName: "", clientNif: "" }));
    }
  };

  const handlePersonSelect = (personId: string) => {
    setSelectedPersonId(personId);
    const list = clientType === "encarregado" ? guardians : students;
    const person = list.find((p) => p.id === personId);
    if (person) {
      setForm((f) => ({
        ...f,
        clientName: person.full_name || "",
        clientNif: person.tax_id?.replace(/\D/g, "") || "",
      }));
    }
  };

  const currencyLabel = form.currency === "AOA" ? "AKZ" : form.currency;

  // Calculate totals with per-item IVA
  const totalsCalc = useMemo(() => {
    let subtotal = 0;
    let totalIva = 0;
    const taxGroups: Record<string, { base: number; iva: number; pct: number; code: string; reason: string }> = {};

    for (const item of form.items) {
      const itemTotal = parseFloat(item.totalAmount) || 0;
      subtotal += itemTotal;

      const ivaOpt = IVA_OPTIONS.find((o) => o.value === item.ivaPct) ?? IVA_OPTIONS[0];
      const pct = item.ivaPct === "0_M04" ? 0 : (parseFloat(item.ivaPct) || 0);
      const ivaAmount = (itemTotal * pct) / 100;
      totalIva += ivaAmount;

      const groupKey = item.ivaPct;
      if (!taxGroups[groupKey]) {
        taxGroups[groupKey] = { base: 0, iva: 0, pct, code: ivaOpt.code, reason: ivaOpt.reason };
      }
      taxGroups[groupKey].base += itemTotal;
      taxGroups[groupKey].iva += ivaAmount;
    }

    const total = subtotal + totalIva;
    const fmt = (n: number) =>
      new Intl.NumberFormat("pt-AO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

    return { subtotal: fmt(subtotal), iva: fmt(totalIva), total: fmt(total), totalNum: total, taxGroups };
  }, [form.items]);

  const getNextDocNumber = async (): Promise<string> => {
    const year = new Date().getFullYear();
    // Usar prefixo com school para evitar colisão com orçamentos do Super Admin
    // Super Admin usa "PP 2026/X", escolas usam "PP 2026/S-X" (S = primeiros 4 chars do school_id)
    const schoolPrefix = schoolId ? schoolId.slice(0, 4).toUpperCase() : "GEN";
    const prefix = `PP ${year}/${schoolPrefix}-`;
    
    const { data } = await (supabase
      .from("proforma_invoices" as any)
      .select("document_number")
      .like("document_number", `${prefix}%`) as any);
    
    let maxSeq = 0;
    if (data && Array.isArray(data)) {
      for (const row of data) {
        const match = /-(\d+)$/.exec(row.document_number as string);
        if (match) {
          const n = parseInt(match[1], 10);
          if (n > maxSeq) maxSeq = n;
        }
      }
    }
    return `${prefix}${maxSeq + 1}`;
  };

  const handleAddItem = () => {
    setForm({ ...form, items: [...form.items, { description: "", quantity: 1, totalAmount: "", ivaPct: "0" }] });
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
      const totalForSigning = (Math.round((totalsCalc.totalNum + Number.EPSILON) * 100) / 100).toFixed(2);

      let hashExtract: string | null = null;
      try {
        const { data: signData, error: signError } = await supabase.functions.invoke("sign-proforma", {
          body: { document_number: docNumber, issue_date: form.issueDate, total: totalForSigning },
        });
        if (!signError && signData?.hash_control) hashExtract = String(signData.hash_control).slice(0, 4).toUpperCase();
      } catch { /* continua sem hash */ }

      // Calcular IVA global (para compatibilidade com campo iva_percentage existente)
      let subtotalNum = 0;
      let totalIvaNum = 0;
      for (const item of form.items) {
        const t = parseFloat(item.totalAmount) || 0;
        subtotalNum += t;
        const pct = item.ivaPct === "0_M04" ? 0 : (parseFloat(item.ivaPct) || 0);
        totalIvaNum += (t * pct) / 100;
      }

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
        lineItems: form.items.map((it) => {
          const ivaOpt = IVA_OPTIONS.find((o) => o.value === it.ivaPct) ?? IVA_OPTIONS[0];
          return {
            description: it.description,
            quantity: parseInt(String(it.quantity)) || 1,
            totalAmountFmt: it.totalAmount,
            taxLabel: ivaOpt.label,
          };
        }),
        subtotalFmt: totalsCalc.subtotal,
        ivaPercentage: 0,
        ivaFmt: totalsCalc.iva,
        totalFmt: totalsCalc.total,
        taxSummary: Object.entries(totalsCalc.taxGroups).map(([key, g]) => {
          const label = IVA_OPTIONS.find((o) => o.value === key)?.label ?? key;
          const fmt = (n: number) => new Intl.NumberFormat("pt-AO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
          return { label, base: `${fmt(g.base)} AOA`, iva: `${fmt(g.iva)} AOA` };
        }),
        currencyLabel,
        footerNote: form.footerNote.trim() || null,
      };

      const { error: insertError } = await (supabase
        .from("proforma_invoices" as any)
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
            total_amount: it.totalAmount,
            iva_pct: it.ivaPct,
          })),
          subtotal: totalsCalc.subtotal,
          iva_percentage: 0,
          iva_amount: totalsCalc.iva,
          total: totalsCalc.total,
          currency: form.currency,
          footer_note: form.footerNote.trim() || null,
          hash_control: hashExtract,
          school_id: schoolId,
          created_by_id: user?.id,
        }) as any);

      if (insertError) throw insertError;

      const pdf = buildProformaInvoicePdf(pdfInput);
      pdf.save(`${docNumber.replace(/\s+/g, "_")}.pdf`);

      toast.success(`Orçamento ${docNumber} criado!`);
      setDialogOpen(false);
      setForm({
        clientName: "", clientLines: "", clientNif: "", clientEmail: "",
        issueDate: new Date().toISOString().slice(0, 10), validityDays: "30",
        items: [{ description: "", quantity: 1, totalAmount: "", ivaPct: "0" }],
        currency: "AOA", footerNote: "",
      });
      setClientType("encarregado");
      setSelectedPersonId("");
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
      lineItems: row.items.map((it) => {
        const ivaPct = (it as { iva_pct?: string }).iva_pct ?? "0";
        const ivaOpt = IVA_OPTIONS.find((o) => o.value === ivaPct);
        return {
          description: it.description,
          quantity: it.quantity,
          totalAmountFmt: it.total_amount,
          taxLabel: ivaOpt?.label ?? "Isento (M11)",
        };
      }),
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
      const result = data as { ok?: boolean; error?: string; document_number?: string; invoice_id?: string };
      if (!result?.ok && result?.error) { toast.error(result.error); return; }
      toast.success(`Fatura ${result.document_number} gerada!`);
      reload();
      // Download automático do PDF da FT gerada
      if (result.invoice_id) {
        try {
          await downloadFiscalInvoicePdfById(result.invoice_id);
        } catch (pdfErr) {
          console.error("Download PDF FT:", pdfErr);
        }
      }
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

    // Determinar valor parcial baseado na seleção de item
    let partialAmount: number | undefined;
    if (creditNoteItemSelection !== "all" && creditNoteDialog.items.length > 1) {
      const idx = parseInt(creditNoteItemSelection, 10);
      const selectedItem = creditNoteDialog.items[idx];
      if (selectedItem) {
        partialAmount = selectedItem.amount;
      }
    }

    setEmittingCreditNote(true);
    const fx = await invokeCreditNote(creditNoteDialog.invoiceId, reasonText, partialAmount);
    setEmittingCreditNote(false);
    if (!fx.ok) { toast.error(fx.message ?? "Erro ao emitir NC."); return; }
    setCreditNoteDialog(null);
    setCreditNoteReasonOther("");
    setCreditNoteReasonCode("data_error");
    setCreditNoteItemSelection("all");
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
                <DialogDescription>Crie um orçamento com múltiplas taxas de IVA por item.</DialogDescription>
              </DialogHeader>

              {/* Client Type Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Tipo de Cliente</Label>
                  <Select value={clientType} onValueChange={(v) => handleClientTypeChange(v as ClientType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="encarregado">Encarregado</SelectItem>
                      <SelectItem value="aluno">Aluno</SelectItem>
                      <SelectItem value="empresa">Empresa</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(clientType === "encarregado" || clientType === "aluno") && (
                  <div>
                    <Label>{clientType === "encarregado" ? "Encarregado" : "Aluno"}</Label>
                    <Select value={selectedPersonId} onValueChange={handlePersonSelect}>
                      <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                      <SelectContent>
                        {(clientType === "encarregado" ? guardians : students).map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(clientType === "empresa" || clientType === "outro") && (
                  <div>
                    <Label>Nome *</Label>
                    <Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} placeholder="Nome da empresa ou pessoa" />
                  </div>
                )}

                <div>
                  <Label>NIF</Label>
                  <Input value={form.clientNif} onChange={(e) => setForm({ ...form, clientNif: e.target.value })} placeholder="0000000000" maxLength={10} />
                </div>

                <div>
                  <Label>Email</Label>
                  <Input type="email" value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} />
                </div>

                <div className="md:col-span-2">
                  <Label>Morada</Label>
                  <Textarea value={form.clientLines} onChange={(e) => setForm({ ...form, clientLines: e.target.value })} rows={2} placeholder="Morada do cliente" />
                </div>

                <div>
                  <Label>Data de Emissão</Label>
                  <Input type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
                </div>
                <div>
                  <Label>Validade (dias)</Label>
                  <Input type="number" value={form.validityDays} onChange={(e) => setForm({ ...form, validityDays: e.target.value })} min="1" />
                </div>
              </div>

              {/* Items with per-line IVA */}
              <div className="mt-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold">Itens</h3>
                  <Button variant="outline" size="sm" onClick={handleAddItem}><Plus className="w-4 h-4 mr-1" /> Item</Button>
                </div>
                <div className="space-y-2">
                  {form.items.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-end bg-muted/30 p-2 rounded flex-wrap">
                      <div className="flex-1 min-w-[140px]">
                        <Label className="text-xs">Descrição</Label>
                        <Input value={item.description} onChange={(e) => handleItemChange(idx, "description", e.target.value)} placeholder="Serviço" />
                      </div>
                      <div className="w-14">
                        <Label className="text-xs">Qtd</Label>
                        <Input type="number" value={item.quantity} onChange={(e) => handleItemChange(idx, "quantity", parseInt(e.target.value) || 1)} min="1" />
                      </div>
                      <div className="w-24">
                        <Label className="text-xs">Total</Label>
                        <Input value={item.totalAmount} onChange={(e) => handleItemChange(idx, "totalAmount", e.target.value)} placeholder="0,00" />
                      </div>
                      <div className="w-32">
                        <Label className="text-xs">IVA</Label>
                        <Select value={item.ivaPct} onValueChange={(v) => handleItemChange(idx, "ivaPct", v)}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {IVA_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleRemoveItem(idx)} className="text-destructive"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  ))}
                </div>

                {/* Tax Summary */}
                <div className="bg-muted/50 p-3 rounded mt-3 text-sm space-y-2">
                  <p className="font-semibold text-xs uppercase text-muted-foreground">Resumo de Impostos</p>
                  <div className="grid grid-cols-4 gap-2 text-xs font-medium border-b pb-1">
                    <span>Taxa</span><span className="text-right">Base</span><span className="text-right">IVA</span><span className="text-right">Total</span>
                  </div>
                  {Object.entries(totalsCalc.taxGroups).map(([key, g]) => {
                    const label = IVA_OPTIONS.find((o) => o.value === key)?.label ?? key;
                    const fmt = (n: number) => new Intl.NumberFormat("pt-AO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
                    return (
                      <div key={key} className="grid grid-cols-4 gap-2 text-xs">
                        <span>{label}</span>
                        <span className="text-right">{fmt(g.base)}</span>
                        <span className="text-right">{fmt(g.iva)}</span>
                        <span className="text-right">{fmt(g.base + g.iva)}</span>
                      </div>
                    );
                  })}
                  <div className="grid grid-cols-4 gap-2 text-xs font-bold border-t pt-1">
                    <span>Total</span>
                    <span className="text-right">{totalsCalc.subtotal}</span>
                    <span className="text-right">{totalsCalc.iva}</span>
                    <span className="text-right">{totalsCalc.total} {currencyLabel}</span>
                  </div>
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

      {/* List */}
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
                <div className="flex gap-2 flex-wrap justify-end items-center">
                  {row.converted_invoice_id && (
                    <span className="text-xs text-green-600 font-medium">✓ Convertida</span>
                  )}
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
                      <Button variant="outline" size="sm" onClick={() => void downloadFiscalInvoicePdfById(row.converted_invoice_id!)} className="gap-1" title="Descarregar Fatura">
                        <Download className="w-4 h-4" /> FT
                      </Button>
                      {canManage && (
                        <Button variant="outline" size="sm" onClick={async () => {
                          const totalNum = parseFloat(row.total.replace(/\s/g, "").replace(/\./g, "").replace(",", ".")) || 0;
                          // Carregar itens da FT para seleção
                          let items: Array<{ description: string; amount: number; ivaPct: string; taxLabel: string }> = [];
                          const { data: ft } = await supabase.from("invoices").select("line_description").eq("id", row.converted_invoice_id!).maybeSingle();
                          if (ft?.line_description) {
                            const parts = ft.line_description.split(";").map((s: string) => s.trim()).filter(Boolean);
                            for (const part of parts) {
                              const m = /^(.+):(\d[\d\s.,]*):(\d+(?:_M\d+)?)$/.exec(part);
                              if (m) {
                                const amount = parseFloat(m[2].replace(/\s/g, "").replace(",", ".")) || 0;
                                const ivaPct = m[3].trim();
                                const taxLabel = ivaPct === "0" ? "Isento (M11)" : ivaPct === "0_M04" ? "Não sujeito (M04)" : `${ivaPct}%`;
                                items.push({ description: m[1].trim(), amount, ivaPct, taxLabel });
                              }
                            }
                          }
                          setCreditNoteItemSelection("all");
                          setCreditNoteDialog({ invoiceId: row.converted_invoice_id!, documentNumber: row.document_number, grossTotal: totalNum, items });
                        }} className="gap-1" title="Emitir Nota de Crédito">
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
      <Dialog open={!!creditNoteDialog} onOpenChange={(o) => { if (!o && !emittingCreditNote) { setCreditNoteDialog(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Emitir Nota de Crédito</DialogTitle>
            <DialogDescription>A NC retifica a fatura de {creditNoteDialog?.documentNumber ?? "—"} sem apagar o documento original.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Motivo da retificação</Label>
              <Select value={creditNoteReasonCode} onValueChange={(v) => setCreditNoteReasonCode(v as CreditNoteReasonCode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CREDIT_NOTE_REASON_CODES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code === "data_error" ? "Erro de digitação nos dados" : code === "value_error" ? "Erro no valor cobrado" : code === "enrollment_cancellation" ? "Desistência de matrícula" : code === "commercial_discount" ? "Desconto comercial concedido" : code === "service_not_provided" ? "Serviço não prestado" : code === "duplicate_charge" ? "Cobrança duplicada" : "Outro motivo"}
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
            {/* Seleção de item a creditar */}
            {creditNoteDialog && creditNoteDialog.items.length > 1 && (
              <div className="grid gap-2">
                <Label>Item a creditar</Label>
                <Select value={creditNoteItemSelection} onValueChange={setCreditNoteItemSelection}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Fatura total (todos os itens)</SelectItem>
                    {creditNoteDialog.items.map((item, idx) => (
                      <SelectItem key={idx} value={String(idx)}>
                        {item.description} — {new Intl.NumberFormat("pt-AO", { minimumFractionDigits: 2 }).format(item.amount)} Kz ({item.taxLabel})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Selecione "Fatura total" para anular todos os itens, ou escolha um item específico para crédito parcial.
                </p>
              </div>
            )}
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
