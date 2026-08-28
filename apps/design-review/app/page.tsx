import Link from "next/link";
import { ArrowRight, Columns3, MousePointer2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConceptCard } from "@/components/review/concept-card";
import { ReviewShell } from "@/components/review/review-shell";
import { CONCEPTS } from "@/lib/concepts";

export default function HomePage() {
  return (
    <ReviewShell grid>
      <main>
        <section className="review-container grid min-h-[52vh] items-end gap-8 pb-14 pt-20 lg:grid-cols-[1fr_420px] lg:pb-20 lg:pt-28">
          <div><div className="review-kicker mb-5 text-black/40">Четыре концепции · интерактивный просмотр</div><h1 className="max-w-4xl text-[clamp(3.4rem,8vw,8.4rem)] font-medium leading-[.84] tracking-[-.075em]">Макс‑Контракт</h1><p className="mt-5 text-xl tracking-[-.025em] text-black/55 md:text-3xl">Четыре визуальных направления будущего мини-приложения</p></div>
          <div className="lg:pb-2"><p className="max-w-md text-sm leading-relaxed text-black/55">Откройте любую концепцию, пройдите основной пользовательский сценарий и сравните один экран сразу в четырёх стилях.</p><div className="mt-6 flex flex-wrap gap-2"><Button asChild className="rounded-full"><Link href="/concept/jeton/prototype?screen=splash"><MousePointer2 size={15} /> Начать сценарий</Link></Button><Button asChild variant="outline" className="rounded-full bg-white"><Link href="/compare?screen=dashboard"><Columns3 size={15} /> Сравнить</Link></Button></div></div>
        </section>
        <section className="review-container pb-24"><div className="mb-5 flex items-end justify-between border-b border-black/10 pb-4"><div><div className="review-kicker text-black/35">Визуальные направления</div><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">Выберите характер</h2></div><span className="hidden items-center gap-2 text-xs text-black/40 sm:flex">43 экрана · единый сценарий <ArrowRight size={14} /></span></div><div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">{CONCEPTS.map((concept) => <ConceptCard key={concept.slug} concept={concept} />)}</div></section>
        <section className="border-y border-black/10 bg-[#171717] text-white"><div className="review-container grid gap-10 py-20 lg:grid-cols-[1fr_1fr]"><div><div className="review-kicker text-white/40">Как смотреть</div><h2 className="mt-4 max-w-xl text-4xl font-medium leading-[1.05] tracking-[-.055em] md:text-6xl">Один продукт. Четыре совершенно разных голоса.</h2></div><div className="grid gap-5 sm:grid-cols-3">{[["01", "Пройти", "Нажимайте кнопки внутри макета и проходите сценарий."], ["02", "Исследовать", "Откройте галерею всех 43 экранов."], ["03", "Сравнить", "Синхронно меняйте экран в четырёх стилях."]].map(([number, title, copy]) => <div key={number} className="border-t border-white/20 pt-4"><div className="font-mono text-xs text-white/35">{number}</div><h3 className="mt-6 text-lg font-semibold">{title}</h3><p className="mt-2 text-xs leading-relaxed text-white/50">{copy}</p></div>)}</div></div></section>
      </main>
    </ReviewShell>
  );
}
