import { AlertCircle } from "lucide-react";

export function FieldValidation({ message }: { message: string }) {
  return <span className="flex items-center gap-1.5 text-[11px] leading-snug text-[var(--app-danger)]"><AlertCircle size={13} />{message}</span>;
}
