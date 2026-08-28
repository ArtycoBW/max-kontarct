import type { ReactNode } from "react";
import type { ConceptSlug } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ConceptThemeProvider({
  concept,
  children,
  className,
}: {
  concept: ConceptSlug;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("concept-canvas", className)} data-concept={concept}>
      {children}
    </div>
  );
}
