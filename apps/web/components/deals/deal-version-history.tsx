"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getDealVersions } from "@/lib/api/deals";

export function DealVersionHistory({ dealId, versionId }: { dealId: string; versionId: string }) {
  const [open, setOpen] = useState(false);
  const history = useQuery({ queryKey: ["deal-version-history", dealId, versionId], queryFn: () => getDealVersions(dealId), enabled: open, staleTime: 0 });
  return <Collapsible open={open} onOpenChange={setOpen}><CollapsibleTrigger asChild><Button variant="ghost" className="full-width">История редакций <ChevronDown size={16} /></Button></CollapsibleTrigger><CollapsibleContent><Card className="deal-chat">
    {history.data?.items.map(item => <div key={item.id}><strong>Версия {item.versionNumber}{item.isCurrent ? " · текущая" : ""}</strong><p>{item.changeSummary || "Первоначальные условия"}</p>{item.approvals.revoked + item.approvals.superseded > 0 ? <small>Согласования предыдущей редакции не действуют для новой.</small> : null}</div>)}
    {history.isPending ? <p>Загружаем историю…</p> : null}
    {history.error ? <p role="alert">История недоступна. <Button variant="ghost" onClick={() => void history.refetch()}>Повторить</Button></p> : null}
  </Card></CollapsibleContent></Collapsible>;
}
