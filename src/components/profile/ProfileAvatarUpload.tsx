import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { uploadFileToR2, R2UploadError } from "@/lib/r2/uploadFileToR2";
import { cn } from "@/lib/utils";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type Props = {
  currentAvatarUrl?: string | null;
  onUpdated?: (publicUrl: string) => void;
  className?: string;
};

/**
 * Exemplo: upload de foto de perfil → R2 (presigned) → guardar URL em profiles.avatar_url.
 */
export function ProfileAvatarUpload({ currentAvatarUrl, onUpdated, className }: Props) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(currentAvatarUrl ?? null);

  const handlePick = () => inputRef.current?.click();

  const handleFile = async (file: File) => {
    if (!user) {
      toast({ title: "Sessão inválida", variant: "destructive" });
      return;
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      toast({ title: "Formato inválido", description: "Use JPEG, PNG ou WebP.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast({ title: "Ficheiro demasiado grande", description: "Máximo 2 MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      const publicUrl = await uploadFileToR2(file, {
        prefix: "avatars",
        onProgress: setProgress,
      });

      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);

      if (error) throw error;

      setPreview(publicUrl);
      onUpdated?.(publicUrl);
      toast({ title: "Foto de perfil atualizada" });
    } catch (e) {
      const msg = e instanceof R2UploadError ? e.message : e instanceof Error ? e.message : "Erro no upload";
      toast({ title: "Não foi possível atualizar a foto", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div className="relative h-24 w-24 overflow-hidden rounded-full border border-border bg-muted">
        {preview ? (
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Upload className="h-8 w-8" strokeWidth={1.5} />
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      <button
        type="button"
        onClick={handlePick}
        disabled={uploading}
        className="flex h-10 items-center gap-2 rounded-full bg-pastel-blue px-4 text-sm font-semibold text-pastel-blue-foreground shadow-soft disabled:opacity-50"
      >
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {progress > 0 ? `${progress}%` : "A enviar…"}
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            Alterar foto
          </>
        )}
      </button>
    </div>
  );
}
