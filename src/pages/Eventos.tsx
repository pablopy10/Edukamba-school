import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  List,
  PartyPopper,
  Trophy,
  Users,
  Megaphone,
  GraduationCap,
  Clock,
  MapPin,
  Pencil,
  Trash2,
  Wallet,
  FileSignature,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { EventFormDialog, type EventRow } from "@/components/eventos/EventFormDialog";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { NativeMobileFabPortal } from "@/components/dashboard/NativeMobileFabPortal";
import { showPageKpiCards, isNativeMobileApp, NATIVE_MOBILE_FAB_BUTTON_CLASSNAME } from "@/lib/nativeApp";
import {
  isSchoolManagementOrTeacher,
  isSchoolManagementRole,
  canValidateSchoolPaymentProofs,
  canViewSchoolEventAttendanceRoster,
} from "@/lib/schoolStaffRoles";
import { formatEventAudienceSummary, guardianInEducatorsAudience, audienceUsesProfileSelfRsvp, audienceUsesStudentRsvp, parseEventAudience, profileMaySelfRespondToAudience } from "@/lib/eventAudience";
import type { ParentChild } from "@/hooks/useParentChildren";
import { useParentChildren } from "@/hooks/useParentChildren";
import { DomainChargeRulesPanel } from "@/components/finance/DomainChargeRulesPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { PagamentosFinanceHub } from "@/pages/Pagamentos";
import { ModuleAuthorizationsPanel } from "@/components/authorizations/ModuleAuthorizationsPanel";
import { EventStaffAttendanceRoster } from "@/components/eventos/EventStaffAttendanceRoster";
import type { StaffRosterStudent } from "@/components/eventos/EventStaffAttendanceRoster";
import { EventProfileAudienceRoster, type ProfileRsvpRow } from "@/components/eventos/EventProfileAudienceRoster";
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

type EventType = "academico" | "cultural" | "desportivo" | "reuniao" | "comunicado";

const typeMeta: Record<string, { label: string; color: string; icon: typeof PartyPopper }> = {
  academico: { label: "Académico", color: "bg-pastel-blue text-pastel-blue-foreground", icon: GraduationCap },
  cultural: { label: "Cultural", color: "bg-pastel-pink text-pastel-pink-foreground", icon: PartyPopper },
  desportivo: { label: "Desportivo", color: "bg-pastel-green text-pastel-green-foreground", icon: Trophy },
  reuniao: { label: "Reunião", color: "bg-pastel-lilac text-pastel-lilac-foreground", icon: Users },
  comunicado: { label: "Comunicado", color: "bg-pastel-yellow text-pastel-yellow-foreground", icon: Megaphone },
};

