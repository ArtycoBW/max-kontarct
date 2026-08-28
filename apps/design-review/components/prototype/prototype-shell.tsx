"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronDown, Columns3, Grid2X2, Keyboard, X } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ConceptSwitcher } from "@/components/review/concept-switcher";
import { ScreenPicker } from "@/components/review/screen-picker";
import { PhoneFrame } from "@/components/prototype/phone-frame";
import { PrototypeScreen } from "@/components/prototype/prototype-screen";
import { CONCEPTS } from "@/lib/concepts";
import { getScreen, isScreenId, SCREENS } from "@/lib/screens";
import type { ConceptDefinition, ConceptSlug, ScreenId } from "@/lib/types";

export function PrototypeShell({ concept }: { concept: ConceptDefinition }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentScreen = isScreenId(searchParams.get("screen")) ? searchParams.get("screen") as ScreenId : "splash";
  const screen = getScreen(currentScreen);
  const currentIndex = SCREENS.findIndex((item) => item.id === currentScreen);
  const [mobileBarOpen, setMobileBarOpen] = useState(false);

  const navigate = useCallback((id: ScreenId) => router.push(`${pathname}?screen=${id}`, { scroll: false }), [pathname, router]);
  const step = useCallback((direction: -1 | 1) => navigate(SCREENS[Math.min(SCREENS.length - 1, Math.max(0, currentIndex + direction))].id), [currentIndex, navigate]);
  const switchConcept = useCallback((slug: ConceptSlug) => router.push(`/concept/${slug}/prototype?screen=${currentScreen}`), [currentScreen, router]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable) return;
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
      if (event.key.toLowerCase() === "g") router.push(`/concept/${concept.slug}/screens`);
      if (event.key.toLowerCase() === "u") router.push(`/compare?screen=${currentScreen}`);
      if (["1", "2", "3", "4"].includes(event.key)) switchConcept(CONCEPTS[Number(event.key) - 1].slug);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [concept.slug, currentScreen, router, step, switchConcept]);

  const controls = (
    <div className="grid gap-5">
      <div><div className="review-kicker text-black/35">Направление</div><div className="mt-3"><ConceptSwitcher active={concept.slug} screen={currentScreen} /></div></div>
      <div className="h-px bg-black/8" />
      <div><div className="review-kicker text-black/35">Экран</div><div className="mt-2 font-mono text-[11px] text-black/40">{String(screen.number).padStart(2, "0")} / {SCREENS.length}</div><h2 className="mt-2 text-xl font-semibold tracking-[-.035em]">{screen.title}</h2><p className="mt-2 text-xs leading-relaxed text-black/50">{screen.description}</p></div>
      <ScreenPicker value={currentScreen} onValueChange={navigate} />
      <div className="grid grid-cols-2 gap-2"><Button variant="outline" className="rounded-xl" disabled={currentIndex === 0} onClick={() => step(-1)}><ArrowLeft size={15} /> Назад</Button><Button variant="outline" className="rounded-xl" disabled={currentIndex === SCREENS.length - 1} onClick={() => step(1)}>Вперёд <ArrowRight size={15} /></Button></div>
      <div className="grid gap-2"><Button asChild className="rounded-xl"><Link href={`/concept/${concept.slug}/screens`}><Grid2X2 size={15} /> Все экраны</Link></Button><Button variant="secondary" asChild className="rounded-xl"><Link href={`/compare?screen=${currentScreen}`}><Columns3 size={15} /> Сравнить этот экран</Link></Button></div>
      <TooltipProvider><Tooltip><TooltipTrigger asChild><div className="keyboard-hint cursor-help" aria-label="Быстрые клавиши"><div className="keyboard-hint-title"><Keyboard size={14} /><span>Быстрые клавиши</span></div><div className="keyboard-hint-grid"><span className="keyboard-shortcut"><span className="keyboard-hint-keys"><kbd>←</kbd><kbd>→</kbd></span><small>Экраны</small></span><span className="keyboard-shortcut"><span className="keyboard-hint-keys"><kbd>G</kbd></span><small>Галерея</small></span><span className="keyboard-shortcut"><span className="keyboard-hint-keys"><kbd>U</kbd></span><small>Сравнение</small></span><span className="keyboard-shortcut"><span className="keyboard-hint-keys keyboard-hint-digits"><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd></span><small>Дизайн</small></span></div></div></TooltipTrigger><TooltipContent>Работают, когда курсор находится вне полей ввода</TooltipContent></Tooltip></TooltipProvider>
    </div>
  );

  return (
    <div className="min-h-dvh bg-[#efefeb]">
      <div className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-black/10 bg-[#f7f7f4]/90 px-3 backdrop-blur-xl md:hidden">
        <Link href={`/concept/${concept.slug}`} className="flex items-center gap-2 text-xs font-bold"><ArrowLeft size={15} /> {concept.name}</Link>
        <button type="button" onClick={() => setMobileBarOpen((value) => !value)} className="flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-[10px] font-bold"><span>{String(screen.number).padStart(2, "0")}/{SCREENS.length}</span>{mobileBarOpen ? <X size={14} /> : <ChevronDown size={14} />}</button>
      </div>
      {mobileBarOpen && <div className="fixed inset-x-0 top-16 z-40 max-h-[70dvh] overflow-y-auto border-b border-black/10 bg-[#f7f7f4] p-4 shadow-xl md:hidden">{controls}</div>}
      <main className="mx-auto grid min-h-[calc(100dvh-64px)] max-w-[1180px] items-center gap-10 px-0 py-0 md:min-h-dvh md:grid-cols-[390px_310px] md:justify-center md:px-8 md:py-14 lg:gap-16">
        <motion.div initial={{ opacity: 0, y: 20, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 150, damping: 20 }} className="flex justify-center">
          <PhoneFrame concept={concept.slug}><PrototypeScreen concept={concept.slug} screenId={currentScreen} onNavigate={navigate} /></PhoneFrame>
        </motion.div>
        <aside className="review-panel hidden p-5 md:block">{controls}</aside>
      </main>
    </div>
  );
}
