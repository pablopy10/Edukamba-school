import { useRef, useState } from "react";
import { Upload, FileText, X, Loader2, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Props {
  schoolId: string | null;
  onUpload: (url: string, fileName: string) => void;
  onClear: () => void;
  currentUrl?: string | null;
  currentFileName?: string | null;
  accept?: string;
  className?: string;
}

const BUCKET = "documents";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentUpload({ schoolId, onUpload, onClear, currentUrl, currentFileName, accept, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File) => {
    if (!file) return;

    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({ title: "Ficheiro demasiado grande", description: "Máximo: 50 MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    setProgress(10);

    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${schoolId ?? "shared"}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    setProgress(30);

    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

    setProgress(90);

    if (error) {
      toast({ title: "Erro no upload", description: error.message, variant: "destructive" });
      setUploading(false);
      setProgress(0);
      return;
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    setUploading(false);
    setProgress(100);
    onUpload(urlData.publicUrl, file.name);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  if (currentUrl && currentFileName && !uploading) {
    return (
      <div className={cn("flex items-center gap-3 rounded-xl border border-pastel-green/60 bg-pastel-green/10 px-4 py-3", className)}>
        <FileText className="h-5 w-5 shrink-0 text-pastel-green-foreground" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{currentFileName}</p>
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-pastel-blue-foreground hover:underline"
          >
            Ver ficheiro
          </a>
        </div>
        <button
          type="button"
          onClick={() => { onClear(); if (inputRef.current) inputRef.current.value = ""; }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-pastel-pink/30 hover:text-pastel-pink-foreground"
          title="Remover ficheiro"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors",
        dragOver ? "border-pastel-blue bg-pastel-blue/10" : "border-border bg-muted/20 hover:bg-muted/40",
        uploading && "pointer-events-none",
        className,
      )}
      style={{ minHeight: 120 }}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept ?? ".pdf,.doc,.docx,.png,.jpg,.jpeg"}
        className="sr-only"
        onChange={handleInputChange}
      />

      {uploading ? (
        <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-pastel-blue-foreground" />
          <p className="text-sm font-medium text-foreground">A fazer upload…</p>
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-pastel-blue transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
            {dragOver ? (
              <FolderOpen className="h-6 w-6 text-pastel-blue-foreground" strokeWidth={1.5} />
            ) : (
              <Upload className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {dragOver ? "Solte o ficheiro aqui" : "Clique ou arraste o ficheiro"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              PDF, Word, imagem — máx. 50 MB
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
