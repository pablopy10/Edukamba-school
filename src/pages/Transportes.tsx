import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Bus, Plus, Pencil, Trash2, MapPin, Users, ListChecks, Printer, Search, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { NativeMobileFabPortal } from "@/components/dashboard/NativeMobileFabPortal";
import { isNativeMobileApp, NATIVE_MOBILE_FAB_BUTTON_CLASSNAME } from "@/lib/nativeApp";
import { RouteFormDialog, type RouteRow } from "@/components/transportes/RouteFormDialog";
import { StopFormDialog, type StopRow } from "@/components/transportes/StopFormDialog";
import { TransportEnrollmentDialog, type TransportEnrollment } from "@/components/transportes/TransportEnrollmentDialog";
import { cn } from "@/lib/utils";
import { isSchoolManagementRole } from "@/lib/schoolStaffRoles";

type Enrollment = TransportEnrollment & {
  student?: { full_name: string; classroom_id: string | null };
  pickup_stop?: { name: string } | null;
  dropoff_stop?: { name: string } | null;
};

const shiftLabel = (s: string) => (s === "MORNING" ? "Manhã" : s === "AFTERNOON" ? "Tarde" : "Manhã + Tarde");
const directionLabel = (d: string) => (d === "PICKUP" ? "Ida" : d === "DROPOFF" ? "Regresso" : "Ida + Regresso");

