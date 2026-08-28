import type { ReactNode } from "react";
import { ReviewHeader } from "@/components/review/review-header";

export function ReviewShell({ children, grid = false }: { children: ReactNode; grid?: boolean }) {
  return (
    <div className={`review-shell ${grid ? "review-grid" : ""}`}>
      <ReviewHeader />
      {children}
      <footer className="review-container flex flex-col gap-2 border-t border-black/10 py-7 text-[10px] uppercase tracking-[.1em] text-black/45 sm:flex-row sm:items-center sm:justify-between">
        <span>Макс‑Контракт</span><span>Концепции интерфейса · Август 2026</span>
      </footer>
    </div>
  );
}
