import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, UserMinus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type LeadRow = {
  id: string;
  organization_name: string;
  contact_email: string | null;
  contact_name: string | null;
  phone: string | null;
  nif: string | null;
  pipeline_stage: string;
  assigned_to: string | null;
  notes: string | null;
  estimated_seats: number | null;
  created_at: string;
};

const STAGES = [
  { key: "new", label: "Nova lead" },
  { key: "contacted", label: "Reunião agendada" },
  { key: "qualified", label: "Proposta enviada" },
  { key: "proposal", label: "Negociação" },
  { key: "won", label: "Ganho" },
  { key: "lost", label: "Perdido" },
] as const;

const SuperCrm = () => {
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [assignableIds, setAssignableIds] = useState<string[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, string>>({});

  const [newOpen, setNewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newLead, setNewLead] = useState({
    organization_name: "",
    contact_name: "",
    contact_email: "",
    phone: "",
    nif: "",
    estimated_seats: "",
    notes: "",
  });
  const [addStaffId, setAddStaffId] = useState("");

  const loadAll = useCallback(() => {
    void (async () => {
      const [leRes, asRes] = await Promise.all([
        supabase.from("saas_sales_leads").select("*").order("created_at", { ascending: false }),
        supabase.from("saas_crm_assignable_profiles").select("profile_id"),
      ]);

      setLeads(((leRes.data ?? []) as unknown) as LeadRow[]);

      if (leRes.error) toast.error(leRes.error.message);
      if (asRes.error) toast.error(asRes.error.message);

      const ids = (asRes.data ?? []).map((r) => String((r as { profile_id: string }).profile_id));
      setAssignableIds(ids);

      if (ids.length) {
        const { data: pname } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        const mp: Record<string, string> = {};
        (pname ?? []).forEach((r) => {
          mp[r.id as string] = (r.full_name as string) ?? r.id.slice(0, 8);
        });
        setProfilesById(mp);
      } else {
        setProfilesById({});
      }
    })();
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const upsertLead = async (partial: Partial<LeadRow>, id?: string) => {
    setBusy(true);
    try {
      if (id) {
        const { error } = await supabase.from("saas_sales_leads").update(partial).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("saas_sales_leads").insert({
          organization_name: partial.organization_name ?? "Sem nome",
          contact_name: partial.contact_name ?? null,
          contact_email: partial.contact_email ?? null,
          phone: partial.phone ?? null,
          nif: partial.nif ?? null,
          pipeline_stage: partial.pipeline_stage ?? "new",
          assigned_to: partial.assigned_to ?? null,
          notes: partial.notes ?? null,
          estimated_seats:
            typeof partial.estimated_seats === "number" && Number.isFinite(partial.estimated_seats)
              ? partial.estimated_seats
              : partial.estimated_seats === undefined
                ? null
                : Number(partial.estimated_seats),
        });
        if (error) throw error;
      }
      toast.success("Lead actualizado.");
      loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao guardar");
    } finally {
      setBusy(false);
    }
  };

  const addAssignable = async () => {
    const trimmed = addStaffId.trim();
    if (!trimmed) return;
    const { data: prof, error: e1 } = await supabase.from("profiles").select("id").eq("id", trimmed).maybeSingle();
    if (e1 || !prof) {
      toast.error("UUID de utilizador não encontrado na plataforma.");
      return;
    }
    const { error } = await supabase.from("saas_crm_assignable_profiles").insert({ profile_id: trimmed });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Comercial/recurso pode ser assignado.");
    setAddStaffId("");
    loadAll();
  };

  const removeAssignable = async (pid: string) => {
    const { error } = await supabase.from("saas_crm_assignable_profiles").delete().eq("profile_id", pid);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Removido da lista de assignações.");
    loadAll();
  };

  const columns = STAGES.map((s) => ({
    ...s,
    items: (leads ?? []).filter((l) => l.pipeline_stage === s.key),
  }));

  if (!leads) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">CRM — Kanban de leads</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Funil por colunas (<em>Nova lead</em> até <em>Ganho</em>/<em>Perdido</em>); distribua trabalho pela equipa e ligue cada lead aos{" "}
            <strong className="font-medium text-foreground">orçamentos</strong> na página Orçamentos.
          </p>
        </div>
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild>
            <Button type="button" className="gap-2 rounded-full">
              <Plus className="h-4 w-4" />
              Novo lead
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Novo lead</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="space-y-1">
                <Label htmlFor="org">Organização / escola prospect</Label>
                <Input id="org" value={newLead.organization_name} onChange={(e) => setNewLead({ ...newLead, organization_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="cn">Nome contacto</Label>
                  <Input id="cn" value={newLead.contact_name} onChange={(e) => setNewLead({ ...newLead, contact_name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mail">Email</Label>
                  <Input id="mail" type="email" value={newLead.contact_email} onChange={(e) => setNewLead({ ...newLead, contact_email: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="ph">Telefone</Label>
                  <Input id="ph" value={newLead.phone} onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="es">Licenças (estim.)</Label>
                  <Input
                    id="es"
                    type="number"
                    value={newLead.estimated_seats}
                    onChange={(e) => setNewLead({ ...newLead, estimated_seats: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="nif">NIF fiscal</Label>
                <Input
                  id="nif"
                  value={newLead.nif}
                  onChange={(e) => setNewLead({ ...newLead, nif: e.target.value })}
                  placeholder="0000000000 (10 dígitos)"
                  maxLength={10}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="nts">Notas internas</Label>
                <Textarea id="nts" rows={3} value={newLead.notes} onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={busy}
                onClick={async () => {
                  await upsertLead(
                    {
                      organization_name: newLead.organization_name,
                      contact_name: newLead.contact_name || null,
                      contact_email: newLead.contact_email || null,
                      phone: newLead.phone || null,
                      nif: newLead.nif.trim() || null,
                      pipeline_stage: "new",
                      notes: newLead.notes || null,
                      estimated_seats: newLead.estimated_seats === "" ? null : Number(newLead.estimated_seats),
                    },
                    undefined,
                  );
                  setNewOpen(false);
                  setNewLead({ organization_name: "", contact_name: "", contact_email: "", phone: "", nif: "", estimated_seats: "", notes: "" });
                }}
              >
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {columns.map((col) => (
          <div key={col.key} className="w-[260px] shrink-0 rounded-2xl border border-border bg-muted/20">
            <div className="border-b border-border/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {col.label} · {col.items.length}
            </div>
            <div className="flex max-h-[min(520px,calc(100vh-16rem))] flex-col gap-2 overflow-y-auto p-2">
              {col.items.map((lead) => (
                <Card key={lead.id} className="rounded-xl border-border/70 p-3 shadow-soft">
                  <p className="font-semibold leading-snug text-foreground">{lead.organization_name}</p>
                  {lead.contact_name ? (
                    <p className="text-xs text-muted-foreground">{lead.contact_name}</p>
                  ) : null}
                  <div className="mt-2 space-y-1">
                    <div className="grid gap-1">
                      <span className="text-[10px] font-semibold uppercase text-muted-foreground">Estágio</span>
                      <Select
                        disabled={busy}
                        value={lead.pipeline_stage}
                        onValueChange={(v) =>
                          upsertLead(
                            {
                              pipeline_stage: v as LeadRow["pipeline_stage"],
                            },
                            lead.id,
                          )
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STAGES.map((s) => (
                            <SelectItem key={s.key} value={s.key}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1">
                      <span className="text-[10px] font-semibold uppercase text-muted-foreground">Responsável</span>
                      <Select
                        disabled={busy}
                        value={lead.assigned_to ?? "__none"}
                        onValueChange={(v) =>
                          upsertLead(
                            {
                              assigned_to: v === "__none" ? null : v,
                            },
                            lead.id,
                          )
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Sem responsável</SelectItem>
                          {assignableIds.map((pid) => (
                            <SelectItem key={pid} value={pid}>
                              {profilesById[pid] ?? pid.slice(0, 8)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Card className="rounded-2xl border-border/70 p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Equipa CRM (podem aparecer nos leads)</h2>
            <p className="text-sm text-muted-foreground">
              Adicione o UUID do perfil (Definições do utilizador) para permitir assignment; remova quando deixarem de abrir novos deals.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label>UUID utilizador Supabase</Label>
              <Input value={addStaffId} onChange={(e) => setAddStaffId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            </div>
            <Button type="button" variant="outline" className="rounded-full" disabled={busy} onClick={() => void addAssignable()}>
              Adicionar
            </Button>
          </div>
        </div>
        <ul className="mt-4 divide-y divide-border">
          {assignableIds.map((pid) => (
            <li key={pid} className="flex items-center justify-between gap-2 py-3 text-sm">
              <span>
                <span className="font-medium">{profilesById[pid] ?? "—"}</span>
                <span className="ml-2 font-mono text-xs text-muted-foreground">{pid}</span>
              </span>
              <Button variant="ghost" size="sm" type="button" className="shrink-0 text-destructive" onClick={() => void removeAssignable(pid)}>
                <UserMinus className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))}
          {!assignableIds.length && (
            <li className="py-4 text-center text-sm text-muted-foreground">Lista vazia — adiciona primeiro o teu perfil SUPER_ADMIN aqui.</li>
          )}
        </ul>
      </Card>
    </div>
  );
};

export default SuperCrm;
