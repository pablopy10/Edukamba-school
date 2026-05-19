import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
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
import { Bus, Plus, Pencil, Trash2, MapPin, Users, ListChecks, Printer, Search, Wallet, FileSignature } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { NativeMobileFabPortal } from "@/components/dashboard/NativeMobileFabPortal";
import { isNativeMobileApp, NATIVE_MOBILE_FAB_BUTTON_CLASSNAME } from "@/lib/nativeApp";
import { RouteFormDialog, type RouteRow } from "@/components/transportes/RouteFormDialog";
import { StopFormDialog, type StopRow } from "@/components/transportes/StopFormDialog";
import { TransportEnrollmentDialog, type TransportEnrollment } from "@/components/transportes/TransportEnrollmentDialog";
import { cn } from "@/lib/utils";
import { effectiveSchoolIdFromProfile } from "@/lib/effectiveTenant";
import { isSchoolManagementRole } from "@/lib/schoolStaffRoles";
import { useParentChildren } from "@/hooks/useParentChildren";
import { PagamentosFinanceHub } from "@/pages/Pagamentos";
import { DomainChargeRulesPanel } from "@/components/finance/DomainChargeRulesPanel";
import { useHomeroomStudentIds } from "@/hooks/useHomeroomStudentIds";
import { ModuleAuthorizationsPanel } from "@/components/authorizations/ModuleAuthorizationsPanel";

type Enrollment = TransportEnrollment & {
  student?: { full_name: string; classroom_id: string | null };
  pickup_stop?: { name: string } | null;
  dropoff_stop?: { name: string } | null;
};

