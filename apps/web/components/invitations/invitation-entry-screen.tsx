"use client";

import type { MaxStartPayload } from "@/lib/max/bridge";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, FileCheck2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getProtectedInvitation, getPublicInvitation } from "@/lib/api/invitations";

export function InvitationEntryScreen({
  onContinue,
  payload,
}: {
  onContinue: () => void;
  payload: Extract<MaxStartPayload, { kind: "invitation" }>;
}) {
  const state = useQuery({
    queryFn: () => getPublicInvitation(payload.publicCode),
    queryKey: ["public-invitation", payload.publicCode],
    retry: false,
    staleTime: 0,
  });
  const invitation = useQuery({
    enabled: state.data?.state === "ACTIVE",
    queryFn: () => getProtectedInvitation({ publicCode: payload.publicCode, token: payload.token }),
    queryKey: ["protected-invitation", payload.publicCode],
    gcTime: 0,
    retry: false,
  });

  if (state.isPending) {
    return <EntryState title="Проверяем приглашение" copy="Загружаем безопасный предпросмотр условий." />;
  }
  if (state.data?.state === "ACCEPTED") return <EntryState title="Вернуться к сделке" copy="Откройте сделку под тем же аккаунтом MAX, с которого вы приняли приглашение." action={<Button className="full-width" onClick={onContinue}>Открыть мою сделку</Button>} />;
  if (state.isError || state.data?.state !== "ACTIVE") return <EntryState title="Приглашение недоступно" copy="Ссылка отозвана или истекла. Попросите инициатора прислать новую." />;
  if (invitation.isPending) return <EntryState title="Проверяем приглашение" copy="Загружаем безопасный предпросмотр условий." />;
  if (invitation.isError || !invitation.data) {
    return <EntryState title="Приглашение недоступно" copy={invitation.error?.message ?? "Попросите инициатора прислать новую ссылку."} />;
  }
  if (invitation.data.state !== "ACTIVE") {
    return <EntryState title="Ссылка больше не действует" copy="Она уже использована, отозвана или истекла." />;
  }

  return (
    <main className="app-viewport">
      <section className="mini-app">
        <div className="mini-app-scroll">
          <div className="screen-content invitation-entry-screen">
            <div className="invitation-entry-icon"><ShieldCheck size={31} /></div>
            <p className="screen-eyebrow">Защищённое приглашение</p>
            <h1>Проверьте условия вместе</h1>
            <p className="screen-copy">Инициатор {invitation.data.initiatorMaskedName} предлагает ознакомиться с условиями версии {invitation.data.versionNumber}.</p>
            <Card className="invitation-offer"><strong>Предложение</strong><p>{invitation.data.offerDescription}</p><small>Условия ещё могут уточняться. До подписания обе стороны проверят и согласуют итоговую редакцию.</small></Card>

            <Card className="invitation-entry-terms">
              <div className="invitation-entry-card-title"><FileCheck2 size={18} /><strong>Основные условия</strong></div>
              {invitation.data.terms.length ? invitation.data.terms.map((term) => (
                <div className="invitation-entry-term" key={term.label}>
                  <span>{term.label}</span><strong>{term.value}</strong>
                </div>
              )) : <p>Подробности станут доступны после безопасного входа.</p>}
            </Card>

            <Card className="invitation-entry-benefits">
              <strong>Что даёт документ</strong>
              {invitation.data.whatItGives.map((item) => <span key={item}><Check size={15} />{item}</span>)}
            </Card>

            <div className="create-flow-action invitation-entry-action">
              <Button
                className="full-width"
                onClick={onContinue}
              >
                Продолжить оформление <ArrowRight size={18} />
              </Button>
              <small>Далее — безопасный вход и оформление. Нажатие не означает согласие с условиями или подписание договора.</small>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function EntryState({ copy, title, action }: { copy: string; title: string; action?: React.ReactNode }) {
  return (
    <main className="app-viewport"><section className="mini-app"><div className="center-state auth-error">
      <span className="state-icon"><ShieldCheck size={30} /></span><h1>{title}</h1><p>{copy}</p>{action}
    </div></section></main>
  );
}
