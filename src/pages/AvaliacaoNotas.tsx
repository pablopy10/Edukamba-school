import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, Loader2, GraduationCap, Users, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useUserRole } from "@/hooks/useUserRole";
import { useStudentSelf } from "@/hooks/useStudentSelf";
import { OFFLINE_SYNC_FLUSH_EVENT, useOfflineSync } from "@/hooks/useOfflineSync";
import { supabaseRestTable } from "@/lib/supabaseRestUrls";
import { showPageKpiCards } from "@/lib/nativeApp";

type AssessmentInfo = {
  id: string;
  title: string;
  type: string;
  date: string;
  weight: number | null;
  classroom_id: string | null;
  subject_id: string | null;
  classroom_name?: string;
  subject_name?: string;
};

type Student = {
  id: string;
  full_name: string;
  enrollment_number: string | null;
  avatar_color: string | null;
};

type GradeRow = {
  id?: string;
  student_id: string;
  score: string;
  teacher_comment: string;
  original_score?: number;
  original_comment?: string;
};

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const formatDateLong = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate().toString().padStart(2, "0")} ${monthNames[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
};

const avatarColorMap: Record<string, string> = {
  blue: "bg-pastel-blue text-pastel-blue-foreground",
  pink: "bg-pastel-pink text-pastel-pink-foreground",
  green: "bg-pastel-green text-pastel-green-foreground",
  yellow: "bg-pastel-yellow text-pastel-yellow-foreground",
  lilac: "bg-pastel-lilac text-pastel-lilac-foreground",
};
const avatarClass = (c?: string | null) => avatarColorMap[c ?? "blue"] ?? avatarColorMap.blue;

const AvaliacaoNotas = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useUserRole();
  const { isStudent, studentId } = useStudentSelf();
  const { isOnline, enqueuePendingSync } = useOfflineSync();
  const readOnly = isStudent || role === "PARENT";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assessment, setAssessment] = useState<AssessmentInfo | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [rows, setRows] = useState<Record<string, GradeRow>>({});
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data: a, error: aErr } = await supabase
      .from("assessments")
      .select("id, title, type, date, weight, classroom_id, subject_id, classrooms:classroom_id(name), subjects:subject_id(name)")
      .eq("id", id)
      .maybeSingle();

    if (aErr || !a) {
      toast({ title: "Erro", description: aErr?.message ?? "Avaliação não encontrada", variant: "destructive" });
      setLoading(false);
      return;
    }

    const info: AssessmentInfo = {
      id: a.id,
      title: a.title,
      type: a.type,
      date: a.date,
      weight: a.weight,
      classroom_id: a.classroom_id,
      subject_id: a.subject_id,
      classroom_name: (a as any).classrooms?.name,
      subject_name: (a as any).subjects?.name,
    };
    setAssessment(info);

    if (!info.classroom_id) {
      setStudents([]);
      setRows({});
      setLoading(false);
      return;
    }

    const [stuRes, gRes] = await Promise.all([
      supabase.from("students").select("id, full_name, enrollment_number, avatar_color").eq("classroom_id", info.classroom_id).order("full_name"),
      supabase.from("grades").select("id, student_id, score, teacher_comment").eq("assessment_id", id),
    ]);

    const studentList = (stuRes.data ?? []) as Student[];
    // Students only see their own row.
    const visible = isStudent && studentId
      ? studentList.filter((s) => s.id === studentId)
      : studentList;
    setStudents(visible);

    const map: Record<string, GradeRow> = {};
    studentList.forEach((s) => {
      map[s.id] = { student_id: s.id, score: "", teacher_comment: "" };
    });
    (gRes.data ?? []).forEach((g: any) => {
      if (map[g.student_id]) {
        map[g.student_id] = {
          id: g.id,
          student_id: g.student_id,
          score: g.score?.toString() ?? "",
          teacher_comment: g.teacher_comment ?? "",
          original_score: g.score,
          original_comment: g.teacher_comment ?? "",
        };
      }
    });
    setRows(map);
    setLoading(false);
  }, [id, isStudent, studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onSynced = () => void load();
    window.addEventListener(OFFLINE_SYNC_FLUSH_EVENT, onSynced);
    return () => window.removeEventListener(OFFLINE_SYNC_FLUSH_EVENT, onSynced);
  }, [load]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      s.full_name.toLowerCase().includes(q) ||
      (s.enrollment_number ?? "").toLowerCase().includes(q)
    );
  }, [students, search]);

  const stats = useMemo(() => {
    const valid = Object.values(rows)
      .map((r) => parseFloat(r.score))
      .filter((n) => !isNaN(n));
    if (valid.length === 0) return { count: 0, avg: 0, max: 0, min: 0, passed: 0 };
    const sum = valid.reduce((a, b) => a + b, 0);
    return {
      count: valid.length,
      avg: sum / valid.length,
      max: Math.max(...valid),
      min: Math.min(...valid),
      passed: valid.filter((n) => n >= 10).length,
    };
  }, [rows]);

  const updateRow = (sid: string, patch: Partial<GradeRow>) => {
    setRows((prev) => ({ ...prev, [sid]: { ...prev[sid], ...patch } }));
  };

  const handleSave = async () => {
    if (!assessment || readOnly) return;
    setSaving(true);

    const toInsert: any[] = [];
    const toUpdate: { id: string; score: number; teacher_comment: string | null }[] = [];
    const toDelete: string[] = [];

    for (const sid of Object.keys(rows)) {
      const r = rows[sid];
      const trimmed = r.score.trim();
      const parsed = trimmed === "" ? NaN : parseFloat(trimmed.replace(",", "."));
      const comment = r.teacher_comment.trim() || null;

      if (r.id) {
        if (isNaN(parsed)) {
          toDelete.push(r.id);
        } else if (parsed !== r.original_score || comment !== (r.original_comment || null)) {
          toUpdate.push({ id: r.id, score: parsed, teacher_comment: comment });
        }
      } else if (!isNaN(parsed)) {
        if (parsed < 0 || parsed > 20) {
          toast({ title: "Nota inválida", description: "As notas devem estar entre 0 e 20.", variant: "destructive" });
          setSaving(false);
          return;
        }
        toInsert.push({
          student_id: sid,
          assessment_id: assessment.id,
          score: parsed,
          teacher_comment: comment,
        });
      }
    }

    // Validate updates range
    for (const u of toUpdate) {
      if (u.score < 0 || u.score > 20) {
        toast({ title: "Nota inválida", description: "As notas devem estar entre 0 e 20.", variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    const gradesBase = supabaseRestTable("grades");

    if (!isOnline) {
      try {
        if (toInsert.length > 0) {
          enqueuePendingSync({
            url: gradesBase,
            method: "POST",
            body: JSON.stringify(toInsert),
          });
        }
        for (const u of toUpdate) {
          if (u.id.startsWith("offline-")) continue;
          enqueuePendingSync({
            url: `${gradesBase}?id=eq.${encodeURIComponent(u.id)}`,
            method: "PATCH",
            body: JSON.stringify({ score: u.score, teacher_comment: u.teacher_comment }),
          });
        }
        const serverDeletes = toDelete.filter((gid) => !gid.startsWith("offline-"));
        if (serverDeletes.length > 0) {
          enqueuePendingSync({
            url: `${gradesBase}?id=in.(${serverDeletes.join(",")})`,
            method: "DELETE",
            body: null,
          });
        }
        toast({ title: "Guardado offline — será sincronizado quando voltar a haver rede." });
        const nextRows = { ...rows };
        toInsert.forEach((row: { student_id: string; score: number; teacher_comment: string | null }) => {
          const sid = row.student_id;
          nextRows[sid] = {
            ...nextRows[sid],
            id: `offline-${crypto.randomUUID()}`,
            score: String(row.score),
            teacher_comment: row.teacher_comment ?? "",
            original_score: row.score,
            original_comment: row.teacher_comment ?? "",
          };
        });
        toUpdate.forEach((u) => {
          const sid = Object.keys(nextRows).find((k) => nextRows[k].id === u.id);
          if (!sid) return;
          nextRows[sid] = {
            ...nextRows[sid],
            score: String(u.score),
            teacher_comment: u.teacher_comment ?? "",
            original_score: u.score,
            original_comment: u.teacher_comment ?? "",
          };
        });
        toDelete.forEach((gid) => {
          const sid = Object.keys(nextRows).find((k) => nextRows[k].id === gid);
          if (!sid) return;
          nextRows[sid] = {
            student_id: sid,
            score: "",
            teacher_comment: "",
          };
        });
        setRows(nextRows);
      } finally {
        setSaving(false);
      }
      return;
    }

    try {
      if (toInsert.length > 0) {
        const { error } = await supabase.from("grades").insert(toInsert);
        if (error) throw error;
      }
      for (const u of toUpdate) {
        const { error } = await supabase
          .from("grades")
          .update({ score: u.score, teacher_comment: u.teacher_comment })
          .eq("id", u.id);
        if (error) throw error;
      }
      if (toDelete.length > 0) {
        const { error } = await supabase.from("grades").delete().in("id", toDelete);
        if (error) throw error;
      }
      toast({ title: "Notas guardadas com sucesso" });
      await load();
    } catch (err: any) {
      toast({ title: "Erro ao guardar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  if (!assessment) {
    return (
      <>
        <div className="rounded-2xl bg-card p-8 text-center shadow-card">
          <p className="text-sm text-muted-foreground">Avaliação não encontrada.</p>
          <button onClick={() => navigate("/avaliacoes")} className="mt-4 inline-flex items-center gap-2 rounded-full bg-pastel-blue px-4 py-2 text-sm font-medium text-pastel-blue-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <button
            onClick={() => navigate("/avaliacoes")}
            className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar para Avaliações
          </button>

          <div className="flex flex-col gap-4 rounded-2xl bg-card p-6 shadow-card sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pastel-blue text-pastel-blue-foreground">
                <GraduationCap className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Atribuir Notas</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">{assessment.title}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[assessment.subject_name, assessment.classroom_name].filter(Boolean).join(" · ")} · {formatDateLong(assessment.date)}
                  {(assessment.weight ?? 0) > 0 ? ` · Peso ${assessment.weight}%` : ""}
                </p>
              </div>
            </div>
            {!readOnly && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex h-11 items-center gap-2 self-start rounded-full bg-pastel-green px-5 text-sm font-semibold text-pastel-green-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-60 sm:self-auto"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "A guardar..." : "Guardar notas"}
            </button>
            )}
          </div>
        </div>

        {/* Stats */}
        {showPageKpiCards() && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatBlock label="Alunos" value={students.length} color="bg-pastel-lilac text-pastel-lilac-foreground" />
          <StatBlock label="Notas dadas" value={stats.count} color="bg-pastel-blue text-pastel-blue-foreground" />
          <StatBlock label="Média" value={stats.count ? stats.avg.toFixed(1) : "—"} color="bg-pastel-yellow text-pastel-yellow-foreground" />
          <StatBlock label="Aprovados" value={stats.count ? `${stats.passed}/${stats.count}` : "—"} color="bg-pastel-green text-pastel-green-foreground" />
          <StatBlock label="Máx / Mín" value={stats.count ? `${stats.max} / ${stats.min}` : "—"} color="bg-pastel-pink text-pastel-pink-foreground" />
        </div>
        )}

        {/* Search */}
        <div className="flex items-center gap-2 rounded-2xl bg-card p-3 shadow-card">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar aluno..."
              className="h-10 w-full rounded-full border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-pastel-blue/40"
            />
          </div>
        </div>

        {/* Grades table */}
        {!assessment.classroom_id ? (
          <div className="rounded-2xl bg-card p-12 text-center shadow-card">
            <p className="text-sm text-muted-foreground">Esta avaliação não está associada a uma turma.</p>
          </div>
        ) : students.length === 0 ? (
          <div className="rounded-2xl bg-card p-12 text-center shadow-card">
            <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">Sem alunos nesta turma.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-card shadow-card">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-base font-bold text-foreground">Alunos da turma</h2>
              <span className="text-xs text-muted-foreground">{filteredStudents.length} de {students.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-6 py-3 w-10">#</th>
                    <th className="px-6 py-3">Aluno</th>
                    <th className="px-6 py-3 w-32">Nº</th>
                    <th className="px-6 py-3 w-32">Nota (0-20)</th>
                    <th className="px-6 py-3">Comentário</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((s, idx) => {
                    const r = rows[s.id];
                    const parsed = parseFloat(r?.score ?? "");
                    const valid = !isNaN(parsed);
                    const passed = valid && parsed >= 10;
                    const failed = valid && parsed < 10;
                    const initials = s.full_name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
                    return (
                      <tr key={s.id} className="border-b border-border/60 text-sm transition-colors hover:bg-muted/30">
                        <td className="px-6 py-4 text-muted-foreground">{idx + 1}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <span className={cn("flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold", avatarClass(s.avatar_color))}>
                              {initials}
                            </span>
                            <span className="font-semibold text-foreground">{s.full_name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">{s.enrollment_number ?? "—"}</td>
                        <td className="px-6 py-4">
                          <input
                            type="number"
                            min={0}
                            max={20}
                            step={0.1}
                            value={r?.score ?? ""}
                            onChange={(e) => updateRow(s.id, { score: e.target.value })}
                            placeholder="—"
                            readOnly={readOnly}
                            disabled={readOnly}
                            className={cn(
                              "h-10 w-24 rounded-full border bg-background px-4 text-center text-sm font-semibold text-foreground focus:outline-none focus:ring-2",
                              passed && "border-pastel-green-foreground/40 bg-pastel-green/30 focus:ring-pastel-green-foreground/40",
                              failed && "border-pastel-pink-foreground/40 bg-pastel-pink/30 focus:ring-pastel-pink-foreground/40",
                              !valid && "border-border focus:ring-pastel-blue/40"
                            )}
                          />
                        </td>
                        <td className="px-6 py-4">
                          <input
                            type="text"
                            value={r?.teacher_comment ?? ""}
                            onChange={(e) => updateRow(s.id, { teacher_comment: e.target.value })}
                            placeholder="Comentário (opcional)"
                            readOnly={readOnly}
                            disabled={readOnly}
                            className="h-10 w-full rounded-full border border-border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-pastel-blue/40"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

const StatBlock = ({ label, value, color }: { label: string; value: string | number; color: string }) => (
  <div className="rounded-2xl bg-card p-5 shadow-card">
    <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-medium", color)}>{label}</span>
    <p className="mt-3 text-3xl font-bold text-foreground">{value}</p>
  </div>
);

export default AvaliacaoNotas;