const Transportes = () => {
  const { t } = useTranslation("pages", { keyPrefix: "transportes" });
  const [searchParams] = useSearchParams();
  const native = isNativeMobileApp();
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
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
  const [transportTab, setTransportTab] = useState<
    "regras" | "rotas" | "inscricoes" | "lista" | "pagamentos" | "autorizacoes"
  >("rotas");

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("school_id, support_context_school_id, role")
        .eq("id", user.id)
        .maybeSingle();
      const sid = effectiveSchoolIdFromProfile(profile);
      if (sid) {
        setSchoolId(sid);
        setRole(profile?.role ?? null);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (searchParams.get("tab") === "autorizacoes") {
      setTransportTab("autorizacoes");
    }
  }, [searchParams]);

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
  const isParent = role === "PARENT";
  const canEnroll = isAdmin || isParent;
  const { childIds } = useParentChildren();
  const { ids: homeroomStudentIds } = useHomeroomStudentIds(schoolId, role, userId);

  const filteredRoutes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return routes;
    return routes.filter((r) =>
      [r.name, r.driver_name, r.vehicle_plate, r.description].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [routes, search]);

  const visibleEnrollments = useMemo(() => {
    let list = enrollments;
    if (isParent) list = list.filter((e) => childIds.includes(e.student_id));
    if (role === "TEACHER") {
      if (homeroomStudentIds.length === 0) return [];
      list = list.filter((e) => homeroomStudentIds.includes(e.student_id));
    }
    return list;
  }, [enrollments, isParent, childIds, role, homeroomStudentIds]);

  const enrollmentsByRoute = useMemo(() => {
    const source = isAdmin ? enrollments : visibleEnrollments;
    const map = new Map<string, Enrollment[]>();
    source.forEach((e) => {
      const arr = map.get(e.route_id) ?? [];
      arr.push(e);
      map.set(e.route_id, arr);
    });
    return map;
  }, [isAdmin, enrollments, visibleEnrollments]);

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
    else toast.success(t("toast_route_removed"));
    setDeleteRouteId(null);
    loadAll();
  };

  const handleDeleteStop = async () => {
    if (!deleteStopId) return;
    const { error } = await supabase.from("transport_stops").delete().eq("id", deleteStopId);
    if (error) toast.error(error.message);
    else toast.success(t("toast_stop_removed"));
    setDeleteStopId(null);
    loadAll();
  };

  const handleDeleteEnroll = async () => {
    if (!deleteEnrollId) return;
    const { error } = await supabase.from("transport_enrollments").delete().eq("id", deleteEnrollId);
    if (error) toast.error(error.message);
    else toast.success(t("toast_enrollment_removed"));
    setDeleteEnrollId(null);
    loadAll();
  };

  const handleRegenerateFees = async (enrollmentId: string) => {
    const { error, data } = await supabase.rpc("generate_transport_fees", { _enrollment_id: enrollmentId });
    if (error) toast.error(error.message);
    else toast.success(t("toast_fees_generated", { data }));
  };

  const handlePrintList = () => window.print();

  const selectedListRoute = routes.find((r) => r.id === listRouteId);

  return (
    <>
      <div
        className={cn(
          "flex flex-col gap-6",
          native &&
            isAdmin &&
            transportTab !== "lista" &&
            transportTab !== "pagamentos" &&
            transportTab !== "regras" &&
            transportTab !== "autorizacoes" &&
            "relative pb-28",
        )}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-foreground">
              <Bus className="h-8 w-8 text-primary" />
              {t("title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
          {isAdmin && !native && (
            <Button onClick={() => { setEditRoute(null); setRouteOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> {t("new_route")}
            </Button>
          )}
        </div>

        <Tabs
          value={transportTab}
          onValueChange={(v) => setTransportTab(v as typeof transportTab)}
          className="w-full"
        >
          <TabsList className="flex h-auto w-full flex-wrap gap-1">
            {!isParent && <TabsTrigger value="regras">{t("tab_rules")}</TabsTrigger>}
            <TabsTrigger value="rotas"><Bus className="mr-2 h-4 w-4" />{t("tab_routes")}</TabsTrigger>
            <TabsTrigger value="inscricoes"><Users className="mr-2 h-4 w-4" />{t("tab_enrollments")}</TabsTrigger>
            {!isParent && <TabsTrigger value="lista"><ListChecks className="mr-2 h-4 w-4" />{t("tab_passenger_list")}</TabsTrigger>}
            <TabsTrigger value="pagamentos">{t("tab_payments")}</TabsTrigger>
            <TabsTrigger value="autorizacoes">
              <FileSignature className="mr-2 h-4 w-4" />
              {t("tab_authorizations")}
            </TabsTrigger>
          </TabsList>

          {!isParent && (
          <TabsContent value="regras" className="mt-4">
            <DomainChargeRulesPanel variant="transport" schoolId={schoolId} role={role} />
          </TabsContent>
          )}

          {/* ROTAS */}
          <TabsContent value="rotas" className="mt-4">
            <div className="mb-4 flex items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder={t("search_routes")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {loading ? (
              <p className="text-muted-foreground">{t("loading")}</p>
            ) : filteredRoutes.length === 0 ? (
              <Card className="p-10 text-center text-muted-foreground">
                {t("no_routes")} {isAdmin && t("no_routes_admin_hint")}
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
                            {!r.is_active && <Badge variant="secondary">{t("badge_inactive")}</Badge>}
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
                        <div><span className="text-muted-foreground">{t("label_shift")}</span> {t(`shifts.${r.shift}`)}</div>
                        <div><span className="text-muted-foreground">{t("label_capacity")}</span> {r.capacity}</div>
                        <div><span className="text-muted-foreground">{t("label_monthly_fee")}</span> {r.monthly_fee} AOA</div>
                        <div><span className="text-muted-foreground">{t("label_enrolled")}</span> {enrolled}/{r.capacity}</div>
                        {r.driver_name && <div className="col-span-2"><span className="text-muted-foreground">{t("label_driver")}</span> {r.driver_name}{r.driver_phone ? ` · ${r.driver_phone}` : ""}</div>}
                        {(r.vehicle_plate || r.vehicle_model) && (
                          <div className="col-span-2"><span className="text-muted-foreground">{t("label_vehicle")}</span> {[r.vehicle_model, r.vehicle_plate].filter(Boolean).join(" · ")}</div>
                        )}
                      </div>

                      <div className="border-t border-border pt-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-medium">{t("stops_title", { count: routeStops.length })}</span>
                          {isAdmin && (
                            <Button size="sm" variant="ghost" onClick={() => { setStopRouteId(r.id); setEditStop(null); setStopOpen(true); }}>
                              <Plus className="mr-1 h-3 w-3" /> {t("add_stop")}
                            </Button>
                          )}
                        </div>
                        {routeStops.length === 0 ? (
                          <p className="text-xs text-muted-foreground">{t("no_stops")}</p>
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
            {role === "TEACHER" && homeroomStudentIds.length === 0 && (
              <p className="mb-3 text-sm text-muted-foreground rounded-lg border border-border bg-muted/30 px-3 py-2">
                {t("teacher_homeroom_hint")}
              </p>
            )}
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{t("enrollments_title")}</h2>
              {canEnroll && !native && (
                <Button onClick={() => { setEditEnroll(null); setEnrollOpen(true); }} disabled={routes.length === 0}>
                  <Plus className="mr-2 h-4 w-4" /> {t("enroll_student")}
                </Button>
              )}
            </div>
            {native ? (
              <div className="grid gap-4 md:grid-cols-2">
                {visibleEnrollments.length === 0 ? (
                  <Card className="p-8 text-center text-muted-foreground">{t("no_enrollments")}</Card>
                ) : (
                  visibleEnrollments.map((e) => {
                    const route = routes.find((r) => r.id === e.route_id);
                    return (
                      <Card key={e.id} className="flex flex-col gap-3 p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-lg font-semibold">{e.student?.full_name ?? t("em_dash")}</h3>
                            <p className="text-sm text-muted-foreground">{route?.name ?? t("em_dash")}</p>
                          </div>
                          <Badge variant={e.status === "ACTIVE" ? "default" : "secondary"}>
                            {t(`enrollment_status.${e.status}`)}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div><span className="text-muted-foreground">{t("label_direction")}</span> {t(`directions.${e.direction}`)}</div>
                          <div><span className="text-muted-foreground">{t("label_start")}</span> {e.start_date}</div>
                          <div className="col-span-2"><span className="text-muted-foreground">{t("label_pickup")}</span> {e.pickup_stop?.name ?? t("em_dash")}</div>
                          <div className="col-span-2"><span className="text-muted-foreground">{t("label_dropoff")}</span> {e.dropoff_stop?.name ?? t("em_dash")}</div>
                        </div>
                        {isAdmin && (
                          <div className="mt-1 flex justify-end gap-2 border-t border-border pt-3">
                            <Button size="sm" variant="outline" onClick={() => handleRegenerateFees(e.id)} title={t("generate_fees_title")}>
                              <Wallet className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setEditEnroll(e); setEnrollOpen(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDeleteEnrollId(e.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </Card>
                    );
                  })
                )}
              </div>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("col_student")}</TableHead>
                      <TableHead>{t("col_route")}</TableHead>
                      <TableHead>{t("col_direction")}</TableHead>
                      <TableHead>{t("col_pickup_stop")}</TableHead>
                      <TableHead>{t("col_dropoff_stop")}</TableHead>
                      <TableHead>{t("col_start")}</TableHead>
                      <TableHead>{t("col_status")}</TableHead>
                      {isAdmin && <TableHead className="text-right">{t("col_actions")}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleEnrollments.length === 0 ? (
                      <TableRow><TableCell colSpan={isAdmin ? 8 : 7} className="text-center text-muted-foreground py-8">{t("no_enrollments")}</TableCell></TableRow>
                    ) : (
                      visibleEnrollments.map((e) => {
                        const route = routes.find((r) => r.id === e.route_id);
                        return (
                          <TableRow key={e.id}>
                            <TableCell className="font-medium">{e.student?.full_name ?? t("em_dash")}</TableCell>
                            <TableCell>{route?.name ?? t("em_dash")}</TableCell>
                            <TableCell>{t(`directions.${e.direction}`)}</TableCell>
                            <TableCell>{e.pickup_stop?.name ?? t("em_dash")}</TableCell>
                            <TableCell>{e.dropoff_stop?.name ?? t("em_dash")}</TableCell>
                            <TableCell>{e.start_date}</TableCell>
                            <TableCell>
                              <Badge variant={e.status === "ACTIVE" ? "default" : "secondary"}>
                                {t(`enrollment_status.${e.status}`)}
                              </Badge>
                            </TableCell>
                            {isAdmin && (
                              <TableCell className="text-right">
                                <Button size="sm" variant="ghost" onClick={() => handleRegenerateFees(e.id)} title={t("generate_fees_title")}>
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
            )}
          </TabsContent>

          <TabsContent value="pagamentos" className="mt-4">
            <PagamentosFinanceHub financePage="transportCharges" />
          </TabsContent>

          <TabsContent value="autorizacoes" className="mt-4">
            <ModuleAuthorizationsPanel
              module="transport"
              schoolId={schoolId}
              userId={userId}
              role={role}
              isParent={isParent}
              childIds={childIds}
              canManageTemplates={isAdmin}
            />
          </TabsContent>

          {/* LISTA DE PASSAGEIROS */}
          <TabsContent value="lista" className="mt-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">{t("route_label")}</Label>
                <Select value={listRouteId} onValueChange={setListRouteId}>
                  <SelectTrigger className="w-72"><SelectValue placeholder={t("choose_route")} /></SelectTrigger>
                  <SelectContent>
                    {routes.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={handlePrintList}>
                <Printer className="mr-2 h-4 w-4" /> {t("print_list")}
              </Button>
            </div>

            {selectedListRoute ? (
              <Card className="p-6 print:shadow-none print:border-none">
                <div className="mb-4 border-b border-border pb-3">
                  <h2 className="text-2xl font-bold">{selectedListRoute.name}</h2>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>{t("label_shift")} {t(`shifts.${selectedListRoute.shift}`)}</span>
                    {selectedListRoute.driver_name && <span>{t("label_driver")} {selectedListRoute.driver_name}</span>}
                    {selectedListRoute.driver_phone && <span>{t("route_form.driver_phone")}: {selectedListRoute.driver_phone}</span>}
                    {selectedListRoute.vehicle_plate && <span>{t("route_form.vehicle_plate")}: {selectedListRoute.vehicle_plate}</span>}
                  </div>
                </div>

                {(stopsByRoute.get(listRouteId) ?? []).length === 0 && passengerList.size === 0 ? (
                  <p className="text-center text-muted-foreground py-8">{t("no_passengers_route")}</p>
                ) : (
                  <div className="space-y-5">
                    {(stopsByRoute.get(listRouteId) ?? []).map((stop) => {
                      const pax = passengerList.get(stop.id) ?? [];
                      return (
                        <div key={stop.id}>
                          <div className="flex items-center gap-2 border-b border-border/60 pb-1 mb-2">
                            <MapPin className="h-4 w-4 text-primary" />
                            <span className="font-semibold">{stop.position}. {stop.name}</span>
                            {stop.pickup_time && <Badge variant="outline">{t("badge_pickup", { time: stop.pickup_time.slice(0, 5) })}</Badge>}
                            {stop.dropoff_time && <Badge variant="outline">{t("badge_dropoff", { time: stop.dropoff_time.slice(0, 5) })}</Badge>}
                            {stop.address && <span className="text-xs text-muted-foreground">{t("em_dash")} {stop.address}</span>}
                          </div>
                          {pax.length === 0 ? (
                            <p className="text-sm text-muted-foreground pl-6">{t("no_passengers_stop")}</p>
                          ) : (
                            <ol className="ml-6 list-decimal space-y-0.5 text-sm">
                              {pax.map((e) => (
                                <li key={e.id}>
                                  {e.student?.full_name ?? t("em_dash")}{" "}
                                  <span className="text-xs text-muted-foreground">({t(`directions.${e.direction}`)})</span>
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
                          <span className="font-semibold text-muted-foreground">{t("no_stop_assigned")}</span>
                        </div>
                        <ol className="ml-6 list-decimal space-y-0.5 text-sm">
                          {(passengerList.get("__no_stop__") ?? []).map((e) => (
                            <li key={e.id}>{e.student?.full_name ?? t("em_dash")}</li>
                          ))}
                        </ol>
                      </div>
                    )}

                    <div className="border-t border-border pt-3 text-sm text-muted-foreground">
                      {t("total_passengers")}{" "}
                      <strong className="text-foreground">
                        {(enrollmentsByRoute.get(listRouteId) ?? []).filter((e) => e.status === "ACTIVE").length}
                      </strong>{" "}
                      / {selectedListRoute.capacity}
                    </div>
                  </div>
                )}
              </Card>
            ) : (
              <Card className="p-10 text-center text-muted-foreground">{t("choose_route_hint")}</Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {native &&
        (isAdmin || (isParent && transportTab === "inscricoes")) &&
        transportTab !== "lista" &&
        transportTab !== "pagamentos" &&
        transportTab !== "regras" &&
        transportTab !== "autorizacoes" && (
        <NativeMobileFabPortal>
          <Button
            type="button"
            size="icon"
            className={NATIVE_MOBILE_FAB_BUTTON_CLASSNAME}
            aria-label={transportTab === "inscricoes" ? t("fab_enroll") : t("fab_new_route")}
            onClick={() => {
              if (transportTab === "inscricoes") {
                if (routes.length === 0) {
                  toast.error(t("toast_need_route_first"));
                  return;
                }
                setEditEnroll(null);
                setEnrollOpen(true);
              } else if (isAdmin) {
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
          isParent={isParent}
          childIds={childIds}
        />
      )}

      <AlertDialog open={!!deleteRouteId} onOpenChange={(o) => !o && setDeleteRouteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirm_delete_route_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirm_delete_route_desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRoute}>{t("remove")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteStopId} onOpenChange={(o) => !o && setDeleteStopId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirm_delete_stop_title")}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteStop}>{t("remove")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteEnrollId} onOpenChange={(o) => !o && setDeleteEnrollId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirm_delete_enrollment_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirm_delete_enrollment_desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEnroll}>{t("remove")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default Transportes;