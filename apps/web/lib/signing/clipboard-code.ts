/** Accept only a copied code or our OTP notification, not arbitrary numbers. */
export function signatureCodeFromClipboard(text: string): string | null {
  const value = text.trim();
  if (/^\d{4}$/.test(value)) return value;
  return /^(?:Тестовый\s+)?код подписания Макс-Контракт:\s*(\d{4})(?!\d)/iu.exec(value)?.[1] ?? null;
}
