import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  downloadEdukambaProposalPdf,
  proposalPdfBase64,
  type EdukambaProposalPdfInput,
} from "@/lib/pdfProposal";
import { buildProformaProposalHtml, buildProformaRenderInput } from "@/lib/proformaProposal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type ProposalRow = {
  id: string;
  title: string;
  summary: string | null;
  body_text: string;
  recipient_email: string | null;
  status: string;
  currency: string;
  amount_estimate: number | null;
  lead_id: string | null;
  created_at?: string | null;
  sent_at?: string | null;
  email_opened_at?: string | null;
  brevo_message_id?: string | null;
};

type LeadTiny = { id: string; organization_name: string; nif: string | null };

const SuperProposals = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<ProposalRow[] | null>(null);
  const [leads, setLeads] = useState<LeadTiny[]>([]);
  const [busy, setBusy] = useState(false);
  const [sendingProposalId, setSendingProposalId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    summary: "",
    body: "",
    email: "",
    amount: "",
    currency: "AOA",
    lead_id: "__none",
  });

  const reload = useCallback(() => {
    void (async () => {
      const [pRes, lRes] = await Promise.all([
        supabase.from("saas_sales_proposals").select("*").order("created_at", { ascending: false }),
        supabase.from("saas_sales_leads").select("id, organization_name, nif").order("organization_name"),
      ]);
      setRows(((pRes.data ?? []) as unknown) as ProposalRow[]);
      setLeads(((lRes.data ?? []) as unknown) as LeadTiny[]);
    })();
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const filteredLeads = useMemo(() => leads, [leads]);

  const draftPreviewHtml = useMemo(() => {
    const leadOrg =
      form.lead_id !== "__none" ? leads.find((l) => l.id === form.lead_id)?.organization_name : undefined;
    const render = buildProformaRenderInput({
      proposal: {
        id: "draft-preview",
        title: form.title.trim() || "Nova proposta",
        summary: form.summary.trim() || null,
        body_text: form.body,
        amount_estimate:
          form.amount === "" || Number.isNaN(Number(form.amount)) ? null : Number(form.amount),
        currency: form.currency,
        recipient_email: form.email.trim() || null,
        created_at: null,
      },
      lead: leadOrg ? { organization_name: leadOrg } : null,
    });
    return buildProformaProposalHtml(render);
  }, [form.title, form.summary, form.body, form.amount, form.currency, form.email, form.lead_id, leads]);

  function rowToPdfInput(r: ProposalRow): EdukambaProposalPdfInput {
    const lead = r.lead_id ? leads.find((l) => l.id === r.lead_id) : null;
    return {
      id: r.id,
      title: r.title,
      recipientEmail: r.recipient_email ?? undefined,
      summary: r.summary ?? undefined,
      body: r.body_text,
      amount: r.amount_estimate != null ? String(r.amount_estimate) : undefined,
      currency: r.currency,
      created_at: r.created_at ?? null,
      leadOrganizationName: lead?.organization_name ?? null,
    };
  }

  const sendProposalByServer = async (r: ProposalRow) => {
    if (!r.recipient_email?.includes("@")) {
      toast.error("Esta proposta não tem email de destino.");
      return;
    }
    setSendingProposalId(r.id);
    try {
      const pdf_base64 = proposalPdfBase64(rowToPdfInput(r));
      const { data, error } = await supabase.functions.invoke("send-sales-proposal-email", {
        body: {
          proposal_id: r.id,
          pdf_base64,
          pdf_filename: `Proposta-${r.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 48) || "edukamba"}.pdf`,
        },
      });
      if (error) throw error;
      const payload = data as { ok?: boolean; error?: string; warning?: string };
      if (!payload?.ok && payload?.error) {
        toast.error(payload.error);
        return;
      }
      if (payload?.warning) toast.warning(payload.warning);
      else toast.success("Email enviado pelo servidor.");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no envio");
    } finally {
      setSendingProposalId(null);
    }
  };

  const composeMailto = (r: ProposalRow) => {
    const to = r.recipient_email ?? "";
    const subject = encodeURIComponent(`Proposta: ${r.title}`);
    const hi = `Segue PDF da proposta comercial (${r.title}) em anexo.`;
    const body = encodeURIComponent(
      `${hi}\n\n` +
        (r.summary ? `${r.summary}\n\n` : "") +
        (r.amount_estimate != null ? `Valor estimado: ${r.amount_estimate} ${r.currency}\n` : "") +
        `\nGerado no dashboard de gestão Edukamba.`,
    );
    return `mailto:${to}?subject=${subject}&body=${body}`;
  };

  if (!rows) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Propostas comerciais (leads)</h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Ligue propostas a leads do CRM, gere valores e PDF. <strong className="text-foreground">Enviar (servidor)</strong> usa a Edge Function{" "}
          <code className="text-xs">send-sales-proposal-email</code> (Brevo, secrets <code className="text-xs">BREVO_*</code>). O histórico
          regista `sent_at` e o ID Brevo; aberturas de email dependem do tracking/webhook configurado no Brevo (campo `email_opened_at`).
        </p>
      </div>

      <Card className="rounded-2xl border-border/70 p-5 shadow-soft">
        <h2 className="text-lg font-semibold text-foreground">Nova proposta</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Título interno</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Email destinatário</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Resumo executivo</Label>
            <Input value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Valor estimado</Label>
            <div className="flex gap-2">
              <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="flex-1" />
              <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AOA">AOA</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Vincular a lead</Label>
            <Select value={form.lead_id} onValueChange={(v) => setForm({ ...form, lead_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Opcional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Sem lead</SelectItem>
                {filteredLeads.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.organization_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Corpo (texto ou JSON estruturado)</Label>
            <p className="text-xs text-muted-foreground">
              O PDF e a pré-visualização seguem o layout «Fatura Proforma». Opcionalmente, comece o corpo por JSON com{" "}
              <code className="text-[11px]">items[]</code>, <code className="text-[11px]">client_lines[]</code>,{" "}
              <code className="text-[11px]">bank</code>, etc.; caso contrário, o conteúdo entra numa única linha de serviço.
            </p>
            <Textarea rows={6} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={busy || !form.title.trim()}
            onClick={() => void (async () => {
              setBusy(true);
              try {
                const { error } = await supabase.from("saas_sales_proposals").insert({
                    title: form.title.trim(),
                    recipient_email: form.email.trim() || null,
                    summary: form.summary.trim() || null,
                    body_text: form.body.trim() || "",
                    amount_estimate:
                      form.amount === "" || Number.isNaN(Number(form.amount)) ? null : Number(form.amount),
                    currency: form.currency,
                    status: "draft",
                    created_by: user?.id ?? null,
                    lead_id: form.lead_id === "__none" ? null : form.lead_id,
                  });
                if (error) throw error;
                toast.success("Proposta guardada.");
                setForm({ title: "", summary: "", body: "", email: "", amount: "", currency: form.currency, lead_id: "__none" });
                reload();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Erro ao guardar");
              } finally {
                setBusy(false);
              }
            })()}
          >
            Guardar na base
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!form.title.trim() || !form.body.trim()}
            onClick={() => {
              const leadOrg =
                form.lead_id !== "__none"
                  ? leads.find((l) => l.id === form.lead_id)?.organization_name ?? null
                  : null;
              downloadEdukambaProposalPdf(
                {
                  id: "draft-local",
                  title: form.title,
                  recipientEmail: form.email || undefined,
                  summary: form.summary || undefined,
                  body: form.body,
                  amount: form.amount || undefined,
                  currency: form.currency,
                  leadOrganizationName: leadOrg,
                },
                `proposta-${form.title.replace(/\s+/g, "-").slice(0, 40)}.pdf`,
              );
              toast.success("PDF gerado.");
            }}
          >
            Descarregar PDF
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden rounded-2xl border-border/70 shadow-soft">
        <div className="border-b border-border/70 px-5 py-3 text-sm font-semibold text-muted-foreground">
          Pré-visualização · Fatura Proforma (layout oficial)
        </div>
        <iframe
          title="Pré-visualização da Fatura Proforma"
          className="h-[min(90vh,920px)] w-full bg-muted/30"
          srcDoc={draftPreviewHtml}
        />
      </Card>

      <Card className="overflow-hidden rounded-2xl shadow-soft">
        <div className="border-b border-border/70 px-5 py-3 text-sm font-semibold text-muted-foreground">Histórico</div>
        <div className="overflow-x-auto">
          <table className="min-w-[1040px] w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Título</th>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Valor</th>
                <th className="px-4 py-2 text-left">Estado / envios</th>
                <th className="px-4 py-2 text-right">Acções</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">{r.title}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.recipient_email ?? "—"}</td>
                  <td className="px-4 py-2">
                    {r.amount_estimate != null ? `${r.amount_estimate} ${r.currency}` : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="font-medium capitalize">{r.status}</div>
                    {r.sent_at ? (
                      <div className="text-[11px] text-muted-foreground">
                        Enviado: {new Date(r.sent_at).toLocaleString("pt-PT")}
                      </div>
                    ) : (
                      <div className="text-[11px] text-muted-foreground">Sem envio registado.</div>
                    )}
                    <div className="text-[11px] text-muted-foreground">
                      Open:{" "}
                      {r.email_opened_at ? new Date(r.email_opened_at).toLocaleString("pt-PT") : "Aguardando tracking"}
                      {r.brevo_message_id ? ` · Brevo #${String(r.brevo_message_id).slice(0, 10)}…` : ""}
                    </div>
                  </td>
                  <td className="space-x-2 px-4 py-2 text-right whitespace-nowrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() =>
                        downloadEdukambaProposalPdf(
                          rowToPdfInput(r),
                          `proposta-${r.id.slice(0, 8)}.pdf`,
                        )
                      }
                    >
                      PDF
                    </Button>
                    {r.recipient_email ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="rounded-full"
                          disabled={sendingProposalId === r.id}
                          onClick={() => void sendProposalByServer(r)}
                        >
                          {sendingProposalId === r.id ? (
                            <>
                              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                              A enviar…
                            </>
                          ) : (
                            "Enviar servidor"
                          )}
                        </Button>
                        <Button type="button" size="sm" className="rounded-full" asChild>
                          <a href={composeMailto(r)}>Email</a>
                        </Button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    Sem registos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default SuperProposals;
