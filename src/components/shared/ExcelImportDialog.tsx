import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, UploadCloud, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ImportField = {
  /** internal key returned in mapped rows */
  key: string;
  /** label shown to user */
  label: string;
  required?: boolean;
  /** suggestions for auto-mapping (lowercase, accent-insensitive matched) */
  aliases?: string[];
  /** example value displayed in the template */
  example?: string;
};

type Step = "upload" | "map" | "result";

export type ImportResult = { ok: number; failed: { row: number; error: string }[] };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  fields: ImportField[];
  /** Sheet name used for the downloadable template */
  templateSheetName?: string;
  /** Process a single mapped row. Throw to mark as failed. */
  onImportRow: (row: Record<string, string>) => Promise<void>;
  onCompleted?: () => void;
}

const norm = (s: string) =>
  s.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export const ExcelImportDialog = ({
  open, onOpenChange, title, description, fields, templateSheetName = "Dados", onImportRow, onCompleted,
}: Props) => {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({}); // fieldKey -> excel header
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("upload"); setFileName(""); setHeaders([]); setRows([]);
    setMapping({}); setImporting(false); setProgress(0); setResult(null);
  };

  const close = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const autoMap = (hdrs: string[]) => {
    const m: Record<string, string> = {};
    fields.forEach((f) => {
      const candidates = [f.label, f.key, ...(f.aliases ?? [])].map(norm);
      const found = hdrs.find((h) => candidates.includes(norm(h)));
      if (found) m[f.key] = found;
    });
    setMapping(m);
  };

  const handleFile = async (file: File) => {
    try {
      setFileName(file.name);
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "", raw: false });
      if (!json.length) {
        toast({ title: "Ficheiro vazio", description: "Não foram encontradas linhas.", variant: "destructive" });
        return;
      }
      const hdrs = Object.keys(json[0]);
      setHeaders(hdrs);
      setRows(json);
      autoMap(hdrs);
      setStep("map");
    } catch (e: any) {
      toast({ title: "Erro a ler ficheiro", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0]; if (file) handleFile(file);
  };

  const downloadTemplate = () => {
    const headerRow = fields.map((f) => f.label);
    const exampleRow = fields.map((f) => f.example ?? "");
    const ws = XLSX.utils.aoa_to_sheet([headerRow, exampleRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, templateSheetName);
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `modelo-${templateSheetName.toLowerCase()}-${stamp}.xlsx`);
  };

  const missingRequired = useMemo(
    () => fields.filter((f) => f.required && !mapping[f.key]),
    [fields, mapping],
  );

  const startImport = async () => {
    if (missingRequired.length) {
      toast({ title: "Mapeamento incompleto", description: `Faltam: ${missingRequired.map((f) => f.label).join(", ")}`, variant: "destructive" });
      return;
    }
    setImporting(true);
    setProgress(0);
    const failed: ImportResult["failed"] = [];
    let ok = 0;
    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const mapped: Record<string, string> = {};
      fields.forEach((f) => {
        const col = mapping[f.key];
        const value = col ? String(raw[col] ?? "").trim() : "";
        mapped[f.key] = value;
      });
      try {
        await onImportRow(mapped);
        ok++;
      } catch (e: any) {
        failed.push({ row: i + 2, error: e?.message ?? String(e) });
      }
      setProgress(Math.round(((i + 1) / rows.length) * 100));
    }
    setResult({ ok, failed });
    setImporting(false);
    setStep("result");
    if (ok > 0) onCompleted?.();
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-pastel-blue-foreground" />
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-colors",
                dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/60 hover:bg-muted/40",
              )}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-pastel-blue text-pastel-blue-foreground">
                <UploadCloud className="h-7 w-7" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Arraste o ficheiro Excel aqui</p>
                <p className="text-xs text-muted-foreground">ou clique para escolher (.xlsx, .xls, .csv)</p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>

            <div className="flex items-center justify-between rounded-xl bg-muted/40 p-4">
              <div>
                <p className="text-sm font-medium text-foreground">Não tem um ficheiro?</p>
                <p className="text-xs text-muted-foreground">Descarregue o nosso modelo já preparado.</p>
              </div>
              <Button variant="outline" onClick={downloadTemplate} className="gap-2">
                <Download className="h-4 w-4" /> Modelo
              </Button>
            </div>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-pastel-green/30 p-3 text-sm">
              <span className="font-medium text-foreground">{fileName}</span>
              <span className="text-muted-foreground">{rows.length} linhas detectadas</span>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-foreground">Associe as colunas do ficheiro aos campos:</p>
              <div className="space-y-2">
                {fields.map((f) => (
                  <div key={f.key} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-2">
                    <Label className="flex items-center gap-1">
                      {f.label}
                      {f.required && <span className="text-destructive">*</span>}
                    </Label>
                    <Select
                      value={mapping[f.key] ?? "__none__"}
                      onValueChange={(v) => setMapping((p) => ({ ...p, [f.key]: v === "__none__" ? "" : v }))}
                    >
                      <SelectTrigger><SelectValue placeholder="— ignorar —" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— ignorar —</SelectItem>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div>
              <p className="mb-2 text-sm font-semibold text-foreground">Pré-visualização (3 primeiras linhas):</p>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted text-left">
                    <tr>
                      {fields.filter((f) => mapping[f.key]).map((f) => (
                        <th key={f.key} className="px-3 py-2 font-semibold">{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 3).map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        {fields.filter((f) => mapping[f.key]).map((f) => (
                          <td key={f.key} className="px-3 py-2">{String(r[mapping[f.key]] ?? "")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {importing && (
              <div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-pastel-blue-foreground transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">A importar... {progress}%</p>
              </div>
            )}
          </div>
        )}

        {step === "result" && result && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-pastel-green/40 p-4">
                <CheckCircle2 className="h-5 w-5 text-pastel-green-foreground" />
                <p className="mt-2 text-2xl font-bold text-foreground">{result.ok}</p>
                <p className="text-xs text-muted-foreground">Importados com sucesso</p>
              </div>
              <div className="rounded-2xl bg-pastel-pink/40 p-4">
                <XCircle className="h-5 w-5 text-pastel-pink-foreground" />
                <p className="mt-2 text-2xl font-bold text-foreground">{result.failed.length}</p>
                <p className="text-xs text-muted-foreground">Falharam</p>
              </div>
            </div>
            {result.failed.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted text-left">
                    <tr><th className="px-3 py-2">Linha</th><th className="px-3 py-2">Erro</th></tr>
                  </thead>
                  <tbody>
                    {result.failed.map((f, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-2">{f.row}</td>
                        <td className="px-3 py-2 text-destructive">{f.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "upload" && (
            <Button variant="outline" onClick={() => close(false)}>Cancelar</Button>
          )}
          {step === "map" && (
            <>
              <Button variant="outline" onClick={reset} disabled={importing}>Voltar</Button>
              <Button onClick={startImport} disabled={importing}>
                {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Importar {rows.length} linhas
              </Button>
            </>
          )}
          {step === "result" && (
            <>
              <Button variant="outline" onClick={reset}>Importar outro</Button>
              <Button onClick={() => close(false)}>Concluir</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};