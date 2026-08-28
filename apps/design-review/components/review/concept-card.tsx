import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConceptDefinition } from "@/lib/types";

export function ConceptCard({ concept }: { concept: ConceptDefinition }) {
  return (
    <article className="group overflow-hidden rounded-[28px] border border-black/10 bg-white transition duration-300 hover:-translate-y-0.5">
      <Link href={`/concept/${concept.slug}/prototype?screen=splash`} className="block">
        <div className="relative aspect-[16/10] overflow-hidden bg-[#e8e8e4]">
          <Image src={concept.preview} alt={`Превью концепции ${concept.name}`} fill sizes="(max-width: 900px) 100vw, 33vw" className="object-cover object-top transition duration-500 group-hover:scale-[1.015]" priority />
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/40 to-transparent" />
          <span className={`absolute left-4 top-4 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider shadow-[0_5px_16px_rgba(0,0,0,.16)] backdrop-blur-md ${concept.slug === "contractbook" ? "border-white/70 bg-white/95 text-black" : "border-black/80 bg-black/90 text-white"}`}>Концепция {concept.number}</span>
        </div>
      </Link>
      <div className="p-6">
        <div className="review-kicker text-black/40">{concept.label}</div>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-.045em]">{concept.name}</h2>
        <p className="mt-2 text-xs font-semibold" style={{ color: concept.primary }}>{concept.character}</p>
        <p className="mt-4 min-h-12 text-sm leading-relaxed text-black/55">{concept.summary}</p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button asChild className="rounded-full"><Link href={`/concept/${concept.slug}/prototype?screen=splash`}>Посмотреть дизайн <ArrowUpRight size={14} /></Link></Button>
          <Button variant="ghost" asChild className="rounded-full text-xs"><Link href="/compare?screen=welcome">Сравнить экраны</Link></Button>
        </div>
      </div>
    </article>
  );
}
