import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { dateLocaleTag } from "@/lib/i18nDateLocale";
import {
  Plus, Search, Boxes, ClipboardList, Check, AlertTriangle, Pencil, Trash2, ListChecks,
  BookOpen, Beaker, Palette, Dumbbell, Laptop, Package, ShoppingBag, ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MaterialFormDialog, type MaterialRow } from "@/components/material/MaterialFormDialog";
import { MaterialRequestFormDialog, type RequestRow } from "@/components/material/MaterialRequestFormDialog";
import { MaterialShop } from "@/components/material/MaterialShop";
import { MaterialOrders, type MaterialOrder, type MaterialOrderItem } from "@/components/material/MaterialOrders";
import { MyOrders } from "@/components/material/MyOrders";
import { useParentChildren } from "@/hooks/useParentChildren";
import { useTeacherClassrooms } from "@/hooks/useTeacherClassrooms";
import { useStudentSelf } from "@/hooks/useStudentSelf";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { NativeMobileFabPortal } from "@/components/dashboard/NativeMobileFabPortal";
import { isNativeMobileApp, NATIVE_MOBILE_FAB_BUTTON_CLASSNAME, showPageKpiCards } from "@/lib/nativeApp";
import { isSchoolManagementOrTeacher, isSchoolManagementRole } from "@/lib/schoolStaffRoles";
import { effectiveSchoolIdFromProfile } from "@/lib/effectiveTenant";

type Category = "papelaria" | "laboratorio" | "artes" | "desporto" | "tecnologia";

const categoryMeta: Record<string, { color: string; icon: typeof BookOpen }> = {
  papelaria: { color: "bg-pastel-blue text-pastel-blue-foreground", icon: BookOpen },
  laboratorio: { color: "bg-pastel-green text-pastel-green-foreground", icon: Beaker },
  artes: { color: "bg-pastel-pink text-pastel-pink-foreground", icon: Palette },
  desporto: { color: "bg-pastel-yellow text-pastel-yellow-foreground", icon: Dumbbell },
  tecnologia: { color: "bg-pastel-lilac text-pastel-lilac-foreground", icon: Laptop },
};
const catFallbackMeta = { color: "bg-muted text-foreground", icon: Package };
const categoryVisual = (c: string) => categoryMeta[c] ?? catFallbackMeta;

type DeliveryRow = {
  id: string;
  request_id: string;
  student_id: string;
  brought: boolean;
};

type DeliveryFilter = "all" | "pendente" | "completo";

type Tab = "stock" | "pedidos" | "encomendas" | "loja" | "minhas_encomendas";

