/**
 * PdfFieldEditor — Visual editor for placing signature / text fields on a PDF.
 *
 * How to use:
 *   1. Upload a PDF → gets a public URL → pass as `pdfUrl`
 *   2. Choose a tool (Signature | Text field) from the toolbar
 *   3. Click and drag on any PDF page to draw a field box
 *   4. Click an existing field to select it; drag to reposition it
 *   5. Press "Save" → returns `FieldDef[]` with page+% coordinates
 *
 * Coordinates are stored as percentages of page width/height so they are
 * scale-independent when embedding the signature via pdf-lib at sign time.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import {
  PenLine, Type, Trash2, Save, Loader2, X, MousePointer, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { nanoid } from "nanoid";

// Use unpkg CDN worker — avoids Vite worker-bundling issues
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// ─── Types ────────────────────────────────────────────────────────────────────

export type FieldType = "signature" | "text";

export interface FieldDef {
  id: string;
  type: FieldType;
  page: number;   // 1-indexed PDF page number
  x: number;      // left edge, % of page width
  y: number;      // top edge,  % of page height
  w: number;      // width,     % of page width
  h: number;      // height,    % of page height
  label: string;
}

interface Props {
  pdfUrl: string;
  initialFields?: FieldDef[];
  onSave: (fields: FieldDef[]) => void;
  onCancel: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TOOL_META: Record<FieldType, { label: string; color: string; border: string; icon: typeof PenLine }> = {
  signature: { label: "Assinatura", color: "bg-pastel-blue/20", border: "border-pastel-blue", icon: PenLine },
  text: { label: "Campo de texto", color: "bg-pastel-yellow/20", border: "border-pastel-yellow", icon: Type },
};

const MIN_PCT = 1; // minimum field size in % (avoids accidental tiny fields)

// ─── Drag state (in a ref to avoid re-renders during drag) ────────────────────

type DragOp =
  | { op: "drawing"; page: number; sx: number; sy: number; ex: number; ey: number }
  | { op: "moving";  id: string;   ox: number; oy: number }; // ox/oy = offset within field

// ─── Component ────────────────────────────────────────────────────────────────

export function PdfFieldEditor({ pdfUrl, initialFields, onSave, onCancel }: Props) {
  const [pages, setPages] = useState<{ num: number; dataUrl: string; w: number; h: number }[]>([]);
  const [loadingPdf, setLoadingPdf] = useState(true);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldDef[]>(initialFields ?? []);
  const [activeTool, setActiveTool] = useState<FieldType | "select">("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ page: number; sx: number; sy: number; ex: number; ey: number } | null>(null);

  const dragRef = useRef<DragOp | null>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // ── Load PDF ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoadingPdf(true);
    setPdfError(null);

    (async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({ url: pdfUrl, withCredentials: false });
        const pdf = await loadingTask.promise;
        const rendered: typeof pages = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (!cancelled) {
            rendered.push({
              num: i,
              dataUrl: canvas.toDataURL("image/jpeg", 0.92),
              w: viewport.width,
              h: viewport.height,
            });
          }
        }
        if (!cancelled) setPages(rendered);
      } catch (e) {
        if (!cancelled) setPdfError(String(e));
      } finally {
        if (!cancelled) setLoadingPdf(false);
      }
    })();

    return () => { cancelled = true; };
  }, [pdfUrl]);

  // ── Coordinate helpers ───────────────────────────────────────────────────────
  const getRelCoords = useCallback((pageNum: number, clientX: number, clientY: number) => {
    const el = pageRefs.current[pageNum];
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top)  / rect.height) * 100,
    };
  }, []);

  // ── Pointer events ────────────────────────────────────────────────────────
  const handlePagePointerDown = useCallback((e: React.PointerEvent, pageNum: number) => {
    // Only primary button
    if (e.button !== 0) return;
    // Ignore clicks on existing field divs (they handle their own pointerdown)
    if ((e.target as HTMLElement).closest("[data-field-id]")) return;

    if (activeTool === "select") {
      setSelectedId(null);
      return;
    }

    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const coords = getRelCoords(pageNum, e.clientX, e.clientY);
    if (!coords) return;

    dragRef.current = { op: "drawing", page: pageNum, sx: coords.x, sy: coords.y, ex: coords.x, ey: coords.y };
    setDraft({ page: pageNum, sx: coords.x, sy: coords.y, ex: coords.x, ey: coords.y });
  }, [activeTool, getRelCoords]);

  const handlePagePointerMove = useCallback((e: React.PointerEvent, pageNum: number) => {
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.op === "drawing" && drag.page === pageNum) {
      const coords = getRelCoords(pageNum, e.clientX, e.clientY);
      if (!coords) return;
      dragRef.current = { ...drag, ex: coords.x, ey: coords.y };
      setDraft({ page: pageNum, sx: drag.sx, sy: drag.sy, ex: coords.x, ey: coords.y });
    }

    if (drag.op === "moving") {
      const coords = getRelCoords(pageNum, e.clientX, e.clientY);
      if (!coords) return;
      setFields((prev) =>
        prev.map((f) => {
          if (f.id !== drag.id || f.page !== pageNum) return f;
          return {
            ...f,
            x: Math.max(0, Math.min(100 - f.w, coords.x - drag.ox)),
            y: Math.max(0, Math.min(100 - f.h, coords.y - drag.oy)),
          };
        }),
      );
    }
  }, [getRelCoords]);

  const handlePagePointerUp = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.op === "drawing") {
      const x = Math.min(drag.sx, drag.ex);
      const y = Math.min(drag.sy, drag.ey);
      const w = Math.abs(drag.ex - drag.sx);
      const h = Math.abs(drag.ey - drag.sy);

      if (w > MIN_PCT && h > MIN_PCT && activeTool !== "select") {
        const type = activeTool;
        const newField: FieldDef = {
          id: nanoid(8),
          type,
          page: drag.page,
          x, y, w, h,
          label: type === "signature" ? "Assinatura" : "Campo de texto",
        };
        setFields((prev) => [...prev, newField]);
        setSelectedId(newField.id);
      }
      setDraft(null);
    }

    dragRef.current = null;
  }, [activeTool]);

  // Field drag (moving an existing field)
  const handleFieldPointerDown = useCallback((e: React.PointerEvent, field: FieldDef) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    setSelectedId(field.id);

    const coords = getRelCoords(field.page, e.clientX, e.clientY);
    if (!coords) return;
    dragRef.current = {
      op: "moving",
      id: field.id,
      ox: coords.x - field.x,
      oy: coords.y - field.y,
    };
  }, [getRelCoords]);

  const handleFieldPointerMove = useCallback((e: React.PointerEvent, field: FieldDef) => {
    const drag = dragRef.current;
    if (!drag || drag.op !== "moving" || drag.id !== field.id) return;
    e.preventDefault();
    const coords = getRelCoords(field.page, e.clientX, e.clientY);
    if (!coords) return;
    setFields((prev) =>
      prev.map((f) =>
        f.id !== field.id
          ? f
          : {
              ...f,
              x: Math.max(0, Math.min(100 - f.w, coords.x - drag.ox)),
              y: Math.max(0, Math.min(100 - f.h, coords.y - drag.oy)),
            },
      ),
    );
  }, [getRelCoords]);

  const handleFieldPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const deleteField = useCallback((id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
    setSelectedId((s) => (s === id ? null : s));
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ferramenta:</span>

        <button
          type="button"
          onClick={() => setActiveTool("select")}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
            activeTool === "select"
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-background text-muted-foreground hover:bg-muted",
          )}
        >
          <MousePointer className="h-3.5 w-3.5" />
          Seleccionar
        </button>

        {(Object.keys(TOOL_META) as FieldType[]).map((t) => {
          const meta = TOOL_META[t];
          const Icon = meta.icon;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTool(t)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
                activeTool === t
                  ? `${meta.color} ${meta.border} text-foreground`
                  : "border-border bg-background text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {meta.label}
            </button>
          );
        })}

        {selectedId && (
          <button
            type="button"
            onClick={() => deleteField(selectedId)}
            className="ml-auto flex h-8 items-center gap-1.5 rounded-full border border-pastel-pink bg-pastel-pink/20 px-3 text-xs font-semibold text-pastel-pink-foreground hover:bg-pastel-pink/40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar campo
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {fields.length} campo{fields.length !== 1 ? "s" : ""}
          </span>
          <Button variant="ghost" size="sm" className="h-8 rounded-full" onClick={onCancel}>
            <X className="mr-1.5 h-3.5 w-3.5" />
            Cancelar
          </Button>
          <Button size="sm" className="h-8 rounded-full" onClick={() => onSave(fields)}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            Guardar campos
          </Button>
        </div>
      </div>

      {/* Help hint */}
      {activeTool !== "select" && (
        <div className="shrink-0 bg-pastel-blue/10 px-4 py-2 text-center text-xs text-pastel-blue-foreground">
          Clique e arraste no PDF para colocar um campo de{" "}
          <strong>{TOOL_META[activeTool as FieldType].label.toLowerCase()}</strong>
        </div>
      )}

      {/* PDF area */}
      <div className="flex-1 overflow-y-auto bg-zinc-200 px-4 py-6">
        {loadingPdf && (
          <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm">A carregar PDF…</span>
          </div>
        )}

        {pdfError && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <AlertTriangle className="h-10 w-10 text-pastel-yellow-foreground" strokeWidth={1.5} />
            <p className="text-sm font-medium text-foreground">Não foi possível carregar o PDF.</p>
            <p className="text-xs text-muted-foreground">{pdfError}</p>
          </div>
        )}

        <div className="mx-auto flex max-w-3xl flex-col gap-8">
          {pages.map((page) => (
            <div key={page.num} className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-zinc-500">Página {page.num}</p>

              {/* Page wrapper — position:relative so fields can be positioned absolutely */}
              <div
                ref={(el) => { pageRefs.current[page.num] = el; }}
                className="relative select-none overflow-hidden rounded shadow-lg"
                style={{ cursor: activeTool !== "select" ? "crosshair" : "default" }}
                onPointerDown={(e) => handlePagePointerDown(e, page.num)}
                onPointerMove={(e) => handlePagePointerMove(e, page.num)}
                onPointerUp={handlePagePointerUp}
              >
                {/* PDF page image */}
                <img
                  src={page.dataUrl}
                  alt={`Página ${page.num}`}
                  className="block w-full"
                  draggable={false}
                />

                {/* Existing fields */}
                {fields
                  .filter((f) => f.page === page.num)
                  .map((f) => {
                    const meta = TOOL_META[f.type];
                    const Icon = meta.icon;
                    const selected = f.id === selectedId;
                    return (
                      <div
                        key={f.id}
                        data-field-id={f.id}
                        className={cn(
                          "absolute cursor-move rounded border-2 text-xs font-semibold transition-shadow",
                          meta.color,
                          meta.border,
                          selected && "ring-2 ring-offset-1 ring-pastel-blue",
                        )}
                        style={{
                          left: `${f.x}%`,
                          top: `${f.y}%`,
                          width: `${f.w}%`,
                          height: `${f.h}%`,
                        }}
                        onPointerDown={(e) => handleFieldPointerDown(e, f)}
                        onPointerMove={(e) => handleFieldPointerMove(e, f)}
                        onPointerUp={handleFieldPointerUp}
                      >
                        <div className="flex h-full items-center justify-center gap-1 overflow-hidden p-1">
                          <Icon className="h-3 w-3 shrink-0" strokeWidth={2} />
                          <span className="truncate text-[10px]">{f.label}</span>
                        </div>

                        {/* Delete button — visible when selected */}
                        {selected && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); deleteField(f.id); }}
                            className="absolute -right-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}

                {/* Draft rectangle while drawing */}
                {draft && draft.page === page.num && (
                  <div
                    className={cn(
                      "pointer-events-none absolute rounded border-2 border-dashed opacity-70",
                      activeTool !== "select" ? TOOL_META[activeTool as FieldType].border : "border-foreground",
                      activeTool !== "select" ? TOOL_META[activeTool as FieldType].color : "bg-muted/40",
                    )}
                    style={{
                      left: `${Math.min(draft.sx, draft.ex)}%`,
                      top: `${Math.min(draft.sy, draft.ey)}%`,
                      width: `${Math.abs(draft.ex - draft.sx)}%`,
                      height: `${Math.abs(draft.ey - draft.sy)}%`,
                    }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
