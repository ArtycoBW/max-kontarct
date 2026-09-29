// Keep the extension and readable Cyrillic, but avoid long/invalid native names.
export function downloadFilename(filename: string): string {
  const clean = filename.replace(/[\p{Cc}<>:"/\\|?*]/gu, "_").trim().replace(/^\.+|\.+$/g, "") || "document";
  const extension = clean.match(/\.[a-z0-9]{1,10}$/i)?.[0] ?? "";
  const base = extension ? clean.slice(0, -extension.length) : clean;
  let short = "";
  for (const character of base) {
    if (new TextEncoder().encode(short + character + extension).length > 100) break;
    short += character;
  }
  return `${short || "document"}${extension}`;
}
