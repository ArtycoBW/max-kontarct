import Link from "next/link";
import { CONCEPTS } from "@/lib/concepts";
import type { ConceptSlug, ScreenId } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ConceptSwitcher({ active, screen, mode = "prototype" }: { active: ConceptSlug; screen?: ScreenId; mode?: "prototype" | "screens" | "overview" }) {
  return (
    <div className="inline-flex items-center rounded-full border border-black/10 bg-white/70 p-1">
      {CONCEPTS.map((concept) => {
        const href = mode === "overview" ? `/concept/${concept.slug}` : mode === "screens" ? `/concept/${concept.slug}/screens` : `/concept/${concept.slug}/prototype?screen=${screen ?? "splash"}`;
        return <Link key={concept.slug} href={href} className={cn("grid min-w-10 place-items-center rounded-full px-3 py-2 text-[10px] font-bold transition", active === concept.slug ? "bg-[#171717] text-white" : "text-black/50 hover:text-black")}>{concept.number}</Link>;
      })}
    </div>
  );
}
