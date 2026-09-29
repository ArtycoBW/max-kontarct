import { normalizeUploadedFilename } from "../files/file-validation";

const transliteration = Object.fromEntries([..."абвгдеёжзийклмнопрстуфхцчшщъыьэюя"].map((letter, index) => [letter, ["a", "b", "v", "g", "d", "e", "yo", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s", "t", "u", "f", "kh", "ts", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya"][index]]));
const extensions: Record<string, string> = { "application/pdf": "pdf", "application/zip": "zip", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function downloadMetadata(originalName: string, mimeType: string) {
  const filename = normalizeUploadedFilename(originalName);
  const extension = extensions[mimeType] ?? "bin";
  const base = filename.replace(/\.[^.]*$/, "").replace(/[А-Яа-яЁё]/g, letter => {
    const text = transliteration[letter.toLowerCase()] ?? "";
    return letter === letter.toUpperCase() ? text.toUpperCase() : text;
  }).normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "file";
  const safeBase = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base) ? `file-${base}` : base;
  const nativeFilename = `${safeBase}.${extension}`;
  // Legacy native parsers may only understand filename="...". Browsers retain
  // the original Unicode filename through RFC 5987; the native route is ASCII-only.
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return { filename, nativeFilename, extension, browserDisposition: `attachment; filename="${nativeFilename}"; filename*=UTF-8''${encoded}`, nativeDisposition: `attachment; filename="${nativeFilename}"` };
}
