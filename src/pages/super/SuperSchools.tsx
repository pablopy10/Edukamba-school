import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { moduleMeta, type ModuleKey } from "@/context/ModulesContext";
import { broadcastTenantChanged } from "@/lib/tenantBroadcast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

type SchoolRow = {
  school_id: string;
  school_name: string;
  subscription_status: string;
  student_count: number;
  staff_count: number;
  nif: string | null;
  address: string | null;
  created_at: string | null;
  saas_contract_number: string | null;
  saas_billing_email: string | null;
  monthly_recurring_amount: number;
  usage_brevo_emails_sent_mt: number;
  usage_proof_storage_bytes_estimate: number;
};

type SheetTab = "profile" | "locks";

const moduleKeys = Object.keys(moduleMeta) as ModuleKey[];

const formatKz = (n: number) =>
  new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);

function formatBytes(b: number) {
  const v = Number(b) || 0;
  if (v < 1024) return `${v} B`;
  const kb = v / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

const SuperSchools = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<SchoolRow[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [sheetSchool, setSheetSchool] = useState<SchoolRow | null>(null);
  const [sheetTab, setSheetTab] = useState<SheetTab>("profile");
  const [locked, setLocked] = useState<Partial<Record<ModuleKey, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const [profileDraft, setProfileDraft] = useState({
    contract: "",
    billingEmail: "",
    mrr: "",
    emailsMt: "",
    storageBytes: "",
  });

  const loadSchools = useCallback(() => {
    void (async () => {
      setLoadErr(null);
      const { data, error } = await supabase.rpc("platform_saas_list_schools_with_counts");
      if (error) {
        setLoadErr(error.message);
        setRows([]);
        return;
      }
      const list = (Array.isArray(data) ? data : []) as unknown as SchoolRow[];
      setRows(list);
      setSheetSchool((current) =>
        current ? (list.find((r) => r.school_id === current.school_id) ?? current) : null,
      );
    })();
  }, []);

  useEffect(() => {
    loadSchools();
  }, [loadSchools]);

  useEffect(() => {
    if (!sheetSchool) return;
    setProfileDraft({
      contract: sheetSchool.saas_contract_number ?? "",
      billingEmail: sheetSchool.saas_billing_email ?? "",
      mrr:
        sheetSchool.monthly_recurring_amount != null &&
        Number.isFinite(Number(sheetSchool.monthly_recurring_amount))
          ? String(Math.round(Number(sheetSchool.monthly_recurring_amount)))
          : "",
      emailsMt:
        sheetSchool.usage_brevo_emails_sent_mt != null
          ? String(Math.max(0, Number(sheetSchool.usage_brevo_emails_sent_mt)))
          : "0",
      storageBytes:
        sheetSchool.usage_proof_storage_bytes_estimate != null
          ? String(Math.max(0, Number(sheetSchool.usage_proof_storage_bytes_estimate)))
          : "0",
    });
  }, [sheetSchool]);

  const openSheet = (row: SchoolRow, tab: SheetTab) => {
    setSheetSchool(row);
    setSheetTab(tab);
    if (tab === "locks") {
      void (async () => {
        const { data, error } = await supabase
          .from("saas_platform_module_locks")
          .select("module_key")
          .eq("school_id", row.school_id);
        if (error) {
          toast.error(error.message);
          return;
        }
        const lk: Partial<Record<ModuleKey, boolean>> = {};
        (data ?? []).forEach((r) => {
          const mk = moduleKeys.includes(r.module_key as ModuleKey) ? (r.module_key as ModuleKey) : null;
          if (mk) lk[mk] = true;
        });
        setLocked(lk);
      })();
    }
  };

  const persistProfile = async () => {
    if (!sheetSchool) return;
    setBusy(true);
    try {
      const emails = Number.parseInt(profileDraft.emailsMt, 10);
      const storage = Number(profileDraft.storageBytes);
      const mrr = Number(profileDraft.mrr.replace(/\s+/g, ""));

      if (!Number.isFinite(emails) || emails < 0) {
        toast.error("Contagem mensal de emails inválida.");
        return;
      }
      if (!Number.isFinite(storage) || storage < 0) {
        toast.error("Estimativa de armazenamento inválida (bytes ≥ 0).");
        return;
      }
      if (!Number.isFinite(mrr) || mrr < 0) {
        toast.error("MRR mensal deve ser um número não negativo.");
        return;
      }

      const { error: p1 } = await supabase.rpc("platform_super_patch_school_saas_meta", {
        _school_id: sheetSchool.school_id,
        _patch: {
          saas_contract_number: profileDraft.contract,
          saas_billing_email: profileDraft.billingEmail,
          usage_brevo_emails_sent_mt: emails,
          usage_proof_storage_bytes_estimate: Math.trunc(storage),
        },
      });
      if (p1) throw p1;

      const { error: p2 } = await supabase.rpc("platform_super_set_subscription_mrr", {
        _school_id: sheetSchool.school_id,
        _monthly_recurring_amount: mrr,
      });
      if (p2) throw p2;

      toast.success("Dados SaaS gravados.");
      loadSchools();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gravar");
    } finally {
      setBusy(false);
    }
  };

  const setLock = async (key: ModuleKey, on: boolean) => {
    if (!sheetSchool) return;
    setBusy(true);
    const prev = locked[key] === true;
    setLocked((l) => ({ ...l, [key]: on }));
    try {
      const { error } = await supabase.rpc("platform_set_module_lock", {
        _school_id: sheetSchool.school_id,
        _module_key: key,
        _locked: on,
      });
      if (error) throw error;
      broadcastTenantChanged();
      toast.success(on ? `${moduleMeta[key].label} bloqueado para a escola` : `${moduleMeta[key].label} desbloqueado`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao actualizar bloqueios";
      toast.error(msg);
      setLocked((l) => ({ ...l, [key]: prev }));
    } finally {
      setBusy(false);
    }
  };

  const enterSchool = async (schoolId: string) => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("platform_super_set_support_context", { _school_id: schoolId });
      if (error) throw error;
      broadcastTenantChanged();
      toast.success("Contexto institucional activo como administrador — abrindo dashboard da escola.");
      navigate("/dashboard");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao assumir conta";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const table = useMemo(() => rows ?? [], [rows]);

  if (loadErr) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
        {loadErr}
      </div>
    );
  }

  if (rows === null) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Gestão SaaS das escolas</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            <strong className="font-medium text-foreground">Perfil SaaS consolidado:</strong> NIF, dados de cobrança e
            referência contratual ficam lado a lado com os{" "}
            <strong className="font-medium text-foreground">indicadores de consumo mensal estimados</strong> (placeholder
            para integrações Brevo / storage até termos quotas automáticas).{" "}
            <strong className="font-medium text-foreground">Aceder como administrador</strong> põe esta sessão SUPER_ADMIN em
            contexto de administrador institucional, sem criar novo utilizador.
          </p>
        </div>
        <Button type="button" variant="outline" className="rounded-full" disabled={busy} onClick={() => loadSchools()}>
          Actualizar lista
        </Button>
      </div>

      <Card className="overflow-hidden rounded-2xl shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-muted/45 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Escola</th>
                <th className="px-4 py-3 font-semibold">Estado SaaS</th>
                <th className="px-4 py-3 font-semibold text-right tabular-nums">Alunos</th>
                <th className="px-4 py-3 font-semibold text-right tabular-nums">Staff</th>
                <th className="px-4 py-3 font-semibold text-right tabular-nums">MRR</th>
                <th className="px-4 py-3 font-semibold text-right">Acções</th>
              </tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.school_id} className="border-t border-border/70 align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{r.school_name}</div>
                    <div className="text-[11px] text-muted-foreground">{r.nif ? `NIF ${r.nif}` : "NIF pendente"}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.subscription_status || "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.student_count}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.staff_count}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatKz(Number(r.monthly_recurring_amount) || 0)} Kz</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        disabled={busy}
                        onClick={() => openSheet(r, "profile")}
                      >
                        Perfil SaaS
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        disabled={busy}
                        onClick={() => openSheet(r, "locks")}
                      >
                        Bloqueios
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="rounded-full"
                        disabled={busy}
                        onClick={() => void enterSchool(r.school_id)}
                        title="Assume contexto ADMIN desta instituição"
                      >
                        Aceder como Admin
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {table.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Sem escolas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Sheet
        open={!!sheetSchool}
        onOpenChange={(o) => {
          if (!o && !busy) {
            setSheetSchool(null);
            setLocked({});
          }
        }}
      >
        <SheetContent className="sidebar-scroll flex max-h-[100dvh] flex-col overflow-hidden sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{sheetSchool?.school_name}</SheetTitle>
            <SheetDescription>
              {sheetTab === "profile"
                ? "Dados fiscal/cobrança/plano — actualizados via RPC seguradas para SUPER_ADMIN."
                : "Painel de feature flags: bloquear módulos que a instituição activou internamente até regularizar SaaS."}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-5 flex shrink-0 gap-2 rounded-full bg-muted/40 p-1 text-[11px] font-semibold">
            <button
              type="button"
              disabled={busy}
              onClick={() => sheetSchool && openSheet(sheetSchool, "profile")}
              className={`flex-1 rounded-full px-3 py-1.5 transition ${
                sheetTab === "profile" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              Perfil & consumo
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => sheetSchool && openSheet(sheetSchool, "locks")}
              className={`flex-1 rounded-full px-3 py-1.5 transition ${
                sheetTab === "locks" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              Bloqueios
            </button>
          </div>

          <div className="mt-5 flex-1 space-y-4 overflow-y-auto pr-2">
            {sheetTab === "profile" && sheetSchool ? (
              <>
                <div className="rounded-2xl border border-border px-4 py-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Morada institucional</p>
                  <p className="mt-2 text-sm text-foreground">{sheetSchool.address ?? "Sem morada registada"}</p>
                  <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between gap-3">
                      <dt>Data de entrada</dt>
                      <dd className="text-right tabular-nums text-foreground">
                        {sheetSchool.created_at ? new Date(sheetSchool.created_at).toLocaleDateString("pt-PT") : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>Consumo mails (manual)</dt>
                      <dd className="text-right">{sheetSchool.usage_brevo_emails_sent_mt ?? 0}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>Espaço proofs (manual)</dt>
                      <dd className="text-right">{formatBytes(Number(sheetSchool.usage_proof_storage_bytes_estimate || 0))}</dd>
                    </div>
                  </dl>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contract">Contrato / referência interna</Label>
                  <Input
                    id="contract"
                    value={profileDraft.contract}
                    disabled={busy}
                    onChange={(e) => setProfileDraft({ ...profileDraft, contract: e.target.value })}
                    placeholder="Ex.: CTR-CSFA-2026"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="billing">Email fiscal / cobrança</Label>
                  <Input
                    id="billing"
                    type="email"
                    value={profileDraft.billingEmail}
                    disabled={busy}
                    onChange={(e) => setProfileDraft({ ...profileDraft, billingEmail: e.target.value })}
                    placeholder="tesouraria@escola.edu.ao"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mrr">Mensalidade SaaS (Kz · MRR)</Label>
                  <Input
                    id="mrr"
                    inputMode="decimal"
                    value={profileDraft.mrr}
                    disabled={busy}
                    onChange={(e) => setProfileDraft({ ...profileDraft, mrr: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="emails">Emails Brevo (mês estim.)</Label>
                    <Input
                      id="emails"
                      inputMode="numeric"
                      value={profileDraft.emailsMt}
                      disabled={busy}
                      onChange={(e) => setProfileDraft({ ...profileDraft, emailsMt: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stor">Proof storage (bytes)</Label>
                    <Input
                      id="stor"
                      inputMode="numeric"
                      value={profileDraft.storageBytes}
                      disabled={busy}
                      onChange={(e) => setProfileDraft({ ...profileDraft, storageBytes: e.target.value })}
                    />
                  </div>
                </div>
              </>
            ) : sheetTab === "locks" ? (
              <div className="space-y-3 pb-10">
                {moduleKeys.map((k) => (
                  <div key={k} className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{moduleMeta[k].label}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{moduleMeta[k].path}</p>
                    </div>
                    <Switch checked={locked[k] === true} disabled={busy} onCheckedChange={(v) => void setLock(k, v)} />
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <SheetFooter className="mt-4 shrink-0 flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">
            <Button type="button" variant="secondary" disabled={busy} className="rounded-full" onClick={() => setSheetSchool(null)}>
              Fechar
            </Button>
            {sheetTab === "profile" && sheetSchool ? (
              <Button type="button" className="rounded-full" disabled={busy} onClick={() => void persistProfile()}>
                Gravar SaaS / consumo / MRR
              </Button>
            ) : null}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default SuperSchools;