type View = "calendario" | "lista";
type TypeFilter = EventType | "all";

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const weekdayLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const formatDateLong = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate().toString().padStart(2, "0")} ${monthNames[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
};

const formatTime = (t: string | null) => (t ? t.slice(0, 5) : "");

type RsvpResponse = "presente" | "ausente" | "unset";

const makeRsvpKey = (eventId: string, studentId: string) => `${eventId}::${studentId}`;

const Eventos = () => {
  const native = isNativeMobileApp();
  const [searchParams] = useSearchParams();
  const { selectedYearId } = useAcademicYear();
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [view, setView] = useState<View>("calendario");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState<number>(() => new Date().getMonth());
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [audienceRoomNames, setAudienceRoomNames] = useState<Record<string, string>>({});

  const [hubTab, setHubTab] = useState<"eventos" | "pagamentos" | "autorizacoes" | "regras">("eventos");
  const [rsvpMap, setRsvpMap] = useState<Record<string, RsvpResponse>>({});
  const [rsvpSavingKey, setRsvpSavingKey] = useState<string | null>(null);
  const [rosterStudentsForSchool, setRosterStudentsForSchool] = useState<StaffRosterStudent[]>([]);
  const [staffAttendanceRsvpMap, setStaffAttendanceRsvpMap] = useState<Record<string, RsvpResponse>>({});
  const [profileSelfRsvpMap, setProfileSelfRsvpMap] = useState<Record<string, RsvpResponse>>({});
  const [profileRsvpSavingKey, setProfileRsvpSavingKey] = useState<string | null>(null);
  const [profileAudienceRowsByEvent, setProfileAudienceRowsByEvent] = useState<Record<string, ProfileRsvpRow[]>>({});

  const { children: parentChildrenList, childIds, allChildIds, loading: parentChildrenLoading } =
    useParentChildren();

  const canCreateEvent = role === "SUPER_ADMIN" || isSchoolManagementOrTeacher(role);
  const canFinanceChargeRules = canValidateSchoolPaymentProofs(role);
  const isParentRole = role === "PARENT";

  const canMutateEvent = useCallback(
    (e: EventRow) => {
      if (!userId) return false;
      if (role === "SUPER_ADMIN" || isSchoolManagementRole(role)) return true;
      if (role === "TEACHER") return (e.created_by ?? null) === userId;
      return false;
    },
    [userId, role],
  );

  const loadEvents = async () => {
    if (!schoolId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("school_id", schoolId)
      .order("event_date", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error("Erro ao carregar eventos: " + error.message);
      return;
    }
    setEvents((data ?? []) as EventRow[]);
  };

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("school_id, role")
        .eq("id", user.id)
        .maybeSingle();
      setSchoolId(profile?.school_id ?? null);
      setRole(profile?.role ?? null);
    })();
  }, []);

  useEffect(() => {
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  useEffect(() => {
    if (searchParams.get("tab") === "autorizacoes") setHubTab("autorizacoes");
    if (searchParams.get("tab") === "pagamentos") setHubTab("pagamentos");
  }, [searchParams]);

  useEffect(() => {
    if (!schoolId || !selectedYearId) {
      setAudienceRoomNames({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("classrooms")
        .select("id,name")
        .eq("school_id", schoolId)
        .eq("academic_year_id", selectedYearId);
      if (cancelled) return;
      if (error) {
        setAudienceRoomNames({});
        return;
      }
      const map: Record<string, string> = {};
      for (const row of data ?? []) map[row.id] = row.name;
      setAudienceRoomNames(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [schoolId, selectedYearId]);

  const upsertPresence = useCallback(
    async (eventId: string, studentId: string, response: RsvpResponse) => {
      if (!userId) {
        toast.error("Sessão inválida.");
        return;
      }
      const k = makeRsvpKey(eventId, studentId);
      setRsvpSavingKey(k);
      let prev: RsvpResponse = "unset";
      setRsvpMap((m) => {
        prev = m[k] ?? "unset";
        return { ...m, [k]: response };
      });
      const { error } = await supabase.from("event_student_rsvp").upsert(
        {
          event_id: eventId,
          student_id: studentId,
          response,
          updated_by: userId,
        },
        { onConflict: "event_id,student_id" },
      );
      if (error) {
        setRsvpMap((m) => ({ ...m, [k]: prev }));
        toast.error("Erro ao guardar presença: " + error.message);
      }
      setRsvpSavingKey(null);
    },
    [userId],
  );

  const upsertProfileSelfRsvp = useCallback(
    async (eventId: string, response: RsvpResponse) => {
      if (!userId) {
        toast.error("Sessão inválida.");
        return;
      }
      const k = `prof::${eventId}`;
      setProfileRsvpSavingKey(k);
      let prev: RsvpResponse = "unset";
      setProfileSelfRsvpMap((m) => {
        prev = m[eventId] ?? "unset";
        return { ...m, [eventId]: response };
      });
      const { error } = await supabase.from("event_profile_rsvp").upsert(
        {
          event_id: eventId,
          profile_id: userId,
          response,
          updated_by: userId,
        },
        { onConflict: "event_id,profile_id" },
      );
      if (error) {
        setProfileSelfRsvpMap((m) => ({ ...m, [eventId]: prev }));
        toast.error("Erro ao guardar presença: " + error.message);
      }
      setProfileRsvpSavingKey(null);
    },
    [userId],
  );

  useEffect(() => {
    if (role !== "PARENT" || parentChildrenLoading || !schoolId) return;
    const eventIds = events.map((e) => e.id);
    if (eventIds.length === 0 || allChildIds.length === 0) {
      setRsvpMap({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("event_student_rsvp")
        .select("event_id, student_id, response")
        .in("event_id", eventIds)
        .in("student_id", allChildIds);
      if (cancelled) return;
      if (error) return;
      const next: Record<string, RsvpResponse> = {};
      for (const row of data ?? []) {
        const r = row.response as RsvpResponse;
        if (r !== "presente" && r !== "ausente" && r !== "unset") continue;
        next[makeRsvpKey(row.event_id, row.student_id)] = r;
      }
      setRsvpMap(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [role, parentChildrenLoading, schoolId, events, allChildIds]);

  useEffect(() => {
    if (!canViewSchoolEventAttendanceRoster(role) || !schoolId) {
      setRosterStudentsForSchool([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, classroom_id")
        .eq("school_id", schoolId)
        .order("full_name", { ascending: true });
      if (cancelled) return;
      if (error) {
        setRosterStudentsForSchool([]);
        return;
      }
      setRosterStudentsForSchool((data ?? []) as StaffRosterStudent[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [schoolId, role]);

  useEffect(() => {
    if (!canViewSchoolEventAttendanceRoster(role) || !schoolId) {
      setStaffAttendanceRsvpMap({});
      return;
    }
    const eventIds = events.map((e) => e.id);
    if (eventIds.length === 0) {
      setStaffAttendanceRsvpMap({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("event_student_rsvp")
        .select("event_id, student_id, response")
        .in("event_id", eventIds);
      if (cancelled) return;
      if (error) {
        setStaffAttendanceRsvpMap({});
        return;
      }
      const next: Record<string, RsvpResponse> = {};
      for (const row of data ?? []) {
        const r = row.response as RsvpResponse;
        if (r !== "presente" && r !== "ausente" && r !== "unset") continue;
        next[makeRsvpKey(row.event_id as string, row.student_id as string)] = r;
      }
      setStaffAttendanceRsvpMap(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [role, schoolId, events]);

  useEffect(() => {
    if (!userId || events.length === 0) {
      setProfileSelfRsvpMap({});
      return;
    }
    const eventIds = events.map((e) => e.id);
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("event_profile_rsvp")
        .select("event_id,response")
        .eq("profile_id", userId)
        .in("event_id", eventIds);
      if (cancelled) return;
      if (error) return;
      const next: Record<string, RsvpResponse> = {};
      for (const row of data ?? []) {
        const r = row.response as RsvpResponse;
        if (r !== "presente" && r !== "ausente" && r !== "unset") continue;
        next[row.event_id as string] = r;
      }
      setProfileSelfRsvpMap(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, events]);

  useEffect(() => {
    if (!canViewSchoolEventAttendanceRoster(role)) {
      setProfileAudienceRowsByEvent({});
      return;
    }
    const eventIds = events.map((e) => e.id);
    if (eventIds.length === 0) {
      setProfileAudienceRowsByEvent({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("event_profile_rsvp")
        .select("event_id, profile_id, response, profiles(full_name)")
        .in("event_id", eventIds);
      if (cancelled) return;
      if (error) {
        setProfileAudienceRowsByEvent({});
        return;
      }
      const byEvent: Record<string, ProfileRsvpRow[]> = {};
      for (const row of data ?? []) {
        const rid = row.event_id as string;
        const prof = row.profiles as unknown as { full_name: string | null } | null;
        const r = row.response as RsvpResponse;
        const norm: RsvpResponse =
          r === "presente" || r === "ausente" || r === "unset" ? r : "unset";
        if (!byEvent[rid]) byEvent[rid] = [];
        byEvent[rid].push({
          profile_id: row.profile_id as string,
          full_name: prof?.full_name ?? null,
          response: norm,
        });
      }
      setProfileAudienceRowsByEvent(byEvent);
    })();
    return () => {
      cancelled = true;
    };
  }, [role, events]);

  const staffAttendanceBundle = useMemo(() => {
    if (!canViewSchoolEventAttendanceRoster(role)) return undefined;
    return {
      rosterStudents: rosterStudentsForSchool,
      rsvpMap: staffAttendanceRsvpMap,
      classroomNames: audienceRoomNames,
      profileRowsByEvent: profileAudienceRowsByEvent,
    };
  }, [role, rosterStudentsForSchool, staffAttendanceRsvpMap, audienceRoomNames, profileAudienceRowsByEvent]);

  const profileSelfPresenceUi = useMemo(() => {
    if (!userId) return undefined;
    return {
      userId,
      role,
      kids: parentChildrenList,
      responses: profileSelfRsvpMap,
      savingKey: profileRsvpSavingKey,
      upsert: upsertProfileSelfRsvp,
    };
  }, [userId, role, parentChildrenList, profileSelfRsvpMap, profileRsvpSavingKey, upsertProfileSelfRsvp]);

  const parentPresenceUi = useMemo(() => {
    if (role !== "PARENT") return undefined;
    return {
      kids: parentChildrenList,
      loadingKids: parentChildrenLoading,
      rsvpMap,
      savingKey: rsvpSavingKey,
      upsertPresence,
    };
  }, [
    role,
    parentChildrenList,
    parentChildrenLoading,
    rsvpMap,
    rsvpSavingKey,
    upsertPresence,
  ]);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (native) {
        const m = new Date(e.event_date + "T00:00:00").getMonth();
        if (m !== monthFilter) return false;
      }
      const matchesType = typeFilter === "all" || e.type === typeFilter;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        e.title.toLowerCase().includes(q) ||
        (e.organizer ?? "").toLowerCase().includes(q) ||
        formatEventAudienceSummary(e.audience, audienceRoomNames).toLowerCase().includes(q) ||
        (e.audience ?? "").toLowerCase().includes(q) ||
        (e.location ?? "").toLowerCase().includes(q);
      return matchesType && matchesSearch;
    });
  }, [events, typeFilter, search, native, monthFilter, audienceRoomNames]);

  const stats = useMemo(() => ({
    total: filtered.length,
    academicos: filtered.filter((e) => e.type === "academico").length,
    culturais: filtered.filter((e) => e.type === "cultural").length,
    desportivos: filtered.filter((e) => e.type === "desportivo").length,
  }), [filtered]);

  const handleNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const handleEdit = (ev: EventRow) => {
    setEditing(ev);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("events").delete().eq("id", deleteId);
    if (error) {
      toast.error("Erro ao remover: " + error.message);
    } else {
      toast.success("Evento removido.");
      loadEvents();
    }
    setDeleteId(null);
  };

  const showFabSlot =
    native &&
    canCreateEvent &&
    hubTab === "eventos";

  const eventsTabBody = (
      <div className={cn("flex flex-col gap-6", showFabSlot && "relative pb-28")}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Eventos</h1>
            <p className="text-sm text-muted-foreground">
              Acompanhe e organize todos os eventos da escola.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {!native && (
            <div className="inline-flex h-11 items-center rounded-full border border-border bg-card p-1 shadow-soft">
              <button
                onClick={() => setView("calendario")}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
                  view === "calendario"
                    ? "bg-pastel-blue text-pastel-blue-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <CalendarDays className="h-4 w-4" strokeWidth={1.75} />
                Calendário
              </button>
              <button
                onClick={() => setView("lista")}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
                  view === "lista"
                    ? "bg-pastel-blue text-pastel-blue-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <List className="h-4 w-4" strokeWidth={1.75} />
                Lista
              </button>
            </div>
            )}

            {canCreateEvent && !native && (
              <button
                onClick={handleNew}
                className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
              >
                <Plus className="h-4 w-4" strokeWidth={2.25} />
                Novo Evento
              </button>
            )}
          </div>
        </div>

        {showPageKpiCards() && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total", value: stats.total, color: "bg-pastel-lilac text-pastel-lilac-foreground" },
            { label: "Académicos", value: stats.academicos, color: "bg-pastel-blue text-pastel-blue-foreground" },
            { label: "Culturais", value: stats.culturais, color: "bg-pastel-pink text-pastel-pink-foreground" },
            { label: "Desportivos", value: stats.desportivos, color: "bg-pastel-green text-pastel-green-foreground" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl bg-card p-5 shadow-card">
              <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-medium", s.color)}>
                {s.label}
              </span>
              <p className="mt-3 text-3xl font-bold text-foreground">{s.value}</p>
            </div>
          ))}
        </div>
        )}

        <div className={cn("flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card", !native && "sm:flex-row sm:items-center sm:justify-between")}>
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar evento, local ou organizador..."
              className="h-10 w-full rounded-full border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-pastel-blue/40"
            />
          </div>
          {native && (
            <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
              {monthNames.map((name, idx) => (
                <button
                  key={idx}
                  onClick={() => setMonthFilter(idx)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                    monthFilter === idx
                      ? "bg-pastel-blue text-pastel-blue-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {name.slice(0, 3)}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <TypeChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")} className="bg-muted text-foreground">
              Todos
            </TypeChip>
            {(Object.keys(typeMeta) as EventType[]).map((t) => (
              <TypeChip
                key={t}
                active={typeFilter === t}
                onClick={() => setTypeFilter(t)}
                className={typeMeta[t].color}
              >
                {typeMeta[t].label}
              </TypeChip>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-card p-12 text-center text-sm text-muted-foreground shadow-card">
            A carregar eventos...
          </div>
        ) : native ? (
          <EventsCardsView
            events={filtered}
            audienceRoomNames={audienceRoomNames}
            canMutateEvent={canMutateEvent}
            onEdit={handleEdit}
            onDelete={(id) => setDeleteId(id)}
            parentPresence={parentPresenceUi}
            profileSelfPresence={profileSelfPresenceUi}
            staffAttendance={staffAttendanceBundle}
          />
        ) : view === "calendario" ? (
          <CalendarView
            cursor={cursor}
            setCursor={setCursor}
            events={filtered}
            audienceRoomNames={audienceRoomNames}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            canMutateEvent={canMutateEvent}
            onEdit={handleEdit}
            onDelete={(id) => setDeleteId(id)}
            parentPresence={parentPresenceUi}
            profileSelfPresence={profileSelfPresenceUi}
            staffAttendance={staffAttendanceBundle}
          />
        ) : (
          <ListView
            events={filtered}
            audienceRoomNames={audienceRoomNames}
            canMutateEvent={canMutateEvent}
            onEdit={handleEdit}
            onDelete={(id) => setDeleteId(id)}
            hideActionsColumn={role === "PARENT"}
            parentPresence={parentPresenceUi}
            profileSelfPresence={profileSelfPresenceUi}
            staffAttendance={staffAttendanceBundle}
          />
        )}
      </div>
  );

  return (
    <>
      <Tabs
        value={hubTab}
        onValueChange={(v) =>
          setHubTab(v as "eventos" | "pagamentos" | "autorizacoes" | "regras")
        }
        className="flex flex-col gap-6"
      >
        <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-2xl border border-border bg-card p-2 shadow-soft">
          <TabsTrigger value="eventos" className="rounded-full px-5">
            Eventos
          </TabsTrigger>
          {canFinanceChargeRules && (
            <TabsTrigger value="regras" className="rounded-full px-5">
              Regras de cobranças
            </TabsTrigger>
          )}
          <TabsTrigger value="pagamentos" className="rounded-full px-5">
            <Wallet className="mr-2 hidden h-4 w-4 sm:inline" strokeWidth={1.75} />
            Pagamentos
          </TabsTrigger>
          <TabsTrigger value="autorizacoes" className="rounded-full px-5">
            <FileSignature className="mr-2 hidden h-4 w-4 sm:inline" strokeWidth={1.75} />
            Autorizações
          </TabsTrigger>
        </TabsList>
        <TabsContent value="eventos" className="mt-0 space-y-0 focus-visible:outline-none">
          {eventsTabBody}
        </TabsContent>
        {canFinanceChargeRules && (
          <TabsContent value="regras" className="mt-0 focus-visible:outline-none">
            <DomainChargeRulesPanel variant="event" schoolId={schoolId} role={role} />
          </TabsContent>
        )}
        <TabsContent value="pagamentos" className="mt-0 space-y-0 focus-visible:outline-none">
          <PagamentosFinanceHub financePage="eventCharges" />
        </TabsContent>
        <TabsContent value="autorizacoes" className="mt-0 space-y-0 focus-visible:outline-none">
          <ModuleAuthorizationsPanel
            module="event"
            schoolId={schoolId}
            userId={userId}
            role={role}
            isParent={isParentRole}
            childIds={childIds}
            canManageTemplates={role !== null && isSchoolManagementRole(role)}
          />
        </TabsContent>
      </Tabs>

      {native && canCreateEvent && hubTab === "eventos" && (
        <NativeMobileFabPortal>
          <Button
            type="button"
            size="icon"
            className={NATIVE_MOBILE_FAB_BUTTON_CLASSNAME}
            aria-label="Novo evento"
            onClick={handleNew}
          >
            <Plus className="h-6 w-6" />
          </Button>
        </NativeMobileFabPortal>
      )}

      <EventFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        schoolId={schoolId}
        event={editing}
        defaultDate={selectedDate}
        onSaved={loadEvents}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover evento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

type ParentPresenceBundle = {
  kids: ParentChild[];
  loadingKids: boolean;
  rsvpMap: Record<string, RsvpResponse>;
  savingKey: string | null;
  upsertPresence: (eventId: string, studentId: string, response: RsvpResponse) => Promise<void>;
};

type StaffAttendanceBundle = {
  rosterStudents: StaffRosterStudent[];
  rsvpMap: Record<string, RsvpResponse>;
  classroomNames: Record<string, string>;
  profileRowsByEvent: Record<string, ProfileRsvpRow[]>;
};

type ProfileSelfPresenceBundle = {
  role: string | null;
  kids: ParentChild[];
  responses: Record<string, RsvpResponse>;
  savingKey: string | null;
  upsert: (eventId: string, resp: RsvpResponse) => Promise<void>;
};

function EventSelfProfilePresence({
  event,
  layout,
  bundle,
}: {
  event: EventRow;
  layout: "card" | "inline";
  bundle: ProfileSelfPresenceBundle;
}) {
  const p = parseEventAudience(event.audience);
  const inEducScope = guardianInEducatorsAudience(
    p,
    bundle.kids.map((k) => k.classroom_id),
  );
  if (!profileMaySelfRespondToAudience(p, bundle.role, { guardianInEducatorsScope: inEducScope })) {
    return null;
  }

  const btnBase =
    layout === "card"
      ? "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50"
      : "rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-50";

  const wrap =
    layout === "card"
      ? "mt-3 space-y-2 rounded-lg border border-border/60 bg-muted/15 p-3"
      : "max-w-[220px] space-y-2 py-1";

  const current = bundle.responses[event.id] ?? "unset";
  const busy = bundle.savingKey === `prof::${event.id}`;
  const labels: Record<RsvpResponse, string> = {
    presente: "Presente",
    ausente: "Ausente",
    unset: "Por definir",
  };

  return (
    <div className={wrap}>
      <p
        className={
          layout === "card"
            ? "text-xs font-semibold text-muted-foreground"
            : "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
        }
      >
        A minha presença
      </p>
      <div className="flex flex-wrap gap-1">
        {(["presente", "ausente", "unset"] as const).map((resp) => (
          <button
            key={resp}
            type="button"
            disabled={busy}
            onClick={() => void bundle.upsert(event.id, resp)}
            className={cn(
              btnBase,
              resp === current
                ? "bg-pastel-lilac text-pastel-lilac-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {labels[resp]}
          </button>
        ))}
      </div>
    </div>
  );
}

function EventParentPresence({
  event,
  layout,
  bundle,
}: {
  event: EventRow;
  layout: "card" | "inline";
  bundle: ParentPresenceBundle;
}) {
  const { kids, loadingKids, rsvpMap, savingKey, upsertPresence } = bundle;
  const aud = parseEventAudience(event.audience);
  if (!audienceUsesStudentRsvp(aud)) return null;

  const ids = aud.classroomIds;
  const scopedKids =
    ids.length === 0 ? [] : kids.filter((k) => !!k.classroom_id && ids.includes(k.classroom_id));

  const btnBase =
    layout === "card"
      ? "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50"
      : "rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-50";

  const wrap =
    layout === "card"
      ? "mt-3 space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3"
      : "max-w-[220px] space-y-2 py-1";

  return (
    <div className={wrap}>
      <p
        className={
          layout === "card"
            ? "text-xs font-semibold text-muted-foreground"
            : "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
        }
      >
        Presença
      </p>
      {loadingKids ? (
        <p className="text-[11px] text-muted-foreground">A carregar…</p>
      ) : scopedKids.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Sem educandos nestas turmas para declarar presença neste evento.
        </p>
      ) : (
        scopedKids.map((child) => {
          const ka = makeRsvpKey(event.id, child.id);
          const current = rsvpMap[ka] ?? "unset";
          const busy = savingKey === ka;
          const labels: Record<RsvpResponse, string> = {
            presente: "Presente",
            ausente: "Ausente",
            unset: "Por definir",
          };
          return (
            <div
              key={child.id}
              className={cn(
                "flex flex-col gap-1.5",
                layout === "card" ? "sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2" : "",
              )}
            >
              <span
                className={cn(
                  "font-medium text-foreground",
                  layout === "inline" ? "truncate text-[11px]" : "text-sm",
                )}
              >
                {child.full_name}
              </span>
              <div className="flex flex-wrap gap-1">
                {(["presente", "ausente", "unset"] as const).map((resp) => (
                  <button
                    key={resp}
                    type="button"
                    disabled={busy}
                    onClick={() => void upsertPresence(event.id, child.id, resp)}
                    className={cn(
                      btnBase,
                      resp === current
                        ? "bg-pastel-blue text-pastel-blue-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {labels[resp]}
                  </button>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

const TypeChip = ({
  active,
  onClick,
  className,
  children,
}: {
  active: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "rounded-full px-3 py-1.5 text-xs font-medium transition-all",
      active ? cn(className, "ring-2 ring-foreground/20 ring-offset-2 ring-offset-card") : "bg-muted text-muted-foreground hover:text-foreground",
    )}
  >
    {children}
  </button>
);

const EventsCardsView = ({
  events: items,
  audienceRoomNames,
  canMutateEvent,
  onEdit,
  onDelete,
  parentPresence,
  profileSelfPresence,
  staffAttendance,
}: {
  events: EventRow[];
  audienceRoomNames: Record<string, string>;
  canMutateEvent: (e: EventRow) => boolean;
  onEdit: (e: EventRow) => void;
  onDelete: (id: string) => void;
  parentPresence?: ParentPresenceBundle;
  profileSelfPresence?: ProfileSelfPresenceBundle;
  staffAttendance?: StaffAttendanceBundle;
}) => {
  const sorted = [...items].sort((a, b) => b.event_date.localeCompare(a.event_date));

  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-6">
        <h2 className="text-base font-bold text-foreground">Eventos</h2>
        <span className="text-xs text-muted-foreground">{sorted.length} resultado(s)</span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        {sorted.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Sem eventos para os filtros aplicados.</p>
        ) : (
          sorted.map((e) => {
            const meta = typeMeta[e.type] ?? typeMeta.academico;
            const Icon = meta.icon;
            return (
              <div key={e.id} className="rounded-xl border border-border bg-background p-3 shadow-soft">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {formatDateLong(e.event_date)}
                </p>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-full", meta.color)}>
                      <Icon className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-foreground">{e.title}</p>
                      {e.organizer && <p className="text-xs text-muted-foreground">{e.organizer}</p>}
                    </div>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", meta.color)}>
                    {meta.label}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {(e.start_time || e.end_time) && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" strokeWidth={1.75} />
                      {formatTime(e.start_time)}{e.end_time ? ` – ${formatTime(e.end_time)}` : ""}
                    </span>
                  )}
                  {e.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" strokeWidth={1.75} />
                      {e.location}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Público:{" "}
                  <span className="font-medium text-foreground">{formatEventAudienceSummary(e.audience, audienceRoomNames)}</span>
                </p>
                {parentPresence && (
                  <EventParentPresence event={e} layout="card" bundle={parentPresence} />
                )}
                {profileSelfPresence && (
                  <EventSelfProfilePresence event={e} layout="card" bundle={profileSelfPresence} />
                )}
                {staffAttendance && audienceUsesStudentRsvp(parseEventAudience(e.audience)) && (
                  <EventStaffAttendanceRoster
                    event={e}
                    rosterStudents={staffAttendance.rosterStudents}
                    rsvpMap={staffAttendance.rsvpMap}
                    classroomNames={staffAttendance.classroomNames}
                    layout="card"
                  />
                )}
                {staffAttendance && audienceUsesProfileSelfRsvp(parseEventAudience(e.audience)) && (
                  <EventProfileAudienceRoster
                    event={e}
                    rows={staffAttendance.profileRowsByEvent[e.id] ?? []}
                    layout="card"
                  />
                )}
                {canMutateEvent(e) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(e)}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground hover:bg-accent"
                    >
                      <Pencil className="h-3 w-3" /> Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(e.id)}
                      className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/20"
                    >
                      <Trash2 className="h-3 w-3" /> Remover
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

/* ======================= Calendar View ======================= */
const CalendarView = ({
  cursor,
  setCursor,
  events: items,
  audienceRoomNames,
  selectedDate,
  setSelectedDate,
  canMutateEvent,
  onEdit,
  onDelete,
  parentPresence,
  profileSelfPresence,
  staffAttendance,
}: {
  cursor: Date;
  setCursor: (d: Date) => void;
  events: EventRow[];
  audienceRoomNames: Record<string, string>;
  selectedDate: string | null;
  setSelectedDate: (d: string | null) => void;
  canMutateEvent: (e: EventRow) => boolean;
  onEdit: (e: EventRow) => void;
  onDelete: (id: string) => void;
  parentPresence?: ParentPresenceBundle;
  profileSelfPresence?: ProfileSelfPresenceBundle;
  staffAttendance?: StaffAttendanceBundle;
}) => {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: { date: Date | null; iso: string | null }[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ date: null, iso: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ date, iso });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, iso: null });

  const eventsByDate = useMemo(() => {
    const map = new Map<string, EventRow[]>();
    items.forEach((e) => {
      const arr = map.get(e.event_date) ?? [];
      arr.push(e);
      map.set(e.event_date, arr);
    });
    return map;
  }, [items]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const selectedEvents = selectedDate ? eventsByDate.get(selectedDate) ?? [] : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="overflow-hidden rounded-2xl bg-card shadow-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCursor(new Date(year, month - 1, 1))}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-accent"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <h2 className="text-base font-bold text-foreground">
              {monthNames[month]} {year}
            </h2>
            <button
              onClick={() => setCursor(new Date(year, month + 1, 1))}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-accent"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
          <button
            onClick={() => {
              setCursor(new Date());
              setSelectedDate(todayIso);
            }}
            className="rounded-full bg-muted px-4 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
          >
            Hoje
          </button>
        </div>

        <div className="p-4">
          <div className="mb-2 grid grid-cols-7 gap-2">
            {weekdayLabels.map((d) => (
              <div
                key={d}
                className="rounded-xl bg-muted py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {cells.map((c, i) => {
              if (!c.date || !c.iso) {
                return <div key={i} className="min-h-[92px] rounded-xl bg-muted/20" />;
              }
              const dayEvents = eventsByDate.get(c.iso) ?? [];
              const isToday = c.iso === todayIso;
              const isSelected = c.iso === selectedDate;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(c.iso)}
                  className={cn(
                    "flex min-h-[92px] flex-col items-stretch gap-1 rounded-xl border p-2 text-left transition-all hover:-translate-y-0.5",
                    isSelected
                      ? "border-pastel-blue-foreground bg-pastel-blue/30"
                      : "border-border bg-background",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold",
                        isToday ? "bg-pastel-blue text-pastel-blue-foreground" : "text-foreground",
                      )}
                    >
                      {c.date.getDate()}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    {dayEvents.slice(0, 2).map((e) => (
                      <span
                        key={e.id}
                        className={cn(
                          "truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                          (typeMeta[e.type] ?? typeMeta.academico).color,
                        )}
                      >
                        {e.title}
                      </span>
                    ))}
                    {dayEvents.length > 2 && (
                      <span className="text-[10px] font-medium text-muted-foreground">
                        +{dayEvents.length - 2} mais
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-card p-5 shadow-card">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Detalhe do dia
          </p>
          <h3 className="mt-1 text-base font-bold text-foreground">
            {selectedDate ? formatDateLong(selectedDate) : "Selecione uma data"}
          </h3>
        </div>

        {selectedDate && selectedEvents.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            Sem eventos neste dia.
          </div>
        )}

        <div className="flex flex-col gap-3">
          {selectedEvents.map((e) => {
            const meta = typeMeta[e.type] ?? typeMeta.academico;
            const Icon = meta.icon;
            return (
              <div key={e.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-full", meta.color)}>
                      <Icon className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-foreground">{e.title}</p>
                      {e.organizer && <p className="text-xs text-muted-foreground">{e.organizer}</p>}
                    </div>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", meta.color)}>
                    {meta.label}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {(e.start_time || e.end_time) && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" strokeWidth={1.75} />
                      {formatTime(e.start_time)}{e.end_time ? ` – ${formatTime(e.end_time)}` : ""}
                    </span>
                  )}
                  {e.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" strokeWidth={1.75} />
                      {e.location}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Público:{" "}
                  <span className="font-medium text-foreground">{formatEventAudienceSummary(e.audience, audienceRoomNames)}</span>
                </p>
                {parentPresence && (
                  <EventParentPresence event={e} layout="card" bundle={parentPresence} />
                )}
                {profileSelfPresence && (
                  <EventSelfProfilePresence event={e} layout="card" bundle={profileSelfPresence} />
                )}
                {staffAttendance && audienceUsesStudentRsvp(parseEventAudience(e.audience)) && (
                  <EventStaffAttendanceRoster
                    event={e}
                    rosterStudents={staffAttendance.rosterStudents}
                    rsvpMap={staffAttendance.rsvpMap}
                    classroomNames={staffAttendance.classroomNames}
                    layout="card"
                  />
                )}
                {staffAttendance && audienceUsesProfileSelfRsvp(parseEventAudience(e.audience)) && (
                  <EventProfileAudienceRoster
                    event={e}
                    rows={staffAttendance.profileRowsByEvent[e.id] ?? []}
                    layout="card"
                  />
                )}
                {canMutateEvent(e) && (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => onEdit(e)}
                      className="inline-flex h-7 items-center gap-1 rounded-full bg-muted px-3 text-[11px] font-medium text-foreground hover:bg-accent"
                    >
                      <Pencil className="h-3 w-3" /> Editar
                    </button>
                    <button
                      onClick={() => onDelete(e.id)}
                      className="inline-flex h-7 items-center gap-1 rounded-full bg-destructive/10 px-3 text-[11px] font-medium text-destructive hover:bg-destructive/20"
                    >
                      <Trash2 className="h-3 w-3" /> Remover
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ======================= List View ======================= */
const ListView = ({
  events: items,
  audienceRoomNames,
  canMutateEvent,
  onEdit,
  onDelete,
  hideActionsColumn = false,
  parentPresence,
  profileSelfPresence,
  staffAttendance,
}: {
  events: EventRow[];
  audienceRoomNames: Record<string, string>;
  canMutateEvent: (e: EventRow) => boolean;
  onEdit: (e: EventRow) => void;
  onDelete: (id: string) => void;
  hideActionsColumn?: boolean;
  parentPresence?: ParentPresenceBundle;
  profileSelfPresence?: ProfileSelfPresenceBundle;
  staffAttendance?: StaffAttendanceBundle;
}) => {
  const sorted = [...items].sort((a, b) => b.event_date.localeCompare(a.event_date));
  const presenceCol = !!parentPresence;
  const selfCol = !!profileSelfPresence;
  const staffCol = !!staffAttendance;
  const emptyColSpan = 6 + (presenceCol ? 1 : 0) + (selfCol ? 1 : 0) + (staffCol ? 1 : 0) + (!hideActionsColumn ? 1 : 0);

  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-base font-bold text-foreground">Lista de Eventos</h2>
        <span className="text-xs text-muted-foreground">{sorted.length} resultado(s)</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-6 py-3">Data</th>
              <th className="px-6 py-3">Evento</th>
              <th className="px-6 py-3">Tipo</th>
              <th className="px-6 py-3">Local</th>
              <th className="px-6 py-3">Organizador</th>
              <th className="px-6 py-3">Público</th>
              {presenceCol && <th className="px-6 py-3">Presença (alunos)</th>}
              {selfCol && <th className="px-6 py-3 whitespace-nowrap">A minha presença</th>}
              {staffCol && <th className="px-6 py-3 whitespace-nowrap">Listas presença</th>}
              {!hideActionsColumn && <th className="px-6 py-3 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((e) => {
              const meta = typeMeta[e.type] ?? typeMeta.academico;
              const Icon = meta.icon;
              return (
                <tr key={e.id} className="border-b border-border/60 text-sm transition-colors hover:bg-muted/30">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-semibold text-foreground">{formatDateLong(e.event_date)}</span>
                      {(e.start_time || e.end_time) && (
                        <span className="text-xs text-muted-foreground">
                          {formatTime(e.start_time)}{e.end_time ? ` – ${formatTime(e.end_time)}` : ""}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", meta.color)}>
                        <Icon className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <p className="font-semibold text-foreground">{e.title}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn("rounded-full px-3 py-1 text-xs font-medium", meta.color)}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{e.location ?? "—"}</td>
                  <td className="px-6 py-4 text-muted-foreground">{e.organizer ?? "—"}</td>
                  <td className="px-6 py-4 text-muted-foreground">{formatEventAudienceSummary(e.audience, audienceRoomNames)}</td>
                  {presenceCol && (
                    <td className="align-top px-6 py-4 text-muted-foreground">
                      <EventParentPresence event={e} layout="inline" bundle={parentPresence} />
                    </td>
                  )}
                  {selfCol && profileSelfPresence && (
                    <td className="align-top px-6 py-4 text-muted-foreground">
                      <EventSelfProfilePresence event={e} layout="inline" bundle={profileSelfPresence} />
                    </td>
                  )}
                  {staffCol && staffAttendance && (
                    <td className="align-top px-6 py-4 text-muted-foreground">
                      <div className="flex flex-col gap-2">
                        {audienceUsesStudentRsvp(parseEventAudience(e.audience)) && (
                          <EventStaffAttendanceRoster
                            event={e}
                            rosterStudents={staffAttendance.rosterStudents}
                            rsvpMap={staffAttendance.rsvpMap}
                            classroomNames={staffAttendance.classroomNames}
                            layout="compact"
                          />
                        )}
                        {audienceUsesProfileSelfRsvp(parseEventAudience(e.audience)) && (
                          <EventProfileAudienceRoster
                            event={e}
                            rows={staffAttendance.profileRowsByEvent[e.id] ?? []}
                            layout="compact"
                          />
                        )}
                      </div>
                    </td>
                  )}
                  {!hideActionsColumn && (
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-1">
                        {canMutateEvent(e) && (
                          <>
                            <button
                              onClick={() => onEdit(e)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" strokeWidth={1.75} />
                            </button>
                            <button
                              onClick={() => onDelete(e.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                              title="Remover"
                            >
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
            {sorted.length === 0 && (
              <tr>
                <td colSpan={emptyColSpan} className="px-6 py-12 text-center text-sm text-muted-foreground">
                  Sem eventos para os filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Eventos;