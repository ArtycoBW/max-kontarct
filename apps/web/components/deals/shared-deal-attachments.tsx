"use client";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getDealDocuments } from "@/lib/api/files";
import { DealFileList } from "@/components/files/deal-file-list";
import { Skeleton } from "@/components/ui/skeleton";
import { queryKeys } from "@/lib/api/query-keys";

export function SharedDealAttachments({ dealId }: { dealId: string }) {
  const documents = useQuery({ queryKey: queryKeys.files.workspace(dealId), queryFn: () => getDealDocuments(dealId), refetchInterval: 5000 });
  const all = documents.data ? [...documents.data.evidenceFiles, ...documents.data.requirements.flatMap(item => item.uploads)] : [];
  const shared = all.filter(file => file.visibility === "DEAL_PARTICIPANTS");
  return <Card className="deal-chat shared-deal-attachments"><h2>Приложения к договору</h2><p className="field-description">Общие материалы предмета сделки. Личные документы сюда не включаются.</p>
    {documents.isPending ? <Skeleton className="file-list-loading" /> : <DealFileList dealId={dealId} files={shared} showDownload />}
    {documents.error ? <p role="alert">Не удалось загрузить приложения. <Button variant="ghost" onClick={() => void documents.refetch()}>Повторить</Button></p> : !documents.isPending && !shared.length ? <p className="field-description">Приложений пока нет.</p> : null}
  </Card>;
}
