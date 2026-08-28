"use client";

import { useRouter } from "next/navigation";
import { PhoneFrame } from "@/components/prototype/phone-frame";
import { PrototypeScreen } from "@/components/prototype/prototype-screen";
import type { ConceptSlug, ScreenId } from "@/lib/types";

export function ConceptOverviewPreview({ concept }: { concept: ConceptSlug }) {
  const router = useRouter();
  const navigate = (screen: ScreenId) => router.push(`/concept/${concept}/prototype?screen=${screen}`);
  return <PhoneFrame concept={concept} className="compare-phone"><PrototypeScreen concept={concept} screenId="dashboard" onNavigate={navigate} /></PhoneFrame>;
}
