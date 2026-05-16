import { useEffect, useMemo, useState } from "react";
import { Search, Filter, Plus, Pencil, Trash2, Contact, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { SubjectFormDialog, type SubjectRow } from "@/components/disciplinas/SubjectFormDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExcelImportDialog, type ImportField } from "@/components/shared/ExcelImportDialog";
import { NativeMobileFabPortal } from "@/components/dashboard/NativeMobileFabPortal";
import { isNativeMobileApp, NATIVE_MOBILE_FAB_BUTTON_CLASSNAME } from "@/lib/nativeApp";
import { Button } from "@/components/ui/button";
import { effectiveSchoolIdFromProfile } from "@/lib/effectiveTenant";

const colorPalette = ["lilac", "blue", "yellow", "green", "pink"] as const;
const colorStyles: Record<typeof colorPalette[number], string> = {
  lilac: "bg-pastel-lilac text-pastel-lilac-foreground",
  blue: "bg-pastel-blue text-pastel-blue-foreground",
  yellow: "bg-pastel-yellow text-pastel-yellow-foreground",
  green: "bg-pastel-green text-pastel-green-foreground",
  pink: "bg-pastel-pink text-pastel-pink-foreground",
};

const Disciplinas = () => {
  const native = isNativeMobileApp();
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [codeFilter, setCodeFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SubjectRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const fetchSubjects = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("subjects")
      .select("id, name, code, school_id")
      .order("name", { ascending: true });
    if (error) {
      toast({ title: "Erro a carregar disciplinas", description: error.message, variant: "destructive" });
    } else {
      setSubjects((data ?? []) as SubjectRow[]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchSubjects(); }, []);

  const codePrefixes = useMemo(() => {
    const set = new Set<string>();
    subjects.forEach((s) => {
      const prefix = s.code?.split("-")[0];
      if (prefix) set.add(prefix);
    });
    return Array.from(set).sort();
  }, [subjects]);

  const filtered = useMemo(() => {
    return subjects.filter((s) => {
      const term = search.toLowerCase();
      const matchSearch = !term ||
        s.name.toLowerCase().includes(term) ||
        (s.code ?? "").toLowerCase().includes(term);
      const matchCode = codeFilter === "all" || (s.code ?? "").startsWith(codeFilter);
      return matchSearch && matchCode;
    });
  }, [subjects, search, codeFilter]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  const allSelected = filtered.length > 0 && selected.length === filtered.length;
  const toggleAll = () => setSelected(allSelected ? [] : filtered.map((s) => s.id));

  const handleEdit = (s: SubjectRow) => { setEditing(s); setDialogOpen(true); };
  const handleNew = () => { setEditing(null); setDialogOpen(true); };

  const importFields: ImportField[] = [
    { key: "name", label: "Nome", required: true, aliases: ["disciplina", "nome da disciplina"], example: "Matemática" },
    { key: "code", label: "Código", aliases: ["codigo", "cod"], example: "MAT-01" },
  ];

  const handleImportRow = async (row: Record<string, string>) => {
    const name = row.name?.trim();
    if (!name) throw new Error("Nome é obrigatório");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Sessão inválida");
    const { data: profile } = await supabase
      .from("profiles")
      .select("school_id, support_context_school_id")
      .eq("id", user.id)
      .maybeSingle();
    const sid = effectiveSchoolIdFromProfile(profile);
    if (!sid) throw new Error("Escola não encontrada");
    const { error } = await supabase.from("subjects").insert({
      name,
      code: row.code?.trim() || null,
      school_id: sid,
    });
    if (error) throw new Error(error.message);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("subjects").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Erro ao eliminar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Disciplina eliminada" });
      setSubjects((prev) => prev.filter((s) => s.id !== deleteId));
      setSelected((prev) => prev.filter((id) => id !== deleteId));
    }
    setDeleteId(null);
  };

  const handleBulkDelete = async () => {
    if (selected.length === 0) return;
    const { error } = await supabase.from("subjects").delete().in("id", selected);
    if (error) {
      toast({ title: "Erro ao eliminar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${selected.length} disciplina(s) eliminada(s)` });
      setSubjects((prev) => prev.filter((s) => !selected.includes(s.id)));
      setSelected([]);
    }
  };

  const renderSubjectCard = (s: SubjectRow, idx: number) => {
    const isSelected = selected.includes(s.id);
    const color = colorPalette[idx % colorPalette.length];
    return (
      <div
        key={s.id}
        className={cn(
          "rounded-2xl border border-border bg-background p-4 shadow-soft transition-colors",
          isSelected ? "border-pastel-blue/60 bg-pastel-blue/10" : "hover:bg-muted/30",
        )}
      >
        <div className="flex gap-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggle(s.id)}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-pastel-blue-foreground"
            aria-label={`Seleccionar ${s.name}`}
          />
          <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", colorStyles[color])}>
            <Contact className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">{s.name}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-xs font-medium text-foreground">Código: {s.code ?? "—"}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <button
              type="button"
              onClick={() => handleEdit(s)}
              title="Editar"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-yellow/50 hover:text-pastel-yellow-foreground"
            >
              <Pencil className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => setDeleteId(s.id)}
              title="Eliminar"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-pink/50 hover:text-pastel-pink-foreground"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className={cn("flex flex-col gap-6", native && "relative pb-28")}>
        <div className={cn("flex flex-col gap-4", native ? "" : "sm:flex-row sm:items-center sm:justify-between")}>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Disciplinas</h1>
            <p className="text-sm text-muted-foreground">Faça a gestão das disciplinas leccionadas.</p>
          </div>
          <div className={cn("flex flex-wrap items-center gap-3", native && "w-full")}>
            <div className={cn("relative", native ? "min-w-0 flex-1" : "")}>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                type="text"
                placeholder="Pesquisar disciplina..."
                className={cn(
                  "h-11 rounded-full border border-border bg-card pl-11 pr-4 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20",
                  native ? "w-full min-w-0" : "w-72",
                )}
              />
            </div>
            <Select value={codeFilter} onValueChange={setCodeFilter}>
              <SelectTrigger className={cn("h-11 rounded-full border-border bg-card", native ? "w-full min-w-0" : "w-[160px]")}>
                <Filter className="mr-1 h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Filtrar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os códigos</SelectItem>
                {codePrefixes.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!native && (
            <>
            <button
              onClick={handleNew}
              className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
            >
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              Nova Disciplina
            </button>
            <button
              onClick={() => setImportOpen(true)}
              className="flex h-11 items-center gap-2 rounded-full bg-pastel-green px-5 text-sm font-semibold text-pastel-green-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
            >
              <Upload className="h-4 w-4" strokeWidth={2.25} />
              Importar Excel
            </button>
            </>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="text-lg font-bold text-foreground">Lista de Disciplinas</h2>
            {selected.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{selected.length} selecionada(s)</span>
                <button
                  onClick={handleBulkDelete}
                  className="rounded-full bg-pastel-pink px-3 py-1.5 text-xs font-medium text-pastel-pink-foreground hover:opacity-90"
                >
                  Eliminar
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {subjects.length === 0 ? "Ainda não há disciplinas. Crie a primeira." : "Nenhuma disciplina corresponde aos filtros."}
            </div>
          ) : native ? (
            <div className="flex flex-col gap-3 p-4">
              {filtered.length > 0 && (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 cursor-pointer rounded border-border accent-pastel-blue-foreground"
                  />
                  Seleccionar todos ({filtered.length})
                </label>
              )}
              {filtered.map((s, i) => renderSubjectCard(s, i))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-pastel-blue/40 text-left text-xs uppercase tracking-wider text-pastel-blue-foreground">
                    <th className="w-12 py-4 pl-5">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="h-4 w-4 cursor-pointer rounded border-border accent-pastel-blue-foreground"
                      />
                    </th>
                    <th className="py-4 pr-4 font-semibold">Disciplina</th>
                    <th className="py-4 pr-4 font-semibold">Código</th>
                    <th className="py-4 pr-5 font-semibold text-right">Acções</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, idx) => {
                    const isSelected = selected.includes(s.id);
                    const color = colorPalette[idx % colorPalette.length];
                    return (
                      <tr
                        key={s.id}
                        className={cn(
                          "border-b border-border last:border-0 transition-colors",
                          isSelected ? "bg-pastel-blue/15" : "hover:bg-muted/40",
                        )}
                      >
                        <td className="py-4 pl-5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggle(s.id)}
                            className="h-4 w-4 cursor-pointer rounded border-border accent-pastel-blue-foreground"
                          />
                        </td>
                        <td className="py-4 pr-4">
                          <div className="flex items-center gap-3">
                            <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", colorStyles[color])}>
                              <Contact className="h-5 w-5" strokeWidth={1.75} />
                            </div>
                            <p className="font-semibold text-foreground">{s.name}</p>
                          </div>
                        </td>
                        <td className="py-4 pr-4 text-foreground">{s.code ?? "—"}</td>
                        <td className="py-4 pr-5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleEdit(s)}
                              title="Editar"
                              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-yellow/50 hover:text-pastel-yellow-foreground"
                            >
                              <Pencil className="h-4 w-4" strokeWidth={1.75} />
                            </button>
                            <button
                              onClick={() => setDeleteId(s.id)}
                              title="Eliminar"
                              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-pink/50 hover:text-pastel-pink-foreground"
                            >
                              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border p-5">
            <p className="text-xs text-muted-foreground">
              {filtered.length} de {subjects.length} disciplina(s)
            </p>
          </div>
        </div>
      </div>

      {native && (
        <NativeMobileFabPortal>
          <Button
            type="button"
            size="icon"
            className={NATIVE_MOBILE_FAB_BUTTON_CLASSNAME}
            aria-label="Nova disciplina"
            onClick={handleNew}
          >
            <Plus className="h-6 w-6" />
          </Button>
        </NativeMobileFabPortal>
      )}

      <SubjectFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        subject={editing}
        onSaved={fetchSubjects}
      />

      {!native && (
      <ExcelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importar Disciplinas"
        description="Importe disciplinas a partir de um ficheiro Excel."
        templateSheetName="Disciplinas"
        fields={importFields}
        onImportRow={handleImportRow}
        onCompleted={fetchSubjects}
      />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar disciplina?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acção é irreversível. A disciplina será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default Disciplinas;