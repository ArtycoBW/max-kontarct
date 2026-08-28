"use client";

import Image from "next/image";
import { Expand, X } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { ConceptDefinition } from "@/lib/types";

const referenceTitles: Record<string, string> = {
  "01-onboarding-dashboard.png": "Знакомство и главная",
  "02-deal-creation.png": "Создание сделки",
  "03-invitation-states.png": "Приглашение и состояния",
  "04-documents-verification.png": "Документы и проверка",
  "05-contract-signing.png": "Договор и подписание",
  "06-completion-profile.png": "Завершение и профиль",
  "01-onboarding-deal-flow.png": "Знакомство и сценарий сделки",
  "02-parties-documents.png": "Стороны и документы",
  "03-contract-signing.png": "Договор и подписание",
  "04-profile-states.png": "Профиль и состояния",
  "00-product-workspace-reference.svg": "Продуктовая система",
  "00-mercury-reference.svg": "Банковская система",
  "00-warm-editorial-reference.svg": "Тёплая редакционная система",
};

export function ReferenceViewer({ concept }: { concept: ConceptDefinition }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <>
      <div className="grid gap-5 md:grid-cols-2">
        {concept.references.map((file, index) => {
          const src = `/references/${concept.number}-${concept.slug}/${file}`;
          const title = referenceTitles[file] ?? `Референс ${index + 1}`;
          return <button type="button" className="reference-card group overflow-hidden rounded-[22px] border border-black/10 bg-white text-left" key={file} onClick={() => setSelected(src)}><div className="relative aspect-[4/3] overflow-hidden bg-[#ecece8]"><Image src={src} alt={`${concept.name}: ${title}`} fill sizes="(max-width: 768px) 100vw, 50vw" className="reference-image" /><span className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-white/90 opacity-0 shadow-sm transition group-hover:opacity-100"><Expand size={15} /></span></div><div className="flex items-center justify-between p-4"><span className="text-xs font-semibold">{String(index + 1).padStart(2, "0")} · {title}</span><span className="text-[9px] uppercase tracking-wider text-black/40">Визуальный референс</span></div></button>;
        })}
      </div>
      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="h-[92vh] max-w-[96vw] overflow-hidden border-white/10 bg-[#171717] p-0 text-white sm:max-w-[96vw]">
          <DialogTitle className="sr-only">Просмотр референса</DialogTitle>
          {selected && <div className="relative h-full w-full"><Image src={selected} alt="Референс в полном размере" fill sizes="96vw" className="object-contain p-3" /></div>}
          <DialogClose className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white text-black"><X size={17} /></DialogClose>
        </DialogContent>
      </Dialog>
    </>
  );
}
