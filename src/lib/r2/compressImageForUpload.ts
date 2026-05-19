/**
 * Reduz fotos da câmara/galeria antes do upload (mobile envia ficheiros muito grandes).
 * Falha em silêncio → devolve o ficheiro original.
 */
export async function compressImageForUpload(
  file: File,
  opts?: { maxDimension?: number; maxBytes?: number; quality?: number },
): Promise<File> {
  const maxDimension = opts?.maxDimension ?? 1920;
  const maxBytes = opts?.maxBytes ?? 1.5 * 1024 * 1024;
  const quality = opts?.quality ?? 0.82;

  if (!file.type.startsWith("image/")) return file;
  if (file.size <= maxBytes && file.type === "image/jpeg") return file;

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file);
            return;
          }
          const base = file.name.replace(/\.[^.]+$/i, "") || "photo";
          resolve(new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() }));
        },
        "image/jpeg",
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}
