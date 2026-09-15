"use client";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getDealDocuments, getDealFileDownloadUrl } from "@/lib/api/files";
import { queryKeys } from "@/lib/api/query-keys";

export function SharedDealAttachments({ dealId }: { dealId: string }) {
  const documents = useQuery({ queryKey: queryKeys.files.workspace(dealId), queryFn: () => getDealDocuments(dealId), refetchInterval: 5000 });
  const all = documents.data ? [...documents.data.evidenceFiles, ...documents.data.requirements.flatMap(item => item.uploads)] : [];
  const shared = all.filter(file => file.visibility === "DEAL_PARTICIPANTS");
  return <Card className="deal-chat shared-deal-attachments"><h2>Приложения к договору</h2><p className="field-description">Общие материалы предмета сделки. Личные документы сюда не включаются.</p>
    {shared.map(file => <Button key={file.id} asChild variant="outline"><a href={getDealFileDownloadUrl(dealId, file.id)}>{file.originalName}</a></Button>)}
    {documents.error ? <p role="alert">Не удалось загрузить приложения. <Button variant="ghost" onClick={() => void documents.refetch()}>Повторить</Button></p> : !documents.isPending && !shared.length ? <p className="field-description">Приложений пока нет.</p> : null}
  </Card>;
}
