"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Columns3, Grid2X2, Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ReviewHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = [
    { href: "/", label: "Концепции" },
    { href: "/compare?screen=dashboard", label: "Сравнение", icon: Columns3 },
  ];
  return (
    <header className="sticky top-0 z-50 border-b border-black/8 bg-[#f7f7f4]/85 backdrop-blur-xl">
      <div className="review-container flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
          <span className="grid size-8 place-items-center rounded-[10px] bg-[#171717] text-sm font-black text-white">M</span>
          <span><strong className="block text-[13px] tracking-[-.02em]">Макс‑Контракт</strong><span className="block text-[9px] uppercase tracking-[.13em] text-black/45">Визуальные концепции</span></span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map(({ href, label, icon: Icon }) => <Button key={href} variant="ghost" size="sm" asChild className={cn("rounded-full text-xs", pathname === href.split("?")[0] && "bg-black/6")}><Link href={href}>{Icon && <Icon size={14} />}{label}</Link></Button>)}
          <Button size="sm" asChild className="ml-2 rounded-full"><Link href="/concept/jeton/prototype?screen=splash">Открыть прототип <ArrowUpRight size={14} /></Link></Button>
        </nav>
        <button type="button" className="grid size-9 place-items-center rounded-full border border-black/10 md:hidden" onClick={() => setOpen((value) => !value)} aria-label="Меню">{open ? <X size={17} /> : <Menu size={17} />}</button>
      </div>
      {open && <div className="border-t border-black/8 bg-[#f7f7f4] p-3 md:hidden"><div className="review-container grid gap-2"><Link className="flex items-center gap-2 rounded-xl p-3 text-sm font-medium" href="/" onClick={() => setOpen(false)}><Grid2X2 size={16} />Концепции</Link><Link className="flex items-center gap-2 rounded-xl p-3 text-sm font-medium" href="/compare?screen=dashboard" onClick={() => setOpen(false)}><Columns3 size={16} />Сравнение экранов</Link></div></div>}
    </header>
  );
}
