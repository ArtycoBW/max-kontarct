"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createDealInvitation, getDealWorkspace, markDealInvitationSent } from "@/lib/api/invitations";
import { maxShareUrl, shareInMax } from "@/lib/max/bridge";

export function EarlyInvitationPanel({ dealId, beforeCreate, disabled, onSent }: { dealId: string; beforeCreate: () => Promise<void>; disabled: boolean; onSent?: (sent: boolean) => void }) {
  const [notice, setNotice] = useState("");
  const [shareError, setShareError] = useState("");
  const [shareStarted, setShareStarted] = useState(false);
  const workspace = useQuery({ queryKey: ["early-invitation", dealId], queryFn: () => getDealWorkspace(dealId), refetchInterval: 10_000 });
  const sent = Boolean(workspace.data?.counterparty || workspace.data?.invitation?.sentAt);
  useEffect(() => { onSent?.(sent); }, [onSent, sent]);
  const create = useMutation({
    mutationFn: async () => {
      await beforeCreate();
      const current = await getDealWorkspace(dealId);
      return createDealInvitation(dealId, { expectedUpdatedAt: current.updatedAt, expectedVersionId: current.versionId, replaceActive: current.invitation?.state === "ACTIVE" });
    },
    onSuccess: () => { setShareStarted(false); onSent?.(false); setNotice("Ссылка готова. Отправьте её второй стороне, затем подтвердите отправку."); void workspace.refetch(); },
  });
  const send = async (copy: boolean) => {
    if (!create.data?.shareUrl) return;
    setShareError("");
    setShareStarted(true);
    try {
      if (copy) await navigator.clipboard.writeText(create.data.shareUrl);
      else await shareInMax(create.data.shareText ?? "Приглашение в Макс-Контракт", create.data.shareUrl);
      setNotice(copy ? "Ссылка скопирована. Отправьте её второй стороне." : "Выберите получателя в MAX и отправьте сообщение. Затем вернитесь и подтвердите отправку.");
    } catch { setShareError("Не удалось передать ссылку. Повторите отправку или скопируйте её."); }
  };
  const confirmSent = async () => {
    const id = create.data?.id ?? workspace.data?.invitation?.id;
    if (!id) return;
    try { await markDealInvitationSent(dealId, id); onSent?.(true); setNotice("Отправка подтверждена. Можно продолжать."); void workspace.refetch(); }
    catch { setShareError("Не удалось сохранить подтверждение. Повторите попытку."); }
  };
  if (workspace.data?.counterparty) return <Card className="early-invitation-panel invitation-joined"><p role="status">{workspace.data.counterparty.displayName} уже присоединился.</p></Card>;
  return <Card className="early-invitation-panel">
    <strong>Пригласите вторую сторону уже сейчас</strong>
    <p>Получатель увидит, кто его приглашает и что вы предлагаете, и сможет заполнить свой профиль параллельно. Подписание будет доступно только после согласования итоговых условий.</p>
    <>
      {create.data?.shareUrl ? <><div className="invitation-share-preview"><strong>Сообщение получателю</strong><p style={{ whiteSpace: "pre-line" }}>{create.data.shareText}</p><small>Проверьте текст перед отправкой. Не включайте конфиденциальные сведения.</small></div><Button type="button" onClick={() => void send(false)}>Отправить в MAX</Button><Button type="button" variant="secondary" onClick={() => void send(true)}>Скопировать ссылку</Button></> :
        <Button type="button" disabled={disabled || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Готовим приглашение…" : workspace.data?.invitation?.state === "ACTIVE" ? "Перевыпустить приглашение" : "Пригласить сейчас"}</Button>}
      {disabled ? <small>Сначала укажите название и описание от 10 символов.</small> : null}
    </>
    {create.data?.shareUrl && shareStarted ? <a className="invitation-fallback-link" href={maxShareUrl(create.data.shareText ?? "Приглашение", create.data.shareUrl)}>Если окно не открылось — открыть приглашение в MAX</a> : null}
    {(shareStarted || workspace.data?.invitation?.state === "ACTIVE") && !sent ? <Button type="button" variant="secondary" onClick={() => void confirmSent()}>Я отправил приглашение</Button> : null}
    {create.error || shareError ? <p role="alert">{create.error?.message ?? shareError}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </Card>;
}
