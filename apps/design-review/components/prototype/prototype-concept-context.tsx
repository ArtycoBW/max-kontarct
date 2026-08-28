"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ConceptSlug } from "@/lib/types";

const PrototypeConceptContext = createContext<ConceptSlug>("jeton");

export function PrototypeConceptProvider({ concept, children }: { concept: ConceptSlug; children: ReactNode }) {
  return <PrototypeConceptContext.Provider value={concept}>{children}</PrototypeConceptContext.Provider>;
}

export function usePrototypeConcept() {
  return useContext(PrototypeConceptContext);
}