const Transportes = () => {
  const native = isNativeMobileApp();
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [stops, setStops] = useState<StopRow[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");

  // Dialogs
  const [routeOpen, setRouteOpen] = useState(false);
  const [editRoute, setEditRoute] = useState<RouteRow | null>(null);
  const [deleteRouteId, setDeleteRouteId] = useState<string | null>(null);

  const [stopOpen, setStopOpen] = useState(false);
  const [stopRouteId, setStopRouteId] = useState<string>("");
  const [editStop, setEditStop] = useState<StopRow | null>(null);
  const [deleteStopId, setDeleteStopId] = useState<string | null>(null);

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [editEnroll, setEditEnroll] = useState<Enrollment | null>(null);
  const [deleteEnrollId, setDeleteEnrollId] = useState<string | null>(null);

  // Passenger list
  const [listRouteId, setListRouteId] = useState<string>("");
  const [transportTab, setTransportTab] = useState("rotas");

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("school_id, role")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.school_id) {
        setSchoolId(profile.school_id);
        setRole(profile.role);
      }
    };
    init();
  }, []);

  const loadAll = async () => {
    if (!schoolId) return;
    setLoading(true);
    const [r, s, e] = await Promise.all([
      supabase.from("transport_routes").select("*").eq("school_id", schoolId).order("name"),
      supabase.from("transport_stops").select("*").eq("school_id", schoolId).order("position"),
      supabase
        .from("transport_enrollments")
        .select("*, student:students(full_name, classroom_id), pickup_stop:transport_stops!transport_enrollments_pickup_stop_id_fkey(name), dropoff_stop:transport_stops!transport_enrollments_dropoff_stop_id_fkey(name)")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false }),
    ]);
    setRoutes((r.data as RouteRow[]) ?? []);
    setStops((s.data as StopRow[]) ?? []);
    setEnrollments((e.data as Enrollment[]) ?? []);
    if (!listRouteId && r.data && r.data.length > 0) setListRouteId((r.data[0] as RouteRow).id);
    setLoading(false);
  };

  useEffect(() => {
    if (schoolId) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const isAdmin = isSchoolManagementRole(role);

  const filteredRoutes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return routes;
    return routes.filter((r) =>
      [r.name, r.driver_name, r.vehicle_plate, r.description].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [routes, search]);

  const enrollmentsByRoute = useMemo(() => {
    const map = new Map<string, Enrollment[]>();
    enrollments.forEach((e) => {
      const arr = map.get(e.route_id) ?? [];
      arr.push(e);
      map.set(e.route_id, arr);
    });
    return map;
  }, [enrollments]);

  const stopsByRoute = useMemo(() => {
    const map = new Map<string, StopRow[]>();
    stops.forEach((s) => {
      const arr = map.get(s.route_id) ?? [];
      arr.push(s);
      map.set(s.route_id, arr);
    });
    return map;
  }, [stops]);

  const passengerList = useMemo(() => {
    const list = (enrollmentsByRoute.get(listRouteId) ?? []).filter((e) => e.status === "ACTIVE");
    // group by pickup stop position
    const byStop = new Map<string, Enrollment[]>();
    list.forEach((e) => {
      const key = e.pickup_stop_id ?? "__no_stop__";
      const arr = byStop.get(key) ?? [];
      arr.push(e);
      byStop.set(key, arr);
    });
    return byStop;
  }, [enrollmentsByRoute, listRouteId]);

  const handleDeleteRoute = async () => {
    if (!deleteRouteId) return;
    const { error } = await supabase.from("transport_routes").delete().eq("id", deleteRouteId);
    if (error) toast.error(error.message);
    else toast.success("Rota removida");
    setDeleteRouteId(null);
    loadAll();
  };

  const handleDeleteStop = async () => {
    if (!deleteStopId) return;
    const { error } = await supabase.from("transport_stops").delete().eq("id", deleteStopId);
    if (error) toast.error(error.message);
    else toast.success("Paragem removida");
    setDeleteStopId(null);
    loadAll();
  };

  const handleDeleteEnroll = async () => {
    if (!deleteEnrollId) return;
    const { error } = await supabase.from("transport_enrollments").delete().eq("id", deleteEnrollId);
    if (error) toast.error(error.message);
    else toast.success("Inscrição removida");
    setDeleteEnrollId(null);
    loadAll();
  };

  const handleRegenerateFees = async (enrollmentId: string) => {
    const { error, data } = await supabase.rpc("generate_transport_fees", { _enrollment_id: enrollmentId });
    if (error) toast.error(error.message);
    else toast.success(`Mensalidades geradas: ${data}`);
  };

  const handlePrintList = () => window.print();

  const selectedListRoute = routes.find((r) => r.id === listRouteId);

  return (
    <>
      <div className={cn("flex flex-col gap-6", native && isAdmin && transportTab !== "lista" && "relative pb-28")}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-foreground">
              <Bus className="h-8 w-8 text-primary" />
              Transporte Escolar
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Giros, paragens, inscrições e listas de passageiros para o motorista.
            </p>
          </div>
          {isAdmin && !native && (
            <Button onClick={() => { setEditRoute(null); setRouteOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Nova rota
            </Button>
          )}
        </div>

        <Tabs value={transportTab} onValueChange={setTransportTab} className="w-full">
          <TabsList>
            <TabsTrigger value="rotas"><Bus className="mr-2 h-4 w-4" />Rotas</TabsTrigger>
            <TabsTrigger value="inscricoes"><Users className="mr-2 h-4 w-4" />Inscrições</TabsTrigger>
            <TabsTrigger value="lista"><ListChecks className="mr-2 h-4 w-4" />Lista de passageiros</TabsTrigger>
          </TabsList>

          {/* ROTAS */}
          <TabsContent value="rotas" className="mt-4">
            <div className="mb-4 flex items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Pesquisar rota, motorista, matrícula…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {loading ? (
              <p className="text-muted-foreground">A carregar…</p>
            ) : filteredRoutes.length === 0 ? (
              <Card className="p-10 text-center text-muted-foreground">
                Sem rotas registadas. {isAdmin && "Crie a primeira rota."}
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredRoutes.map((r) => {
                  const routeStops = stopsByRoute.get(r.id) ?? [];
                  const enrolled = (enrollmentsByRoute.get(r.id) ?? []).filter((e) => e.status === "ACTIVE").length;
                  return (
                    <Card key={r.id} className="flex flex-col gap-4 p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold">{r.name}</h3>
                            {!r.is_active && <Badge variant="secondary">Inativa</Badge>}
                          </div>
                          {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}
                        </div>
                        {isAdmin && (
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => { setEditRoute(r); setRouteOpen(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setDeleteRouteId(r.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><span className="text-muted-foreground">Período:</span> {shiftLabel(r.shift)}</div>
                        <div><span className="text-muted-foreground">Capacidade:</span> {r.capacity}</div>
                        <div><span className="text-muted-foreground">Mensalidade:</span> {r.monthly_fee} AOA</div>
                        <div><span className="text-muted-foreground">Inscritos:</span> {enrolled}/{r.capacity}</div>
                        {r.driver_name && <div className="col-span-2"><span className="text-muted-foreground">Motorista:</span> {r.driver_name}{r.driver_phone ? ` · ${r.driver_phone}` : ""}</div>}
                        {(r.vehicle_plate || r.vehicle_model) && (
                          <div className="col-span-2"><span className="text-muted-foreground">Veículo:</span> {[r.vehicle_model, r.vehicle_plate].filter(Boolean).join(" · ")}</div>
                        )}
                      </div>

                      <div className="border-t border-border pt-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-medium">Paragens ({routeStops.length})</span>
                          {isAdmin && (
                            <Button size="sm" variant="ghost" onClick={() => { setStopRouteId(r.id); setEditStop(null); setStopOpen(true); }}>
                              <Plus className="mr-1 h-3 w-3" /> Paragem
                            </Button>
                          )}
                        </div>
                        {routeStops.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Sem paragens.</p>
                        ) : (
                          <ul className="space-y-1">
                            {routeStops.map((s) => (
                              <li key={s.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1 text-sm">
                                <span className="flex items-center gap-2">
                                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span>{s.name}</span>
                                  {s.pickup_time && <span className="text-xs text-muted-foreground">· {s.pickup_time.slice(0, 5)}</span>}
                                </span>
                                {isAdmin && (
                                  <span className="flex gap-1">
                                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setStopRouteId(r.id); setEditStop(s); setStopOpen(true); }}>
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setDeleteStopId(s.id)}>
                                      <Trash2 className="h-3 w-3 text-destructive" />
                                    </Button>
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* INSCRIÇÕES */}
          <TabsContent value="inscricoes" className="mt-4">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Alunos inscritos no transporte</h2>
              {isAdmin && !native && (
                <Button onClick={() => { setEditEnroll(null); setEnrollOpen(true); }} disabled={routes.length === 0}>
                  <Plus className="mr-2 h-4 w-4" /> Inscrever aluno
                </Button>
              )}
            </div>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Aluno</TableHead>
                    <TableHead>Rota</TableHead>
                    <TableHead>Direção</TableHead>
                    <TableHead>Paragem ida</TableHead>
                    <TableHead>Paragem regresso</TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead>Estado</TableHead>
                    {isAdmin && <TableHead className="text-right">Ações</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enrollments.length === 0 ? (
                    <TableRow><TableCell colSpan={isAdmin ? 8 : 7} className="text-center text-muted-foreground py-8">Sem inscrições.</TableCell></TableRow>
                  ) : (
                    enrollments.map((e) => {
                      const route = routes.find((r) => r.id === e.route_id);
                      return (
                        <TableRow key={e.id}>
                          <TableCell className="font-medium">{e.student?.full_name ?? "—"}</TableCell>
                          <TableCell>{route?.name ?? "—"}</TableCell>
                          <TableCell>{directionLabel(e.direction)}</TableCell>
                          <TableCell>{e.pickup_stop?.name ?? "—"}</TableCell>
                          <TableCell>{e.dropoff_stop?.name ?? "—"}</TableCell>
                          <TableCell>{e.start_date}</TableCell>
                          <TableCell>
                            <Badge variant={e.status === "ACTIVE" ? "default" : "secondary"}>
                              {e.status === "ACTIVE" ? "Ativa" : e.status === "INACTIVE" ? "Inativa" : "Cancelada"}
                            </Badge>
                          </TableCell>
                          {isAdmin && (
                            <TableCell className="text-right">
                              <Button size="sm" variant="ghost" onClick={() => handleRegenerateFees(e.id)} title="Gerar mensalidades">
                                <Wallet className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setEditEnroll(e); setEnrollOpen(true); }}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setDeleteEnrollId(e.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* LISTA DE PASSAGEIROS */}
          <TabsContent value="lista" className="mt-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">Rota:</Label>
                <Select value={listRouteId} onValueChange={setListRouteId}>
                  <SelectTrigger className="w-72"><SelectValue placeholder="Escolher rota" /></SelectTrigger>
                  <SelectContent>
                    {routes.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={handlePrintList}>
                <Printer className="mr-2 h-4 w-4" /> Imprimir lista
              </Button>
            </div>

            {selectedListRoute ? (
              <Card className="p-6 print:shadow-none print:border-none">
                <div className="mb-4 border-b border-border pb-3">
                  <h2 className="text-2xl font-bold">{selectedListRoute.name}</h2>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>Período: {shiftLabel(selectedListRoute.shift)}</span>
                    {selectedListRoute.driver_name && <span>Motorista: {selectedListRoute.driver_name}</span>}
                    {selectedListRoute.driver_phone && <span>Tel: {selectedListRoute.driver_phone}</span>}
                    {selectedListRoute.vehicle_plate && <span>Matrícula: {selectedListRoute.vehicle_plate}</span>}
                  </div>
                </div>

                {(stopsByRoute.get(listRouteId) ?? []).length === 0 && passengerList.size === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Sem passageiros nesta rota.</p>
                ) : (
                  <div className="space-y-5">
                    {(stopsByRoute.get(listRouteId) ?? []).map((stop) => {
                      const pax = passengerList.get(stop.id) ?? [];
                      return (
                        <div key={stop.id}>
                          <div className="flex items-center gap-2 border-b border-border/60 pb-1 mb-2">
                            <MapPin className="h-4 w-4 text-primary" />
                            <span className="font-semibold">{stop.position}. {stop.name}</span>
                            {stop.pickup_time && <Badge variant="outline">Ida {stop.pickup_time.slice(0, 5)}</Badge>}
                            {stop.dropoff_time && <Badge variant="outline">Regresso {stop.dropoff_time.slice(0, 5)}</Badge>}
                            {stop.address && <span className="text-xs text-muted-foreground">— {stop.address}</span>}
                          </div>
                          {pax.length === 0 ? (
                            <p className="text-sm text-muted-foreground pl-6">Sem passageiros nesta paragem.</p>
                          ) : (
                            <ol className="ml-6 list-decimal space-y-0.5 text-sm">
                              {pax.map((e) => (
                                <li key={e.id}>
                                  {e.student?.full_name ?? "—"}{" "}
                                  <span className="text-xs text-muted-foreground">({directionLabel(e.direction)})</span>
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      );
                    })}

                    {(passengerList.get("__no_stop__")?.length ?? 0) > 0 && (
                      <div>
                        <div className="flex items-center gap-2 border-b border-border/60 pb-1 mb-2">
                          <span className="font-semibold text-muted-foreground">Sem paragem atribuída</span>
                        </div>
                        <ol className="ml-6 list-decimal space-y-0.5 text-sm">
                          {(passengerList.get("__no_stop__") ?? []).map((e) => (
                            <li key={e.id}>{e.student?.full_name ?? "—"}</li>
                          ))}
                        </ol>
                      </div>
                    )}

                    <div className="border-t border-border pt-3 text-sm text-muted-foreground">
                      Total de passageiros ativos:{" "}
                      <strong className="text-foreground">
                        {(enrollmentsByRoute.get(listRouteId) ?? []).filter((e) => e.status === "ACTIVE").length}
                      </strong>{" "}
                      / {selectedListRoute.capacity}
                    </div>
                  </div>
                )}
              </Card>
            ) : (
              <Card className="p-10 text-center text-muted-foreground">Escolha uma rota.</Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {native && isAdmin && transportTab !== "lista" && (
        <NativeMobileFabPortal>
          <Button
            type="button"
            size="icon"
            className={NATIVE_MOBILE_FAB_BUTTON_CLASSNAME}
            aria-label={transportTab === "inscricoes" ? "Inscrever aluno" : "Nova rota"}
            onClick={() => {
              if (transportTab === "inscricoes") {
                if (routes.length === 0) {
                  toast.error("Crie primeiro pelo menos uma rota.");
                  return;
                }
                setEditEnroll(null);
                setEnrollOpen(true);
              } else {
                setEditRoute(null);
                setRouteOpen(true);
              }
            }}
          >
            <Plus className="h-6 w-6" />
          </Button>
        </NativeMobileFabPortal>
      )}

      {/* Dialogs */}
      {schoolId && (
        <RouteFormDialog
          open={routeOpen}
          onOpenChange={setRouteOpen}
          schoolId={schoolId}
          initial={editRoute}
          onSaved={loadAll}
        />
      )}
      {schoolId && stopRouteId && (
        <StopFormDialog
          open={stopOpen}
          onOpenChange={setStopOpen}
          schoolId={schoolId}
          routeId={stopRouteId}
          initial={editStop}
          onSaved={loadAll}
        />
      )}
      {schoolId && (
        <TransportEnrollmentDialog
          open={enrollOpen}
          onOpenChange={setEnrollOpen}
          schoolId={schoolId}
          routes={routes.map((r) => ({ id: r.id, name: r.name, monthly_fee: r.monthly_fee }))}
          initial={editEnroll}
          onSaved={loadAll}
        />
      )}

      <AlertDialog open={!!deleteRouteId} onOpenChange={(o) => !o && setDeleteRouteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover rota?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação remove também as paragens, inscrições e mensalidades associadas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRoute}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteStopId} onOpenChange={(o) => !o && setDeleteStopId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover paragem?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteStop}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteEnrollId} onOpenChange={(o) => !o && setDeleteEnrollId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover inscrição?</AlertDialogTitle>
            <AlertDialogDescription>As mensalidades não pagas associadas serão também removidas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEnroll}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default Transportes;