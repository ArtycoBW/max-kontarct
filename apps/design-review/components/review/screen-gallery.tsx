"use client";

import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConceptThemeProvider } from "@/components/concepts/concept-theme-provider";
import { PrototypeScreen } from "@/components/prototype/prototype-screen";
import { SCREENS, SCREEN_GROUPS } from "@/lib/screens";
import type { ConceptDefinition } from "@/lib/types";

export function ScreenGallery({ concept }: { concept: ConceptDefinition }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const visible = useMemo(() => SCREENS.filter((screen) => (filter === "all" || screen.kind === filter) && `${screen.title} ${screen.id} ${screen.description}`.toLowerCase().includes(query.toLowerCase())), [filter, query]);
  return (
    <div>
      <div className="review-panel sticky top-20 z-30 mb-10 grid gap-3 p-3 md:grid-cols-[1fr_auto_auto] md:items-center">
        <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/35" /><Input className="h-11 rounded-xl border-black/10 bg-white pl-9 text-xs" placeholder="Найти экран по названию…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <Tabs value={filter} onValueChange={setFilter}><TabsList className="h-11 rounded-xl"><TabsTrigger value="all" className="text-xs">Все</TabsTrigger><TabsTrigger value="main" className="text-xs">Основные</TabsTrigger><TabsTrigger value="state" className="text-xs">Состояния</TabsTrigger></TabsList></Tabs>
        <Badge variant="secondary" className="h-9 justify-center rounded-full px-4">{visible.length} экранов</Badge>
      </div>
      <div className="space-y-14">
        {SCREEN_GROUPS.map((group) => {
          const groupScreens = visible.filter((screen) => screen.group === group);
          if (!groupScreens.length) return null;
          return <section key={group}><div className="mb-5 flex items-end justify-between border-b border-black/10 pb-3"><div><div className="review-kicker text-black/35">Группа</div><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">{group}</h2></div><span className="text-xs text-black/40">{groupScreens.length}</span></div><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{groupScreens.map((screen) => <Link href={`/concept/${concept.slug}/prototype?screen=${screen.id}`} key={screen.id} className="group overflow-hidden rounded-[22px] border border-black/10 bg-white transition hover:-translate-y-0.5"><ConceptThemeProvider concept={concept.slug} className="screen-preview-shell"><div className="preview-frame"><PrototypeScreen concept={concept.slug} screenId={screen.id} onNavigate={() => undefined} preview /></div></ConceptThemeProvider><div className="flex items-start gap-3 p-4"><span className="font-mono text-[10px] text-black/35">{String(screen.number).padStart(2, "0")}</span><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{screen.title}</h3><p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-black/45">{screen.description}</p></div><ArrowUpRight size={15} className="shrink-0 text-black/25 transition group-hover:text-black" /></div></Link>)}</div></section>;
        })}
      </div>
      {!visible.length && <div className="py-24 text-center"><h2 className="text-xl font-semibold">Ничего не найдено</h2><p className="mt-2 text-sm text-black/45">Попробуйте изменить запрос или фильтр.</p></div>}
    </div>
  );
}
