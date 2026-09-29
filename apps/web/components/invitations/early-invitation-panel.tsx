"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createDealInvitation, getDealWorkspace, markDealInvitationSent } from "@/lib/api/invitations";
import { InvitationShareActions } from "./invitation-share-actions";

export function EarlyInvitationPanel({ dealId, beforeCreate, disabled, onSent }: { dealId: string; beforeCreate: () => Promise<void>; disabled: boolean; onSent?: (sent: boolean) => void }) {
  const [notice, setNotice] = useState("");
  const workspace = useQuery({ queryKey: ["early-invitation", dealId], queryFn: () => getDealWorkspace(dealId), refetchInterval: 10_000 });
  const sent = Boolean(workspace.data?.counterparty || workspace.data?.invitation?.sentAt);
  useEffect(() => { onSent?.(sent); }, [onSent, sent]);
  const create = useMutation({
    mutationFn: async () => {
      await beforeCreate();
      const current = await getDealWorkspace(dealId);
      return createDealInvitation(dealId, { expectedUpdatedAt: current.updatedAt, expectedVersionId: current.versionId, replaceActive: current.invitation?.state === "ACTIVE" });
    },
    onSuccess: () => { onSent?.(false); setNotice("Ссылка готова. Отправьте приглашение в MAX или скопируйте ссылку."); void workspace.refetch(); },
  });
  if (workspace.data?.counterparty) return <Card className="early-invitation-panel invitation-joined"><p role="status">{workspace.data.counterparty.displayName} уже присоединился.</p></Card>;
  return <Card className="early-invitation-panel">
    <strong>Пригласите вторую сторону уже сейчас</strong>
    <p>Получатель увидит, кто его приглашает и что вы предлагаете, и сможет заполнить свой профиль параллельно. Подписание будет доступно только после согласования итоговых условий.</p>
    <>
      {create.data?.shareUrl ? <><div className="invitation-share-preview"><strong>Сообщение получателю</strong><p style={{ whiteSpace: "pre-line" }}>{create.data.shareText}</p><small>Проверьте текст перед отправкой. Не включайте конфиденциальные сведения.</small></div><InvitationShareActions key={create.data.id} link={create.data.shareUrl} text={create.data.shareText ?? "Приглашение в Макс-Контракт"} onConfirmed={async () => {
        await markDealInvitationSent(dealId, create.data!.id);
        onSent?.(true);
        setNotice("");
        void workspace.refetch();
      }} /></> :
        <Button type="button" disabled={disabled || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Готовим приглашение…" : workspace.data?.invitation?.state === "ACTIVE" ? "Перевыпустить приглашение" : "Пригласить сейчас"}</Button>}
      {disabled ? <small>Сначала выберите свою роль и заполните описание сделки.</small> : null}
    </>
    {create.error ? <p role="alert">{create.error.message}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </Card>;
}