const Material = () => {
  const { t } = useTranslation("pages", { keyPrefix: "material" });
  const categoryLabel = (key: string) =>
    t(`categories.${key}`, { defaultValue: t("categories.other") });
  const native = isNativeMobileApp();
  const { user } = useAuth();
  const { selectedYearId } = useAcademicYear();
  const { isParent, childIds, classroomIds, selectedChild } = useParentChildren();
  const { isTeacher, classroomIds: teacherClassroomIds, loading: teacherLoading } = useTeacherClassrooms();
  const { isStudent, studentId, classroomId: studentClassroomId } = useStudentSelf();
  const [tab, setTab] = useState<Tab>("stock");
  const [loading, setLoading] = useState(true);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");

  const [stock, setStock] = useState<MaterialRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [classrooms, setClassrooms] = useState<{ id: string; name: string }[]>([]);
  const [students, setStudents] = useState<{ id: string; full_name: string; classroom_id: string | null }[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);

  // Orders state (school management view)
  const [orders, setOrders] = useState<MaterialOrder[]>([]);
  const [ordersError, setOrdersError] = useState(false);

  // My orders state (buyer view)
  const [myOrders, setMyOrders] = useState<MaterialOrder[]>([]);
  const [myOrdersError, setMyOrdersError] = useState(false);

  // Shop load error
  const [shopError, setShopError] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [stockCategoryFilter, setStockCategoryFilter] = useState<string>("all");
  const [stockLowOnly, setStockLowOnly] = useState(false);
  const [stockLocation, setStockLocation] = useState<string>("all");
  const [reqDeliveryFilter, setReqDeliveryFilter] = useState<DeliveryFilter>("all");
  const [reqTeacherFilter, setReqTeacherFilter] = useState<string>("all");

  // Dialog state
  const [showMaterialDialog, setShowMaterialDialog] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<MaterialRow | null>(null);
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [editingRequest, setEditingRequest] = useState<RequestRow | null>(null);
  const [deliveryDialog, setDeliveryDialog] = useState<RequestRow | null>(null);

  const isAdmin = isSchoolManagementRole(userRole);
  const canMarkDeliveries = isSchoolManagementOrTeacher(userRole) && !isStudent;
  const canRequest = isSchoolManagementOrTeacher(userRole) && !isStudent;
  const isBuyer = isParent || isStudent;

  // Force buyers to the shop tab
  useEffect(() => {
    if (isBuyer && tab !== "loja" && tab !== "minhas_encomendas") setTab("loja");
  }, [isBuyer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Teachers stay on pedidos
  useEffect(() => {
    if (isTeacher && tab !== "pedidos") setTab("pedidos");
  }, [isTeacher, tab]);


  const loadAll = async () => {
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, school_id, support_context_school_id, role, full_name")
      .eq("id", user.id)
      .maybeSingle();
    const sid = effectiveSchoolIdFromProfile(profile);
    if (!sid || !profile) {
      setLoading(false);
      return;
    }
    setSchoolId(sid);
    setProfileId(profile.id);
    setUserRole(profile.role);
    setUserName(profile.full_name ?? "");

    const isBuyerRole = profile.role === "PARENT" || profile.role === "STUDENT";

    if (isBuyerRole) {
      // Buyers only get fields needed for the shop — purchase_price and location are excluded
      const { data: mData, error: mErr } = await supabase
        .from("materials")
        .select("id, school_id, name, category, description, unit, for_sale, sale_price")
        .eq("school_id", sid)
        .eq("for_sale", true)
        .order("name");
      if (mErr) setShopError(true);
      else setStock((mData as MaterialRow[]) ?? []);
      setLoading(false);
      return;
    }

    let classroomsQuery = supabase.from("classrooms").select("id, name").eq("school_id", sid);
    if (selectedYearId) classroomsQuery = classroomsQuery.eq("academic_year_id", selectedYearId);
    classroomsQuery = classroomsQuery.order("name");

    const [m, r, c, s, d] = await Promise.all([
      supabase.from("materials").select("*").eq("school_id", sid).order("name"),
      supabase.from("material_requests").select("*").eq("school_id", sid).order("created_at", { ascending: false }),
      classroomsQuery,
      supabase.from("students").select("id, full_name, classroom_id").eq("school_id", sid).order("full_name"),
      supabase.from("material_request_deliveries").select("id, request_id, student_id, brought").eq("school_id", sid),
    ]);
    setStock((m.data as MaterialRow[]) ?? []);
    setRequests((r.data as RequestRow[]) ?? []);
    setClassrooms(c.data ?? []);
    setStudents(s.data ?? []);
    setDeliveries(((d.data ?? []) as DeliveryRow[]));
    setLoading(false);
  };

  const loadOrders = async () => {
    if (!schoolId) return;
    setOrdersError(false);
    // Fetch orders + items + buyer names
    const { data, error } = await supabase
      .from("material_orders")
      .select("*, material_order_items(*, materials(name))")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false });

    if (error) {
      setOrdersError(true);
      return;
    }

    // Fetch buyer names
    const profileIds = [...new Set((data ?? []).map((o: any) => o.buyer_profile_id))];
    let profileNames: Record<string, string> = {};
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", profileIds);
      (profiles ?? []).forEach((p: any) => { profileNames[p.id] = p.full_name ?? p.id; });
    }

    const mapped: MaterialOrder[] = (data ?? []).map((o: any) => ({
      ...o,
      buyer_name: profileNames[o.buyer_profile_id] ?? o.buyer_profile_id,
      items: (o.material_order_items ?? []).map((i: any) => ({
        ...i,
        material_name: i.materials?.name ?? i.material_id,
      })) as MaterialOrderItem[],
    }));
    setOrders(mapped);
  };

  const loadMyOrders = async () => {
    if (!profileId || !schoolId) return;
    setMyOrdersError(false);
    const { data, error } = await supabase
      .from("material_orders")
      .select("*, material_order_items(*, materials(name))")
      .eq("school_id", schoolId)
      .eq("buyer_profile_id", profileId)
      .order("created_at", { ascending: false });

    if (error) {
      setMyOrdersError(true);
      return;
    }
    const mapped: MaterialOrder[] = (data ?? []).map((o: any) => ({
      ...o,
      items: (o.material_order_items ?? []).map((i: any) => ({
        ...i,
        material_name: i.materials?.name ?? i.material_id,
      })) as MaterialOrderItem[],
    }));
    setMyOrders(mapped);
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [user?.id, selectedYearId]);

  // Load orders when switching to orders tab (admin)
  useEffect(() => {
    if (tab === "encomendas" && schoolId) loadOrders();
  }, [tab, schoolId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load my orders when switching to my orders tab (buyer)
  useEffect(() => {
    if (tab === "minhas_encomendas" && profileId && schoolId) loadMyOrders();
  }, [tab, profileId, schoolId]); // eslint-disable-line react-hooks/exhaustive-deps


  const visibleClassrooms = useMemo(() => {
    if (!isTeacher) return classrooms;
    return classrooms.filter((c) => teacherClassroomIds.includes(c.id));
  }, [classrooms, isTeacher, teacherClassroomIds]);
  const visibleStudents = useMemo(() => {
    if (!isTeacher) return students;
    return students.filter((s) => s.classroom_id && teacherClassroomIds.includes(s.classroom_id));
  }, [students, isTeacher, teacherClassroomIds]);

  useEffect(() => {
    const map = new Map<string, string>();
    requests.forEach((r) => {
      if (r.requester_id && r.teacher_name) map.set(r.requester_id, r.teacher_name);
    });
    setTeachers(Array.from(map.entries()).map(([id, name]) => ({ id, name })));
  }, [requests]);

  const locations = useMemo(() => {
    const set = new Set<string>();
    stock.forEach((s) => { if (s.location) set.add(s.location); });
    return Array.from(set).sort();
  }, [stock]);

  const parentScopedRequests = useMemo(() => {
    if (!isParent) return requests;
    const childSet = new Set(childIds);
    const classSet = new Set(classroomIds);
    return requests.filter((r) => {
      const targetsChild = r.student_id ? childSet.has(r.student_id) : false;
      const targetsClass = !r.student_id && r.classroom_id ? classSet.has(r.classroom_id) : false;
      return targetsChild || targetsClass;
    });
  }, [requests, isParent, childIds, classroomIds]);

  const stats = useMemo(() => {
    let reqList = requests;
    if (isParent) reqList = parentScopedRequests;
    else if (isTeacher) reqList = requests.filter((r) => r.requester_id === user?.id);
    else if (isStudent) {
      reqList = requests.filter((r) => {
        const targetsSelf = r.student_id ? r.student_id === studentId : false;
        const targetsClass = !r.student_id && r.classroom_id ? r.classroom_id === studentClassroomId : false;
        return targetsSelf || targetsClass;
      });
    }
    const reqIds = new Set(reqList.map((r) => r.id));
    const childSet = new Set(childIds);
    const relevantDeliveries = isParent
      ? deliveries.filter((d) => reqIds.has(d.request_id) && childSet.has(d.student_id))
      : isTeacher
        ? deliveries.filter((d) => reqIds.has(d.request_id))
        : isStudent
          ? deliveries.filter((d) => reqIds.has(d.request_id) && d.student_id === studentId)
        : deliveries;
    return {
      totalItens: stock.reduce((a, s) => a + (s.quantity || 0), 0),
      baixoStock: stock.filter((s) => s.quantity < s.min_quantity).length,
      pedidosAtivos: reqList.length,
      entregasMarcadas: relevantDeliveries.filter((d) => d.brought).length,
    };
  }, [stock, requests, deliveries, isParent, parentScopedRequests, childIds, isTeacher, user?.id, isStudent, studentId, studentClassroomId]);

  const targetStudentsFor = (r: RequestRow) => {
    if (r.student_id) return students.filter((s) => s.id === r.student_id);
    if (r.classroom_id) return students.filter((s) => s.classroom_id === r.classroom_id);
    return [] as typeof students;
  };
  const progressFor = (r: RequestRow) => {
    const target = targetStudentsFor(r);
    const total = target.length;
    const broughtIds = new Set(
      deliveries.filter((d) => d.request_id === r.id && d.brought).map((d) => d.student_id),
    );
    const brought = target.filter((s) => broughtIds.has(s.id)).length;
    return { brought, total };
  };

  const filteredStock = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stock.filter((s) => {
      if (stockCategoryFilter !== "all" && s.category !== stockCategoryFilter) return false;
      if (stockLowOnly && !(s.quantity < s.min_quantity)) return false;
      if (stockLocation !== "all" && s.location !== stockLocation) return false;
      if (q && !(s.name.toLowerCase().includes(q) || (s.sku ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [stock, search, stockCategoryFilter, stockLowOnly, stockLocation]);

  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (isParent) {
        const childSet = new Set(childIds);
        const classSet = new Set(classroomIds);
        const targetsChild = r.student_id ? childSet.has(r.student_id) : false;
        const targetsClass = !r.student_id && r.classroom_id ? classSet.has(r.classroom_id) : false;
        if (!targetsChild && !targetsClass) return false;
      }
      if (isTeacher && r.requester_id !== user?.id) return false;
      if (isStudent) {
        const targetsSelf = r.student_id ? r.student_id === studentId : false;
        const targetsClass = !r.student_id && r.classroom_id ? r.classroom_id === studentClassroomId : false;
        if (!targetsSelf && !targetsClass) return false;
      }
      if (reqDeliveryFilter !== "all") {
        const { brought, total } = progressFor(r);
        const isComplete = total > 0 && brought === total;
        if (reqDeliveryFilter === "completo" && !isComplete) return false;
        if (reqDeliveryFilter === "pendente" && isComplete) return false;
      }
      if (reqTeacherFilter !== "all" && r.requester_id !== reqTeacherFilter) return false;
      if (q) {
        const studentName = students.find((s) => s.id === r.student_id)?.full_name ?? "";
        const className = classrooms.find((c) => c.id === r.classroom_id)?.name ?? "";
        const blob = `${r.item_name} ${r.teacher_name ?? ""} ${r.recipient ?? ""} ${studentName} ${className} ${r.description ?? ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [requests, search, reqDeliveryFilter, reqTeacherFilter, students, classrooms, deliveries, isParent, childIds, classroomIds, isTeacher, user?.id, isStudent, studentId, studentClassroomId]);

  const removeMaterial = async (id: string) => {
    if (!confirm(t("confirm_remove_material"))) return;
    const { error } = await supabase.from("materials").delete().eq("id", id);
    if (error) return toast({ title: t("toast_error"), description: error.message, variant: "destructive" });
    toast({ title: t("toast_material_removed") });
    loadAll();
  };

  const removeRequest = async (id: string) => {
    if (!confirm(t("confirm_remove_request"))) return;
    const { error } = await supabase.from("material_requests").delete().eq("id", id);
    if (error) return toast({ title: t("toast_error"), description: error.message, variant: "destructive" });
    toast({ title: t("toast_request_removed") });
    loadAll();
  };

  const childSuffix = selectedChild
    ? t("child_suffix", { name: selectedChild.full_name })
    : "";
  const subtitle = isParent
    ? t("subtitle_parent", { childSuffix })
    : t("subtitle_admin");

  const showCreateFab =
    native &&
    ((tab === "stock" && isAdmin) || (tab === "pedidos" && canRequest));


  return (
    <>
      <div className={cn("flex flex-col gap-6", showCreateFab && "relative pb-28")}>
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Tabs for buyers (PARENT / STUDENT) */}
            {isBuyer && (
              <div className="inline-flex h-11 items-center rounded-full border border-border bg-card p-1 shadow-soft">
                <button onClick={() => setTab("loja")} className={cn("flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors", tab === "loja" ? "bg-pastel-blue text-pastel-blue-foreground" : "text-muted-foreground hover:text-foreground")}>
                  <ShoppingBag className="h-4 w-4" strokeWidth={1.75} /> {t("tab_shop")}
                </button>
                <button onClick={() => setTab("minhas_encomendas")} className={cn("flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors", tab === "minhas_encomendas" ? "bg-pastel-blue text-pastel-blue-foreground" : "text-muted-foreground hover:text-foreground")}>
                  <ShoppingCart className="h-4 w-4" strokeWidth={1.75} /> {t("my_orders_title")}
                </button>
              </div>
            )}

            {/* Tabs for management */}
            {!isBuyer && !isTeacher && (
              <div className="inline-flex h-11 items-center rounded-full border border-border bg-card p-1 shadow-soft">
                <button onClick={() => setTab("stock")} className={cn("flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors", tab === "stock" ? "bg-pastel-blue text-pastel-blue-foreground" : "text-muted-foreground hover:text-foreground")}>
                  <Boxes className="h-4 w-4" strokeWidth={1.75} /> {t("tab_stock")}
                </button>
                <button onClick={() => setTab("pedidos")} className={cn("flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors", tab === "pedidos" ? "bg-pastel-blue text-pastel-blue-foreground" : "text-muted-foreground hover:text-foreground")}>
                  <ClipboardList className="h-4 w-4" strokeWidth={1.75} /> {t("tab_requests")}
                </button>
                {isAdmin && (
                  <button onClick={() => setTab("encomendas")} className={cn("flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors", tab === "encomendas" ? "bg-pastel-blue text-pastel-blue-foreground" : "text-muted-foreground hover:text-foreground")}>
                    <ShoppingCart className="h-4 w-4" strokeWidth={1.75} /> {t("tab_orders")}
                  </button>
                )}
              </div>
            )}

            {tab === "stock" && isAdmin && !native && (
              <button onClick={() => { setEditingMaterial(null); setShowMaterialDialog(true); }} className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90">
                <Plus className="h-4 w-4" strokeWidth={2.25} /> {t("new_material")}
              </button>
            )}
            {tab === "pedidos" && canRequest && !native && (
              <button onClick={() => { setEditingRequest(null); setShowRequestDialog(true); }} className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90">
                <Plus className="h-4 w-4" strokeWidth={2.25} /> {t("new_request")}
              </button>
            )}
          </div>
        </div>

        {/* Stats — only for management */}
        {showPageKpiCards() && !isBuyer && (
          <div className={cn("grid gap-4", isTeacher ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 lg:grid-cols-4")}>
            {(isTeacher
              ? [
                  { label: t("kpi_active_requests"), value: stats.pedidosAtivos, color: "bg-pastel-yellow text-pastel-yellow-foreground" },
                  { label: t("kpi_delivered"), value: stats.entregasMarcadas, color: "bg-pastel-green text-pastel-green-foreground" },
                ]
              : [
                  { label: t("kpi_stock_items"), value: stats.totalItens, color: "bg-pastel-blue text-pastel-blue-foreground" },
                  { label: t("kpi_low_stock"), value: stats.baixoStock, color: "bg-pastel-pink text-pastel-pink-foreground" },
                  { label: t("kpi_active_requests"), value: stats.pedidosAtivos, color: "bg-pastel-yellow text-pastel-yellow-foreground" },
                  { label: t("kpi_delivered"), value: stats.entregasMarcadas, color: "bg-pastel-green text-pastel-green-foreground" },
                ]
            ).map((s) => (
              <div key={s.label} className="rounded-2xl bg-card p-5 shadow-card">
                <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-medium", s.color)}>{s.label}</span>
                <p className="mt-3 text-3xl font-bold text-foreground">{s.value}</p>
              </div>
            ))}
          </div>
        )}


        {/* Filters for stock/pedidos tabs */}
        {(tab === "stock" || tab === "pedidos") && !isBuyer && (
          <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card">
            <div className={cn("flex flex-col gap-3", !native && "sm:flex-row sm:items-center")}>
              <div className="relative w-full sm:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={tab === "stock" ? t("search_stock") : t("search_requests")}
                  className="h-10 w-full rounded-full border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-pastel-blue/40"
                />
              </div>
              {tab === "stock" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={stockCategoryFilter} onValueChange={setStockCategoryFilter}>
                    <SelectTrigger className="h-10 w-44 rounded-full"><SelectValue placeholder={t("filter_category")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("all_categories")}</SelectItem>
                      {Object.keys(categoryMeta).map((c) => <SelectItem key={c} value={c}>{categoryLabel(c)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={stockLocation} onValueChange={setStockLocation}>
                    <SelectTrigger className="h-10 w-48 rounded-full"><SelectValue placeholder={t("filter_location")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("all_locations")}</SelectItem>
                      {locations.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <button
                    onClick={() => setStockLowOnly((v) => !v)}
                    className={cn("inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors", stockLowOnly ? "border-transparent bg-pastel-pink text-pastel-pink-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground")}
                  >
                    <AlertTriangle className="h-4 w-4" strokeWidth={1.75} /> {t("low_stock_toggle")}
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={reqDeliveryFilter} onValueChange={(v) => setReqDeliveryFilter(v as DeliveryFilter)}>
                    <SelectTrigger className="h-10 w-44 rounded-full"><SelectValue placeholder={t("filter_deliveries")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("all_deliveries")}</SelectItem>
                      <SelectItem value="pendente">{t("delivery_pending")}</SelectItem>
                      <SelectItem value="completo">{t("delivery_complete")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={reqTeacherFilter} onValueChange={setReqTeacherFilter}>
                    <SelectTrigger className="h-10 w-56 rounded-full"><SelectValue placeholder={t("filter_teacher")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("all_teachers")}</SelectItem>
                      {teachers.map((teacher) => <SelectItem key={teacher.id} value={teacher.id}>{teacher.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl bg-card p-10 text-center text-muted-foreground shadow-card">{t("loading")}</div>
        ) : tab === "loja" && isBuyer ? (
          <MaterialShop
            items={stock}
            schoolId={schoolId}
            buyerProfileId={profileId}
            buyerRole={isParent ? "PARENT" : "STUDENT"}
            native={native}
            loadError={shopError}
            onRetry={() => { setShopError(false); loadAll(); }}
            onOrderPlaced={loadAll}
          />
        ) : tab === "minhas_encomendas" && isBuyer ? (
          <MyOrders
            orders={myOrders}
            loadError={myOrdersError}
            onRetry={() => { setMyOrdersError(false); loadMyOrders(); }}
          />
        ) : tab === "encomendas" && isAdmin ? (
          <MaterialOrders
            orders={orders}
            loadError={ordersError}
            onRetry={() => { setOrdersError(false); loadOrders(); }}
            onOrderUpdated={loadOrders}
          />
        ) : tab === "stock" ? (
          <StockTable
            native={native}
            items={filteredStock}
            isAdmin={isAdmin}
            hideActionsColumn={isParent}
            onEdit={(m) => { setEditingMaterial(m); setShowMaterialDialog(true); }}
            onRemove={removeMaterial}
          />
        ) : (
          <RequestsTable
            native={native}
            requests={filteredRequests}
            classrooms={classrooms}
            students={students}
            isAdmin={isAdmin}
            hideActionsColumn={isParent}
            currentUserId={user?.id ?? null}
            canMarkDeliveries={canMarkDeliveries}
            progressFor={progressFor}
            onEdit={(r) => { setEditingRequest(r); setShowRequestDialog(true); }}
            onRemove={removeRequest}
            onMarkDeliveries={(r) => setDeliveryDialog(r)}
          />
        )}
      </div>

      {native && tab === "stock" && isAdmin && (
        <NativeMobileFabPortal>
          <Button type="button" size="icon" className={NATIVE_MOBILE_FAB_BUTTON_CLASSNAME} aria-label={t("fab_new_material")} onClick={() => { setEditingMaterial(null); setShowMaterialDialog(true); }}>
            <Plus className="h-6 w-6" />
          </Button>
        </NativeMobileFabPortal>
      )}
      {native && tab === "pedidos" && canRequest && (
        <NativeMobileFabPortal>
          <Button type="button" size="icon" className={NATIVE_MOBILE_FAB_BUTTON_CLASSNAME} aria-label={t("fab_new_request")} onClick={() => { setEditingRequest(null); setShowRequestDialog(true); }}>
            <Plus className="h-6 w-6" />
          </Button>
        </NativeMobileFabPortal>
      )}

      <MaterialFormDialog
        open={showMaterialDialog}
        onOpenChange={setShowMaterialDialog}
        schoolId={schoolId}
        material={editingMaterial}
        onSaved={loadAll}
      />
      <MaterialRequestFormDialog
        open={showRequestDialog}
        onOpenChange={setShowRequestDialog}
        schoolId={schoolId}
        userId={user?.id ?? null}
        userName={userName}
        request={editingRequest}
        classrooms={visibleClassrooms}
        students={visibleStudents}
        onSaved={loadAll}
      />
      <DeliveryDialog
        request={deliveryDialog}
        targetStudents={deliveryDialog ? targetStudentsFor(deliveryDialog) : []}
        deliveries={deliveries.filter((d) => deliveryDialog && d.request_id === deliveryDialog.id)}
        schoolId={schoolId}
        userId={user?.id ?? null}
        onClose={() => setDeliveryDialog(null)}
        onSaved={loadAll}
      />
    </>
  );
};

/* ====================== Stock Table ====================== */
const formatPrice = (v: number | null) =>
  v == null ? "—" : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const StockTable = ({
  items, isAdmin, hideActionsColumn = false, onEdit, onRemove, native = false,
}: {
  items: MaterialRow[];
  isAdmin: boolean;
  hideActionsColumn?: boolean;
  onEdit: (m: MaterialRow) => void;
  onRemove: (id: string) => void;
  native?: boolean;
}) => {
  const { t } = useTranslation("pages", { keyPrefix: "material" });
  const categoryLabel = (key: string) =>
    t(`categories.${key}`, { defaultValue: t("categories.other") });
  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-base font-bold text-foreground">{t("stock_title")}</h2>
        <span className="text-xs text-muted-foreground">{t("stock_count", { count: items.length })}</span>
      </div>
      {items.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">{t("stock_empty")}</div>
      ) : native ? (
        <div className="flex flex-col gap-3 p-4">
          {items.map((s) => {
            const m = categoryVisual(s.category);
            const Icon = m.icon;
            const low = s.quantity < s.min_quantity;
            return (
              <div key={s.id} className="rounded-2xl border border-border bg-background p-4 shadow-soft transition-colors hover:bg-muted/30">
                <div className="flex gap-3">
                  <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", m.color)}>
                    <Icon className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground">{s.name}</p>
                      {s.for_sale && (
                        <span className="rounded-full bg-pastel-green px-2 py-0.5 text-[10px] font-semibold text-pastel-green-foreground">{t("for_sale_badge")}</span>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", m.color)}>{categoryLabel(s.category)}</span>
                      <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-xs font-medium text-foreground">{t("sku_prefix")} {s.sku ?? t("em_dash")}</span>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                        {t("qty_label")} {s.quantity} {s.unit} · {t("min_label")} {s.min_quantity}
                      </span>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">{t("loc_label")} {s.location ?? t("em_dash")}</span>
                      {s.for_sale && (
                        <span className="rounded-full bg-pastel-blue px-2.5 py-1 text-xs font-medium text-pastel-blue-foreground">
                          {t("col_purchase_price")}: {formatPrice(s.purchase_price)} · {t("col_sale_price")}: {formatPrice(s.sale_price)}
                        </span>
                      )}
                      {low ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-pastel-pink px-2.5 py-1 text-xs font-semibold text-pastel-pink-foreground">
                          <AlertTriangle className="h-3 w-3" strokeWidth={2} /> {t("low_badge")}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {isAdmin && !hideActionsColumn ? (
                    <div className="flex shrink-0 flex-col gap-1">
                      <button type="button" onClick={() => onEdit(s)} className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title={t("edit")}>
                        <Pencil className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                      <button type="button" onClick={() => onRemove(s.id)} className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-pink hover:text-pastel-pink-foreground" title={t("remove")}>
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px]">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-6 py-3">{t("col_material")}</th>
                <th className="px-6 py-3">{t("col_category")}</th>
                <th className="px-6 py-3">{t("col_sku")}</th>
                <th className="px-6 py-3 text-right">{t("col_quantity")}</th>
                <th className="px-6 py-3 text-right">{t("col_purchase_price")}</th>
                <th className="px-6 py-3 text-right">{t("col_sale_price")}</th>
                <th className="px-6 py-3">{t("col_location")}</th>
                {!hideActionsColumn && <th className="px-6 py-3 text-right">{t("col_actions")}</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((s) => {
                const m = categoryVisual(s.category);
                const Icon = m.icon;
                const low = s.quantity < s.min_quantity;
                return (
                  <tr key={s.id} className="border-b border-border/60 text-sm transition-colors hover:bg-muted/30">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", m.color)}>
                          <Icon className="h-4 w-4" strokeWidth={2} />
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-foreground">{s.name}</p>
                            {s.for_sale && (
                              <span className="rounded-full bg-pastel-green px-2 py-0.5 text-[10px] font-semibold text-pastel-green-foreground">{t("for_sale_badge")}</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{t("min_label")} {s.min_quantity} {s.unit}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn("rounded-full px-3 py-1 text-xs font-medium", m.color)}>{categoryLabel(s.category)}</span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-muted-foreground">{s.sku ?? t("em_dash")}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        {low && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-pastel-pink px-2 py-0.5 text-[10px] font-semibold text-pastel-pink-foreground">
                            <AlertTriangle className="h-3 w-3" strokeWidth={2} /> {t("low_short")}
                          </span>
                        )}
                        <span className="font-bold text-foreground">{s.quantity}</span>
                        <span className="text-xs text-muted-foreground">{s.unit}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-muted-foreground">{formatPrice(s.purchase_price)}</td>
                    <td className="px-6 py-4 text-right text-sm font-medium text-foreground">{formatPrice(s.sale_price)}</td>
                    <td className="px-6 py-4 text-muted-foreground">{s.location ?? t("em_dash")}</td>
                    {!hideActionsColumn && (
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          {isAdmin && (
                            <>
                              <button onClick={() => onEdit(s)} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title={t("edit")}>
                                <Pencil className="h-4 w-4" strokeWidth={1.75} />
                              </button>
                              <button onClick={() => onRemove(s.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-pink hover:text-pastel-pink-foreground" title={t("remove")}>
                                <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/* ====================== Requests Table ====================== */
const RequestsTable = ({
  requests, classrooms, students, isAdmin, hideActionsColumn = false, currentUserId, canMarkDeliveries, progressFor, onEdit, onRemove, onMarkDeliveries, native = false,
}: {
  requests: RequestRow[];
  classrooms: { id: string; name: string }[];
  students: { id: string; full_name: string; classroom_id: string | null }[];
  isAdmin: boolean;
  hideActionsColumn?: boolean;
  currentUserId: string | null;
  canMarkDeliveries: boolean;
  progressFor: (r: RequestRow) => { brought: number; total: number };
  onEdit: (r: RequestRow) => void;
  onRemove: (id: string) => void;
  onMarkDeliveries: (r: RequestRow) => void;
  native?: boolean;
}) => {
  const { t, i18n } = useTranslation("pages", { keyPrefix: "material" });
  const categoryLabel = (key: string) =>
    t(`categories.${key}`, { defaultValue: t("categories.other") });
  const formatDateShort = (iso: string | null) =>
    iso
      ? new Date(iso + "T00:00:00").toLocaleDateString(dateLocaleTag(i18n.language), {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : t("em_dash");
  const classroomName = (id: string | null) => classrooms.find((c) => c.id === id)?.name ?? t("em_dash");
  const studentName = (id: string | null) => students.find((s) => s.id === id)?.full_name ?? null;

  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-base font-bold text-foreground">{t("requests_title")}</h2>
        <span className="text-xs text-muted-foreground">{t("requests_count", { count: requests.length })}</span>
      </div>
      {requests.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">{t("requests_empty")}</div>
      ) : native ? (
        <div className="flex flex-col gap-3 p-4">
          {requests.map((r) => {
            const m = categoryVisual(r.category);
            const Icon = m.icon;
            const sName = studentName(r.student_id);
            const canEdit = isAdmin || r.requester_id === currentUserId;
            const { brought, total } = progressFor(r);
            const complete = total > 0 && brought === total;
            return (
              <div key={r.id} className="rounded-2xl border border-border bg-background p-4 shadow-soft transition-colors hover:bg-muted/30">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", m.color)}>
                      <Icon className="h-5 w-5" strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground">{r.item_name}</p>
                      {r.description ? <p className="mt-1 text-sm text-muted-foreground line-clamp-3">{r.description}</p> : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", m.color)}>{categoryLabel(r.category)}</span>
                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">{t("qty_label")} {r.quantity}</span>
                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">{t("teacher_prefix")} {r.teacher_name ?? t("em_dash")}</span>
                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                          {sName ? `${t("student_prefix")} ${sName}` : `${t("class_prefix")} ${classroomName(r.classroom_id)}`}
                        </span>
                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">{t("date_prefix")} {formatDateShort(r.needed_date)}</span>
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", complete ? "bg-pastel-green text-pastel-green-foreground" : brought > 0 ? "bg-pastel-yellow text-pastel-yellow-foreground" : "bg-muted text-foreground")}>
                          {complete && <Check className="h-3 w-3" strokeWidth={2.25} />}
                          {t("deliveries_label")} {brought} / {total}
                        </span>
                      </div>
                    </div>
                  </div>
                  {!hideActionsColumn && (
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:flex-col sm:items-end">
                      {canMarkDeliveries && total > 0 && (
                        <button type="button" onClick={() => onMarkDeliveries(r)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-pastel-blue px-3 text-xs font-semibold text-pastel-blue-foreground transition-colors hover:opacity-90">
                          <ListChecks className="h-3.5 w-3.5" strokeWidth={2} /> {t("mark_deliveries")}
                        </button>
                      )}
                      {canEdit ? (
                        <>
                          <button type="button" onClick={() => onEdit(r)} className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title={t("edit")}><Pencil className="h-4 w-4" strokeWidth={1.75} /></button>
                          <button type="button" onClick={() => onRemove(r.id)} className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-pink hover:text-pastel-pink-foreground" title={t("remove")}><Trash2 className="h-4 w-4" strokeWidth={1.75} /></button>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-6 py-3">{t("col_material")}</th>
                <th className="px-6 py-3">{t("col_teacher")}</th>
                <th className="px-6 py-3">{t("col_destination")}</th>
                <th className="px-6 py-3">{t("col_date")}</th>
                <th className="px-6 py-3">{t("col_deliveries")}</th>
                {!hideActionsColumn && <th className="px-6 py-3 text-right">{t("col_actions")}</th>}
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const m = categoryVisual(r.category);
                const Icon = m.icon;
                const sName = studentName(r.student_id);
                const canEdit = isAdmin || r.requester_id === currentUserId;
                const { brought, total } = progressFor(r);
                const complete = total > 0 && brought === total;
                return (
                  <tr key={r.id} className="border-b border-border/60 text-sm transition-colors hover:bg-muted/30 align-top">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", m.color)}><Icon className="h-4 w-4" strokeWidth={2} /></span>
                        <div>
                          <p className="font-semibold text-foreground">{r.item_name}</p>
                          <p className="text-xs text-muted-foreground">{t("qty_label")} {r.quantity}</p>
                          {r.description && <p className="mt-1 max-w-xs text-xs text-muted-foreground line-clamp-2">{r.description}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-foreground">{r.teacher_name ?? t("em_dash")}</td>
                    <td className="px-6 py-4">
                      {sName ? (
                        <div><p className="text-foreground">{sName}</p><p className="text-xs text-muted-foreground">{t("student_line", { class: classroomName(r.classroom_id) })}</p></div>
                      ) : (
                        <div><p className="text-foreground">{classroomName(r.classroom_id)}</p><p className="text-xs text-muted-foreground">{t("whole_class")}</p></div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-foreground">{formatDateShort(r.needed_date)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold", complete ? "bg-pastel-green text-pastel-green-foreground" : brought > 0 ? "bg-pastel-yellow text-pastel-yellow-foreground" : "bg-muted text-foreground")}>
                          {complete && <Check className="h-3 w-3" strokeWidth={2.25} />}{brought} / {total}
                        </span>
                        <span className="text-xs text-muted-foreground">{t("brought_word")}</span>
                      </div>
                    </td>
                    {!hideActionsColumn && (
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          {canMarkDeliveries && total > 0 && (
                            <button onClick={() => onMarkDeliveries(r)} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-pastel-blue px-3 text-xs font-semibold text-pastel-blue-foreground transition-colors hover:opacity-90" title={t("mark_deliveries_title")}>
                              <ListChecks className="h-3.5 w-3.5" strokeWidth={2} /> {t("mark_deliveries")}
                            </button>
                          )}
                          {canEdit && <button onClick={() => onEdit(r)} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title={t("edit")}><Pencil className="h-4 w-4" strokeWidth={1.75} /></button>}
                          {canEdit && <button onClick={() => onRemove(r.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-pink hover:text-pastel-pink-foreground" title={t("remove")}><Trash2 className="h-4 w-4" strokeWidth={1.75} /></button>}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Material;

/* ====================== Delivery Dialog ====================== */
const DeliveryDialog = ({
  request, targetStudents, deliveries, schoolId, userId, onClose, onSaved,
}: {
  request: RequestRow | null;
  targetStudents: { id: string; full_name: string; classroom_id: string | null }[];
  deliveries: DeliveryRow[];
  schoolId: string | null;
  userId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const { t } = useTranslation("pages", { keyPrefix: "material.delivery_dialog" });
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!request) return;
    const initial: Record<string, boolean> = {};
    targetStudents.forEach((s) => {
      const d = deliveries.find((x) => x.student_id === s.id);
      initial[s.id] = d?.brought ?? false;
    });
    setMarks(initial);
    setSearch("");
  }, [request?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!request) return null;

  const filtered = targetStudents
    .filter((s) => !search.trim() || s.full_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, undefined, { numeric: true, sensitivity: "base" }));

  const toggleAll = (value: boolean) => {
    const next: Record<string, boolean> = { ...marks };
    filtered.forEach((s) => { next[s.id] = value; });
    setMarks(next);
  };

  const broughtCount = Object.values(marks).filter(Boolean).length;

  const save = async () => {
    if (!schoolId || !userId) return;
    setSaving(true);
    const now = new Date().toISOString();
    const payload = targetStudents.map((s) => ({
      request_id: request.id,
      student_id: s.id,
      school_id: schoolId,
      brought: !!marks[s.id],
      marked_by: userId,
      marked_at: now,
    }));
    const { error } = await supabase
      .from("material_request_deliveries")
      .upsert(payload, { onConflict: "request_id,student_id" });
    setSaving(false);
    if (error) {
      toast({ title: t("save_error"), description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: t("saved") });
    onSaved();
    onClose();
  };

  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title", { item: request.item_name })}</DialogTitle>
          <DialogDescription>{t("description", { marked: broughtCount, total: targetStudents.length })}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input placeholder={t("search_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button type="button" variant="outline" size="sm" onClick={() => toggleAll(true)}>{t("all")}</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => toggleAll(false)}>{t("none")}</Button>
        </div>
        <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-border">
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">{t("no_students")}</p>
          ) : (
            filtered.map((s) => {
              const checked = !!marks[s.id];
              return (
                <label key={s.id} className="flex cursor-pointer items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-0 hover:bg-muted/50">
                  <span className="text-sm text-foreground">{s.full_name}</span>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-xs", checked ? "text-pastel-green-foreground" : "text-muted-foreground")}>
                      {checked ? t("brought") : t("not_brought")}
                    </span>
                    <Checkbox checked={checked} onCheckedChange={(v) => setMarks((m) => ({ ...m, [s.id]: !!v }))} />
                  </div>
                </label>
              );
            })
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t("cancel")}</Button>
          <Button onClick={save} disabled={saving}>{saving ? t("saving") : t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
