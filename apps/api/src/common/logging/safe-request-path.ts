/** Query strings can contain MAX proofs, invitation secrets or personal data. */
export function safeRequestPath(value: unknown): string | undefined {
  return typeof value === "string" ? value.split(/[?#]/, 1)[0] : undefined;
}
