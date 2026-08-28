"use client";

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SCREENS, SCREEN_GROUPS } from "@/lib/screens";
import type { ScreenId } from "@/lib/types";

export function ScreenPicker({ value, onValueChange, className }: { value: ScreenId; onValueChange: (value: ScreenId) => void; className?: string }) {
  return (
    <Select value={value} onValueChange={(value) => onValueChange(value as ScreenId)}>
      <SelectTrigger className={className ?? "h-10 w-full rounded-xl border-black/10 bg-white text-xs"}><SelectValue /></SelectTrigger>
      <SelectContent className="max-h-[420px]">
        {SCREEN_GROUPS.map((group) => <SelectGroup key={group}><SelectLabel className="text-[10px] uppercase tracking-wider text-black/40">{group}</SelectLabel>{SCREENS.filter((screen) => screen.group === group).map((screen) => <SelectItem key={screen.id} value={screen.id} className="text-xs"><span className="mr-2 font-mono text-black/35">{String(screen.number).padStart(2, "0")}</span>{screen.title}</SelectItem>)}</SelectGroup>)}
      </SelectContent>
    </Select>
  );
}
