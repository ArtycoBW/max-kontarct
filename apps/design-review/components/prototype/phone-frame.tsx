import type { ReactNode } from "react";
import type { ConceptSlug } from "@/lib/types";
import { ConceptThemeProvider } from "@/components/concepts/concept-theme-provider";
import { cn } from "@/lib/utils";

export function PhoneFrame({ concept, children, className }: { concept: ConceptSlug; children: ReactNode; className?: string }) {
  return (
    <ConceptThemeProvider concept={concept} className={cn("phone-frame", className)}>
      <div className="phone-screen">{children}</div>
    </ConceptThemeProvider>
  );
}
