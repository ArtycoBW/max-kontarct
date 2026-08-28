import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Columns3, Grid2X2, Images, MousePointer2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConceptOverviewPreview } from "@/components/review/concept-overview-preview";
import { ConceptSwitcher } from "@/components/review/concept-switcher";
import { ReferenceViewer } from "@/components/review/reference-viewer";
import { ReviewShell } from "@/components/review/review-shell";
import { CONCEPTS, getConcept } from "@/lib/concepts";

export function generateStaticParams() { return CONCEPTS.map((concept) => ({ slug: concept.slug })); }

export default async function ConceptPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const concept = getConcept(slug);
  if (!concept) notFound();
  return (
    <ReviewShell>
      <main>
        <section className="review-container grid items-center gap-12 py-14 lg:grid-cols-[1fr_430px] lg:py-20">
          <div><div className="flex items-center gap-4"><span className="review-kicker text-black/35">Концепция {concept.number}</span><ConceptSwitcher active={concept.slug} mode="overview" /></div><div className="mt-9 text-xs font-semibold" style={{ color: concept.primary }}>{concept.label}</div><h1 className="mt-3 text-[clamp(3.7rem,8vw,7.5rem)] font-medium leading-[.86] tracking-[-.075em]">{concept.name}</h1><p className="mt-6 max-w-2xl text-xl leading-snug tracking-[-.025em] text-black/60">{concept.detail}</p><div className="mt-8 flex flex-wrap gap-2"><Button asChild className="rounded-full"><Link href={`/concept/${concept.slug}/prototype?screen=splash`}><MousePointer2 size={15} /> Пройти сценарий</Link></Button><Button asChild variant="outline" className="rounded-full bg-white"><Link href={`/concept/${concept.slug}/screens`}><Grid2X2 size={15} /> Все экраны</Link></Button><Button asChild variant="ghost" className="rounded-full"><Link href="/compare?screen=dashboard"><Columns3 size={15} /> Сравнить</Link></Button></div><div className="mt-10 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wider text-black/40"><span className="rounded-full border border-black/10 px-3 py-2">{concept.character}</span><span className="rounded-full border border-black/10 px-3 py-2">43 экрана</span><span className="rounded-full border border-black/10 px-3 py-2">Для всех устройств</span></div></div>
          <div className="hidden justify-center lg:flex"><ConceptOverviewPreview concept={concept.slug} /></div>
        </section>
        <section className="border-y border-black/10 bg-white/55"><div className="review-container py-16"><div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="review-kicker text-black/35">Исходные материалы</div><h2 className="mt-3 text-3xl font-semibold tracking-[-.045em]">Визуальные референсы</h2><p className="mt-3 max-w-2xl text-sm leading-relaxed text-black/50">Здесь можно сопоставить композицию, ритм и визуальный язык концепции с исходными мудбордами.</p></div><Button asChild variant="outline" className="rounded-full bg-white"><Link href={`/concept/${concept.slug}/screens`}><Images size={15} /> Перейти в галерею <ArrowRight size={14} /></Link></Button></div><ReferenceViewer concept={concept} /></div></section>
      </main>
    </ReviewShell>
  );
}
