export interface PreviewFile {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

export function previewKind(mimeType: string): "image" | "pdf" | "unsupported" {
  if (["image/jpeg", "image/png", "image/webp"].includes(mimeType)) return "image";
  return mimeType === "application/pdf" ? "pdf" : "unsupported";
}

export function fileSizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.ceil(bytes / 1024))} КБ`;
}

export function fileTypeLabel(mimeType: string): string {
  return ({ "application/pdf": "PDF", "image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WebP" } as Record<string, string>)[mimeType] ?? "Файл";
}

export async function fetchPreview(file: PreviewFile, signal: AbortSignal): Promise<Blob> {
  const response = await fetch(file.url, { credentials: "include", cache: "no-store", signal });
  if (response.status === 401) throw new Error("Сессия завершилась. Войдите снова, чтобы открыть файл.");
  if (response.status === 403) throw new Error("У вас нет доступа к этому файлу.");
  if (response.status === 404) throw new Error("Файл не найден или больше недоступен.");
  if (!response.ok) throw new Error("Не удалось загрузить файл. Проверьте соединение и повторите попытку.");
  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim();
  if (mimeType !== file.mimeType || previewKind(mimeType) === "unsupported") throw new Error("Формат содержимого не соответствует файлу. Предпросмотр недоступен.");
  return response.blob();
}
