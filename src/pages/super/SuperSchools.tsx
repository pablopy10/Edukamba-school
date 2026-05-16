import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { moduleMeta, type ModuleKey } from "@/context/ModulesContext";
import { broadcastTenantChanged } from "@/lib/tenantBroadcast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
};

const moduleKeys = Object.keys(moduleMeta) as ModuleKey[];

const SuperSchools = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<SchoolRow[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [sheetSchool, setSheetSchool] = useState<SchoolRow | null>(null);
  const [locked, setLocked] = useState<Partial<Record<ModuleKey, boolean>>>({});
  const [busy, setBusy] = useState(false);

  const loadSchools = useCallback(() => {
    void (async () => {
      setLoadErr(null);
      const { data, error } = await supabase.rpc("platform_saas_list_schools_with_counts");
      if (error) {
        setLoadErr(error.message);
        setRows([]);
        return;
      }
      setRows((Array.isArray(data) ? data : []) as unknown as SchoolRow[]);
    })();
  }, []);

  useEffect(() => {
    loadSchools();
  }, [loadSchools]);

  const openLocks = async (row: SchoolRow) => {
    setSheetSchool(row);
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
      toast.success("Sessão de suporte iniciada.");
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Escolas na plataforma</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Bloqueios de módulos aplicam-se sempre que a Edukamba desliga um recurso — a equipa escolar não volta a conseguir
            ligar esse módulo sem o vosso apoio. Use &quot;Entrar&quot; apenas para configurar conta com permissão efectiva de
            administrador.
          </p>
        </div>
        <Button type="button" variant="outline" className="rounded-full" disabled={busy} onClick={() => loadSchools()}>
          Actualizar lista
        </Button>
      </div>

      <Card className="overflow-hidden rounded-2xl shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-muted/45 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Escola</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Alunos</th>
                <th className="px-4 py-3 font-semibold">Staff</th>
                <th className="px-4 py-3 font-semibold text-right">Acções</th>
              </tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.school_id} className="border-t border-border/70">
                  <td className="px-4 py-3 font-medium text-foreground">{r.school_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.subscription_status || "—"}</td>
                  <td className="px-4 py-3">{r.student_count}</td>
                  <td className="px-4 py-3">{r.staff_count}</td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      disabled={busy}
                      onClick={() => void openLocks(r)}
                    >
                      Bloqueios
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-full"
                      disabled={busy}
                      onClick={() => void enterSchool(r.school_id)}
                    >
                      Entrar
                    </Button>
                  </td>
                </tr>
              ))}
              {table.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Sem escolas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Sheet open={!!sheetSchool} onOpenChange={(o) => !o && !busy && setSheetSchool(null)}>
        <SheetContent className="sidebar-scroll overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Bloqueios de módulos</SheetTitle>
            <SheetDescription>
              {sheetSchool?.school_name}: quando está activo, os administradores não conseguem activar esse módulo no painel das
              Módulos.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-3">
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
          <SheetFooter className="mt-6 flex-row gap-2 sm:justify-between">
            <Button type="button" variant="secondary" disabled={busy} className="rounded-full" onClick={() => setSheetSchool(null)}>
              Fechar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default SuperSchools;
