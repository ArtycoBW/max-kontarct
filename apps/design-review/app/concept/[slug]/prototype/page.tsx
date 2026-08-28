import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PrototypeShell } from "@/components/prototype/prototype-shell";
import { getConcept } from "@/lib/concepts";

export default async function PrototypePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const concept = getConcept(slug);
  if (!concept) notFound();
  return <Suspense fallback={<div className="grid min-h-dvh place-items-center bg-[#efefeb] text-sm text-black/45">Загружаем прототип…</div>}><PrototypeShell concept={concept} /></Suspense>;
}
