import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocaleTagFromLng } from "@/lib/intlLocale";
import { Plus, Trash2, Pencil, Loader2, CalendarRange, Palmtree, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Term = {
  id: string;
  term_number: number;
  name: string;
  start_date: string;
  end_date: string;
};

type Holiday = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  description: string | null;
};


interface Props {
  schoolId: string | null;
  academicYearId: string | null;
  isAdmin: boolean;
}

export const TermsAndHolidaysManager = ({ schoolId, academicYearId, isAdmin }: Props) => {
  const { t: tr, i18n } = useTranslation("pages", { keyPrefix: "definicoes" });
  const TERM_DEFAULTS = useMemo(
    () => [
      { term_number: 1, name: tr("terms.defaults.term1") },
      { term_number: 2, name: tr("terms.defaults.term2") },
      { term_number: 3, name: tr("terms.defaults.term3") },
    ],
    [tr],
  );
  const fmtRange = (a: string, b: string) => {
    const locale = intlLocaleTagFromLng(i18n.language);
    const f = (s: string) =>
      new Date(s + "T00:00:00").toLocaleDateString(locale, { day: "2-digit", month: "short" });
    return `${f(a)} → ${f(b)}`;
  };
  const [loading, setLoading] = useState(true);
  const [terms, setTerms] = useState<Term[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  // term editor (we always show 3 rows, even if not yet created)
  const [termDrafts, setTermDrafts] = useState<Record<number, { name: string; start_date: string; end_date: string }>>({});
  const [savingTermNumber, setSavingTermNumber] = useState<number | null>(null);

  // holiday form
  const [editingHoliday, setEditingHoliday] = useState<Partial<Holiday> | null>(null);
  const [savingHoliday, setSavingHoliday] = useState(false);

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    let termsQuery = supabase
      .from("academic_terms")
      .select("id, term_number, name, start_date, end_date")
      .eq("school_id", schoolId)
      .order("term_number");
    let holidaysQuery = supabase
      .from("school_holidays")
      .select("id, name, start_date, end_date, description")
      .eq("school_id", schoolId)
      .order("start_date");
    if (academicYearId) {
      termsQuery = termsQuery.eq("academic_year_id", academicYearId);
      holidaysQuery = holidaysQuery.eq("academic_year_id", academicYearId);
    } else {
      // No academic year selected → show only legacy entries with no year
      termsQuery = termsQuery.is("academic_year_id", null);
      holidaysQuery = holidaysQuery.is("academic_year_id", null);
    }
    const [tRes, hRes] = await Promise.all([termsQuery, holidaysQuery]);
    const fetched = (tRes.data ?? []) as Term[];
    setTerms(fetched);
    setHolidays((hRes.data ?? []) as Holiday[]);

    // seed drafts
    const drafts: typeof termDrafts = {};
    for (const def of TERM_DEFAULTS) {
      const existing = fetched.find((t) => t.term_number === def.term_number);
      drafts[def.term_number] = {
        name: existing?.name ?? def.name,
        start_date: existing?.start_date ?? "",
        end_date: existing?.end_date ?? "",
      };
    }
    setTermDrafts(drafts);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, academicYearId]);

  const updateTermDraft = (n: number, field: "name" | "start_date" | "end_date", value: string) => {
    setTermDrafts((prev) => ({
      ...prev,
      [n]: { ...prev[n], [field]: value },
    }));
  };

  const saveTerm = async (n: number) => {
    if (!schoolId) return;
    const draft = termDrafts[n];
    if (!draft?.name?.trim() || !draft.start_date || !draft.end_date) {
      toast({ title: tr("validation.terms_fields"), variant: "destructive" });
      return;
    }
    if (draft.start_date > draft.end_date) {
      toast({ title: tr("validation.dates_order"), variant: "destructive" });
      return;
    }
    setSavingTermNumber(n);
    const existing = terms.find((t) => t.term_number === n);
    const payload = {
      school_id: schoolId,
      academic_year_id: academicYearId,
      term_number: n,
      name: draft.name.trim(),
      start_date: draft.start_date,
      end_date: draft.end_date,
    };
    const { error } = existing
      ? await supabase.from("academic_terms").update(payload).eq("id", existing.id)
      : await supabase.from("academic_terms").insert(payload);
    setSavingTermNumber(null);
    if (error) {
      toast({ title: tr("toasts.term_error_title"), description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: tr("toasts.term_saved_title", { name: draft.name }) });
    load();
  };

  const removeTerm = async (n: number) => {
    const existing = terms.find((t) => t.term_number === n);
    if (!existing) return;
    if (!confirm(tr("terms.confirm_remove_term", { name: existing.name }))) return;
    const { error } = await supabase.from("academic_terms").delete().eq("id", existing.id);
    if (error) {
      toast({ title: tr("toasts.generic_error_title"), description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: tr("toasts.term_removed") });
    load();
  };

  const openNewHoliday = () => {
    setEditingHoliday({ name: "", start_date: "", end_date: "", description: "" });
  };

  const saveHoliday = async () => {
    if (!schoolId || !editingHoliday) return;
    if (!editingHoliday.name?.trim() || !editingHoliday.start_date || !editingHoliday.end_date) {
      toast({ title: tr("validation.holiday_fields"), variant: "destructive" });
      return;
    }
    if (editingHoliday.start_date > editingHoliday.end_date) {
      toast({ title: tr("validation.dates_order"), variant: "destructive" });
      return;
    }
    setSavingHoliday(true);
    const payload = {
      school_id: schoolId,
      academic_year_id: academicYearId,
      name: editingHoliday.name.trim(),
      start_date: editingHoliday.start_date,
      end_date: editingHoliday.end_date,
      description: editingHoliday.description?.trim() || null,
    };
    const { error } = editingHoliday.id
      ? await supabase.from("school_holidays").update(payload).eq("id", editingHoliday.id)
      : await supabase.from("school_holidays").insert(payload);
    setSavingHoliday(false);
    if (error) {
      toast({ title: tr("toasts.generic_error_title"), description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editingHoliday.id ? tr("toasts.holiday_updated") : tr("toasts.holiday_created") });
    setEditingHoliday(null);
    load();
  };

  const removeHoliday = async (id: string) => {
    if (!confirm(tr("terms.confirm_remove_holiday"))) return;
    const { error } = await supabase.from("school_holidays").delete().eq("id", id);
    if (error) {
      toast({ title: tr("toasts.generic_error_title"), description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: tr("toasts.holidays_removed") });
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {!academicYearId && (
        <div className="rounded-xl border border-pastel-yellow/60 bg-pastel-yellow/20 p-3 text-xs text-pastel-yellow-foreground">
          {tr("terms.banner_select_year")}
        </div>
      )}
      {academicYearId && (
        <div className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
          {tr("terms.banner_year_scope")}
        </div>
      )}
      {/* TRIMESTRES */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-5 w-5 text-pastel-blue-foreground" strokeWidth={1.75} />
          <h3 className="text-base font-bold text-foreground">{tr("terms.terms_heading")}</h3>
          <span className="rounded-full bg-pastel-blue/40 px-2 py-0.5 text-[11px] font-medium text-pastel-blue-foreground">
            {tr("terms.terms_badge")}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {tr("terms.terms_help")}
        </p>

        <div className="flex flex-col gap-3">
          {TERM_DEFAULTS.map(({ term_number }) => {
            const existing = terms.find((t) => t.term_number === term_number);
            const draft = termDrafts[term_number] ?? { name: "", start_date: "", end_date: "" };
            return (
              <div
                key={term_number}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-end"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pastel-lilac text-sm font-bold text-pastel-lilac-foreground">
                  {term_number}
                  {tr("terms.term_ordinal_suffix")}
                </div>
                <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{tr("terms.label_name")}</label>
                    <input
                      type="text"
                      disabled={!isAdmin}
                      value={draft.name}
                      onChange={(e) => updateTermDraft(term_number, "name", e.target.value)}
                      className="h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-pastel-blue/40"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{tr("terms.label_start")}</label>
                    <input
                      type="date"
                      disabled={!isAdmin}
                      value={draft.start_date}
                      onChange={(e) => updateTermDraft(term_number, "start_date", e.target.value)}
                      className="h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-pastel-blue/40"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{tr("terms.label_end")}</label>
                    <input
                      type="date"
                      disabled={!isAdmin}
                      value={draft.end_date}
                      onChange={(e) => updateTermDraft(term_number, "end_date", e.target.value)}
                      className="h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-pastel-blue/40"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={!isAdmin || savingTermNumber === term_number}
                    onClick={() => saveTerm(term_number)}
                    className="flex h-10 items-center gap-2 rounded-full bg-pastel-blue px-4 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {savingTermNumber === term_number ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" strokeWidth={1.75} />
                    )}
                    {existing ? tr("shared.atualizar") : tr("shared.guardar")}
                  </button>
                  {existing && isAdmin && (
                    <button
                      onClick={() => removeTerm(term_number)}
                      className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-pastel-pink/40 hover:text-pastel-pink-foreground"
                      title={tr("terms.btn_remove_term_title")}
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* FÉRIAS */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Palmtree className="h-5 w-5 text-pastel-yellow-foreground" strokeWidth={1.75} />
            <h3 className="text-base font-bold text-foreground">{tr("terms.holidays_heading")}</h3>
          </div>
          {isAdmin && (
            <button
              onClick={openNewHoliday}
              className="flex h-10 items-center gap-2 rounded-full bg-pastel-yellow px-4 text-sm font-semibold text-pastel-yellow-foreground shadow-soft transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              {tr("terms.btn_add_holiday")}
            </button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {tr("terms.holidays_help")}
        </p>

        {holidays.length === 0 ? (
          <p className="rounded-xl bg-muted/50 p-4 text-center text-sm text-muted-foreground">
            {tr("terms.holidays_empty")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {holidays.map((h) => (
              <div key={h.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pastel-yellow text-pastel-yellow-foreground">
                  <Palmtree className="h-4 w-4" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{h.name}</p>
                  <p className="text-xs text-muted-foreground">{fmtRange(h.start_date, h.end_date)}</p>
                  {h.description && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{h.description}</p>}
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingHoliday(h)}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-pastel-yellow/40 hover:text-pastel-yellow-foreground"
                      title={tr("terms.action_edit_title")}
                    >
                      <Pencil className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                    <button
                      onClick={() => removeHoliday(h.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-pastel-pink/40 hover:text-pastel-pink-foreground"
                      title={tr("terms.action_remove_title")}
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Inline editor */}
        {editingHoliday && (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground">
                {editingHoliday.id ? tr("terms.editor_edit_title") : tr("terms.editor_new_title")}
              </h4>
              <button
                onClick={() => setEditingHoliday(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Nome</label>
                <input
                  type="text"
                  value={editingHoliday.name ?? ""}
                  onChange={(e) => setEditingHoliday((p) => p && { ...p, name: e.target.value })}
                  placeholder={tr("terms.placeholder_holiday_name")}
                  className="h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-pastel-yellow/40"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Início</label>
                <input
                  type="date"
                  value={editingHoliday.start_date ?? ""}
                  onChange={(e) => setEditingHoliday((p) => p && { ...p, start_date: e.target.value })}
                  className="h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-pastel-yellow/40"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Fim</label>
                <input
                  type="date"
                  value={editingHoliday.end_date ?? ""}
                  onChange={(e) => setEditingHoliday((p) => p && { ...p, end_date: e.target.value })}
                  className="h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-pastel-yellow/40"
                />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{tr("terms.field_description")}</label>
                <input
                  type="text"
                  value={editingHoliday.description ?? ""}
                  onChange={(e) => setEditingHoliday((p) => p && { ...p, description: e.target.value })}
                  placeholder={tr("terms.placeholder_holiday_notes")}
                  className="h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-pastel-yellow/40"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setEditingHoliday(null)}
                className="h-10 rounded-full px-4 text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                {tr("shared.cancel")}
              </button>
              <button
                onClick={saveHoliday}
                disabled={savingHoliday}
                className={cn(
                  "flex h-10 items-center gap-2 rounded-full bg-pastel-yellow px-4 text-sm font-semibold text-pastel-yellow-foreground shadow-soft transition-opacity hover:opacity-90",
                  savingHoliday && "opacity-70",
                )}
              >
                {savingHoliday ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" strokeWidth={1.75} />}
                {tr("shared.guardar")}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};