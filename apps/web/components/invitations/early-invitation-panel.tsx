"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createDealInvitation, getDealWorkspace, markDealInvitationSent } from "@/lib/api/invitations";
import { shareInMax } from "@/lib/max/bridge";

export function EarlyInvitationPanel({ dealId, beforeCreate, disabled }: { dealId: string; beforeCreate: () => Promise<void>; disabled: boolean }) {
  const [notice, setNotice] = useState("");
  const [shareError, setShareError] = useState("");
  const workspace = useQuery({ queryKey: ["early-invitation", dealId], queryFn: () => getDealWorkspace(dealId), refetchInterval: 10_000 });
  const create = useMutation({
    mutationFn: async () => {
      await beforeCreate();
      const current = await getDealWorkspace(dealId);
      return createDealInvitation(dealId, { expectedUpdatedAt: current.updatedAt, expectedVersionId: current.versionId, replaceActive: current.invitation?.state === "ACTIVE" });
    },
    onSuccess: () => { setNotice("Ссылка готова. Отправьте её второй стороне, затем продолжайте заполнять условия."); void workspace.refetch(); },
  });
  const send = async (copy: boolean) => {
    if (!create.data?.shareUrl) return;
    setShareError("");
    try {
      if (copy) await navigator.clipboard.writeText(create.data.shareUrl);
      else await shareInMax(create.data.shareText ?? "Приглашение в Макс-Контракт", create.data.shareUrl);
      await markDealInvitationSent(dealId, create.data.id);
      setNotice(copy ? "Ссылка скопирована." : "Окно отправки открыто. Выберите получателя в MAX.");
    } catch { setShareError("Не удалось передать ссылку. Повторите отправку или скопируйте её."); }
  };
  return <Card className="early-invitation-panel">
    <strong>Пригласите вторую сторону уже сейчас</strong>
    <p>Получатель увидит, кто его приглашает и что вы предлагаете, и сможет заполнить свой профиль параллельно. Подписание будет доступно только после согласования итоговых условий.</p>
    {workspace.data?.counterparty ? <p role="status">{workspace.data.counterparty.displayName} уже присоединился.</p> : <>
      {create.data?.shareUrl ? <><div className="invitation-share-preview"><strong>Сообщение получателю</strong><p style={{ whiteSpace: "pre-line" }}>{create.data.shareText}</p><small>Проверьте текст перед отправкой. Не включайте конфиденциальные сведения.</small></div><Button type="button" onClick={() => void send(false)}>Отправить в MAX</Button><Button type="button" variant="secondary" onClick={() => void send(true)}>Скопировать ссылку</Button></> :
        <Button type="button" disabled={disabled || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Готовим приглашение…" : workspace.data?.invitation?.state === "ACTIVE" ? "Перевыпустить приглашение" : "Пригласить сейчас"}</Button>}
      {disabled ? <small>Сначала укажите название и описание от 10 символов.</small> : null}
    </>}
    {create.error || shareError ? <p role="alert">{create.error?.message ?? shareError}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </Card>;
}
