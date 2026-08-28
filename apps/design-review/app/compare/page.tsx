import { Suspense } from "react";
import { CompareGrid } from "@/components/review/compare-grid";
import { ReviewShell } from "@/components/review/review-shell";

export default function ComparePage() {
  return (
    <ReviewShell>
      <main className="review-container py-12 md:py-16"><div className="max-w-3xl"><div className="review-kicker text-black/35">Синхронный просмотр</div><h1 className="mt-3 text-5xl font-medium tracking-[-.06em] md:text-7xl">Сравнение</h1><p className="mt-4 text-sm leading-relaxed text-black/50">Один экран, четыре визуальных языка. Выбор экрана одновременно обновляет все макеты.</p></div><div className="mt-10"><Suspense fallback={<div className="py-24 text-center text-sm text-black/45">Готовим сравнение…</div>}><CompareGrid /></Suspense></div></main>
    </ReviewShell>
  );
}
