"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { PhoneFrame } from "@/components/prototype/phone-frame";
import { PrototypeScreen } from "@/components/prototype/prototype-screen";
import { ScreenPicker } from "@/components/review/screen-picker";
import { CONCEPTS } from "@/lib/concepts";
import { isScreenId, SCREENS } from "@/lib/screens";
import type { ScreenId } from "@/lib/types";

export function CompareGrid() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const screen = isScreenId(searchParams.get("screen")) ? searchParams.get("screen") as ScreenId : "dashboard";
  const index = SCREENS.findIndex((item) => item.id === screen);
  const select = (id: ScreenId) => router.push(`/compare?screen=${id}`, { scroll: false });
  const step = (direction: -1 | 1) => select(SCREENS[Math.min(SCREENS.length - 1, Math.max(0, index + direction))].id);
  return (
    <>
      <div className="review-panel sticky top-20 z-30 mb-10 grid gap-3 p-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
        <ScreenPicker value={screen} onValueChange={select} />
        <div className="grid grid-cols-2 gap-2"><Button variant="outline" className="rounded-xl" disabled={index === 0} onClick={() => step(-1)}><ArrowLeft size={15} /> Назад</Button><Button variant="outline" className="rounded-xl" disabled={index === SCREENS.length - 1} onClick={() => step(1)}>Вперёд <ArrowRight size={15} /></Button></div>
        <div className="hidden gap-1 xl:flex">{CONCEPTS.map((concept) => <Button key={concept.slug} variant="ghost" asChild className="rounded-xl text-xs"><Link href={`/concept/${concept.slug}/prototype?screen=${screen}`}>{concept.name} <ArrowUpRight size={13} /></Link></Button>)}</div>
      </div>
      <div className="grid items-start justify-items-center gap-8 md:grid-cols-2 xl:grid-cols-3">
        {CONCEPTS.map((concept) => <div key={concept.slug} className="w-full max-w-[390px]"><div className="mb-4 flex items-center justify-between px-2"><div><div className="review-kicker text-black/35">{concept.number} - {concept.name}</div><div className="mt-1 text-xs text-black/50">{concept.label}</div></div><Link href={`/concept/${concept.slug}/prototype?screen=${screen}`} className="grid size-9 place-items-center rounded-full border border-black/10 bg-white"><ArrowUpRight size={15} /></Link></div><motion.div key={`${concept.slug}-${screen}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .22 }}><PhoneFrame concept={concept.slug} className="compare-phone"><PrototypeScreen concept={concept.slug} screenId={screen} onNavigate={select} /></PhoneFrame></motion.div></div>)}
      </div>
    </>
  );
}
