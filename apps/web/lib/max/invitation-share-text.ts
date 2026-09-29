// An application-side conservative budget, NOT a documented MAX API limit.
// Count UTF-8 bytes (including the intact URL) as Cyrillic is multi-byte.
export const INVITATION_SHARE_BUDGET_BYTES = 240;
const byteLength = (value: string) => new TextEncoder().encode(value).length;

function truncate(value: string, budget: number): string {
  if (budget <= 0) return "";
  if (byteLength(value) <= budget) return value;
  let result = "";
  for (const character of value) {
    if (byteLength(result + character + "…") > budget) break;
    result += character;
  }
  return result ? `${result.trimEnd()}…` : "";
}

export function invitationShareText(text: string, link: string): string {
  // The URL is passed separately to the bridge; never duplicate or truncate it.
  const clean = text.split(link).join("").trim();
  const budget = Math.max(0, INVITATION_SHARE_BUDGET_BYTES - byteLength(link) - 1);
  if (byteLength(clean) <= budget) return clean;
  const subject = clean.match(/^Предмет:\s*(.+)$/m)?.[1] ?? clean.replace(/\s+/g, " ");
  const price = truncate(clean.match(/^(?:Стоимость:|Сумма займа:)\s*(.+)$/m)?.[1] ?? "", 40);
  const prefix = "Макс-Контракт";
  const suffix = price ? `\n${price}` : "";
  const summary = truncate(subject, budget - byteLength(`${prefix}\n${suffix}`));
  const result = `${prefix}${summary ? `\n${summary}` : ""}${suffix}`;
  // Very long URLs still go through unchanged, without any extra text.
  return byteLength(result) <= budget ? result : "";
}
