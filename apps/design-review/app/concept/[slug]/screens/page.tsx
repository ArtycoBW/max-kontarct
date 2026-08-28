import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Columns3, MousePointer2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConceptSwitcher } from "@/components/review/concept-switcher";
import { ReviewShell } from "@/components/review/review-shell";
import { ScreenGallery } from "@/components/review/screen-gallery";
import { getConcept } from "@/lib/concepts";

export default async function ScreensPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const concept = getConcept(slug);
  if (!concept) notFound();
  return (
    <ReviewShell>
      <main className="review-container py-12 md:py-16">
        <Link href={`/concept/${concept.slug}`} className="inline-flex items-center gap-2 text-xs text-black/45 hover:text-black"><ArrowLeft size={14} /> Назад к концепции</Link>
        <div className="mt-7 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"><div><div className="review-kicker text-black/35">{concept.number} - {concept.name}</div><h1 className="mt-3 text-5xl font-medium tracking-[-.06em] md:text-7xl">Все экраны</h1><p className="mt-4 max-w-2xl text-sm leading-relaxed text-black/50">43 интерактивных экрана, сгруппированных по пользовательскому сценарию. Нажмите на карточку, чтобы открыть выбранный экран.</p></div><div className="flex flex-wrap items-center gap-2"><ConceptSwitcher active={concept.slug} mode="screens" /><Button asChild className="rounded-full"><Link href={`/concept/${concept.slug}/prototype?screen=splash`}><MousePointer2 size={15} /> Пройти сценарий</Link></Button><Button asChild variant="outline" className="rounded-full bg-white"><Link href="/compare?screen=dashboard"><Columns3 size={15} /> Сравнить</Link></Button></div></div>
        <div className="mt-10"><ScreenGallery concept={concept} /></div>
      </main>
    </ReviewShell>
  );
}
