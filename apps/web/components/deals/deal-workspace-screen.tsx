"use client";

import type { DealInvitationResponse, DealStatus } from "@max-contract/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Clock3,
  Copy,
  FileCheck2,
  RefreshCw,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApiError } from "@/lib/api/client";
import { startDealAgreement } from "@/lib/api/deals";
import {
  approveDealVersion,
  createDealInvitation,
  getDealWorkspace,
  markDealInvitationSent,
  revokeDealInvitation,
} from "@/lib/api/invitations";
import { queryKeys } from "@/lib/api/query-keys";
import { shareInMax } from "@/lib/max/bridge";

export function DealWorkspaceScreen({
  dealId,
  onBack,
  onEdit,
  onOpenProfile,
}: {
  dealId: string;
  onBack: () => void;
  onEdit: () => void;
  onOpenProfile: () => void;
}) {
  const queryClient = useQueryClient();
  const [issuedInvitation, setIssuedInvitation] =
    useState<DealInvitationResponse | null>(null);
  const [notice, setNotice] = useState("");
  const workspace = useQuery({
    queryFn: () => getDealWorkspace(dealId),
    queryKey: queryKeys.deals.workspace(dealId),
    refetchInterval: (query) =>
      query.state.data?.status === "INVITED" ? 8_000 : false,
  });
  const issueInvitation = useMutation({
    mutationFn: async (replaceActive: boolean) => {
      if (!workspace.data) throw new Error("Сделка ещё загружается");
      let source: { status: DealStatus; updatedAt: string; versionId: string } =
        workspace.data;
      if (source.status === "DRAFT") {
        source = await startDealAgreement(dealId, {
          expectedUpdatedAt: source.updatedAt,
          expectedVersionId: source.versionId,
        });
      }
      return createDealInvitation(dealId, {
        expectedUpdatedAt: source.updatedAt,
        expectedVersionId: source.versionId,
        replaceActive,
      });
    },
    onSuccess: (invitation) => {
      setIssuedInvitation(invitation);
      setNotice(`Защищённая ссылка готова до ${formatDateTime(invitation.expiresAt)}.`);
      void refreshWorkspace(queryClient, dealId);
    },
  });
  const revokeInvitation = useMutation({
    mutationFn: (invitationId: string) =>
      revokeDealInvitation(dealId, invitationId),
    onSuccess: () => {
      setIssuedInvitation(null);
      setNotice("Приглашение отозвано.");
      void refreshWorkspace(queryClient, dealId);
    },
  });
  const approval = useMutation({
    mutationFn: () => {
      if (!workspace.data) throw new Error("Сделка ещё загружается");
      return approveDealVersion(dealId, workspace.data.versionId, {
        expectedDealUpdatedAt: workspace.data.updatedAt,
      });
    },
    onSuccess: () => {
      setNotice("Вы согласовали текущую версию условий.");
      void refreshWorkspace(queryClient, dealId);
    },
  });

  if (workspace.isPending) {
    return <WorkspaceState title="Открываем сделку" copy="Получаем актуальную версию и статусы сторон." />;
  }
  if (workspace.isError || !workspace.data) {
    return (
      <WorkspaceState
        title="Не удалось открыть сделку"
        copy={workspace.error?.message ?? "Повторите попытку"}
        action={<Button onClick={() => void workspace.refetch()}><RefreshCw size={17} /> Повторить</Button>}
      />
    );
  }

  const deal = workspace.data;
  const currentInvitation = issuedInvitation ?? deal.invitation;
  const canApprove =
    deal.status === "COUNTERPARTY_JOINED" || deal.status === "TERMS_REVIEW";
  const profileRequired =
    deal.currentUserRole === "COUNTERPARTY" &&
    deal.counterparty?.profileCompleted === false;
  const visibleParty =
    deal.currentUserRole === "COUNTERPARTY" ? deal.initiator : deal.counterparty;

  const shareInvitation = async () => {
    if (!issuedInvitation?.shareUrl || !issuedInvitation.shareText) return;
    try {
      await shareInMax(issuedInvitation.shareText, issuedInvitation.shareUrl);
      await markDealInvitationSent(dealId, issuedInvitation.id);
      setNotice("Окно отправки в MAX открыто.");
      void refreshWorkspace(queryClient, dealId);
    } catch {
      setNotice("Отправка отменена. Ссылка остаётся действующей.");
    }
  };
  const copyInvitation = async () => {
    if (!issuedInvitation?.shareUrl) return;
    await navigator.clipboard.writeText(issuedInvitation.shareUrl);
    await markDealInvitationSent(dealId, issuedInvitation.id);
    setNotice("Ссылка скопирована.");
    void refreshWorkspace(queryClient, dealId);
  };

  return (
    <div className="screen-content deal-workspace-screen">
      <header className="flow-header deal-workspace-header">
        <p className="screen-eyebrow">{statusLabel(deal.status)} · версия {deal.versionNumber}</p>
        <div className="flow-header-row">
          <div className="flow-header-title">
            <Button aria-label="Назад" className="flow-back-button" onClick={onBack} size="icon" variant="ghost">
              <ArrowLeft size={21} />
            </Button>
            <h1>{deal.title}</h1>
          </div>
        </div>
      </header>

      <Card className="deal-workspace-summary">
        <span className="state-icon"><FileCheck2 size={24} /></span>
        <div><small>Тип сделки</small><strong>{deal.template.title}</strong><span>Редакция условий № {deal.versionNumber}</span></div>
        <ShieldCheck size={19} />
      </Card>

      {notice ? <p className="deal-workspace-notice" role="status"><Check size={15} />{notice}</p> : null}

      <section className="deal-workspace-section">
        <h2>Стороны и приглашение</h2>
        {visibleParty ? (
          <Card className="deal-party-card">
            <UserRound size={21} />
            <span><strong>{visibleParty.displayName}</strong><small>{visibleParty.role === "INITIATOR" ? "Инициатор сделки" : "Контрагент подключён"}</small></span>
            <Check size={18} />
          </Card>
        ) : (
          <Card className="deal-party-card is-waiting">
            <Clock3 size={21} />
            <span><strong>Контрагент ещё не подключён</strong><small>{currentInvitation?.state === "ACTIVE" ? `Ссылка действует до ${formatDateTime(currentInvitation.expiresAt)}` : "Создайте защищённое приглашение"}</small></span>
          </Card>
        )}

        {issuedInvitation?.shareUrl ? (
          <div className="deal-invitation-actions">
            <Button className="full-width" onClick={() => void shareInvitation()}><Send size={17} /> Отправить в MAX</Button>
            <Button className="full-width" onClick={() => void copyInvitation()} variant="secondary"><Copy size={17} /> Скопировать ссылку</Button>
          </div>
        ) : null}

        {!deal.counterparty && !issuedInvitation?.shareUrl ? (
          <Button
            className="full-width"
            disabled={issueInvitation.isPending}
            onClick={() => issueInvitation.mutate(Boolean(currentInvitation?.state === "ACTIVE"))}
          >
            {currentInvitation?.state === "ACTIVE" ? <RefreshCw size={17} /> : <Send size={17} />}
            {currentInvitation?.state === "ACTIVE" ? "Перевыпустить защищённую ссылку" : "Создать приглашение"}
          </Button>
        ) : null}

        {currentInvitation?.state === "ACTIVE" ? (
          <Button
            className="full-width"
            disabled={revokeInvitation.isPending}
            onClick={() => revokeInvitation.mutate(currentInvitation.id)}
            variant="ghost"
          >
            Отозвать приглашение
          </Button>
        ) : null}
      </section>

      <section className="deal-workspace-section">
        <div className="deal-workspace-section-heading">
          <h2>Условия сделки</h2>
          <span>{deal.approvals.totalApproved} из {deal.approvals.required} согласовано</span>
        </div>
        {deal.contractDraft ? (
          <Card className="deal-contract-preview">
            <strong>{deal.contractDraft.title}</strong>
            <p>{deal.contractDraft.preamble}</p>
            {deal.contractDraft.sections.slice(0, 3).map((section) => (
              <div key={section.heading}>
                <h3>{section.heading}</h3>
                {section.clauses.slice(0, 3).map((clause) => <p key={clause}>{clause}</p>)}
              </div>
            ))}
          </Card>
        ) : <Card className="form-message"><strong>Проект договора готовится</strong></Card>}
      </section>

      {profileRequired ? (
        <Card className="form-message is-warning">
          <strong>Заполните данные контрагента</strong>
          <span>Они нужны для согласования версии и будущих документов.</span>
          <Button onClick={onOpenProfile}>Заполнить профиль</Button>
        </Card>
      ) : null}

      {canApprove && !profileRequired ? (
        <Button
          className="full-width"
          disabled={deal.approvals.currentUserApproved || approval.isPending}
          onClick={() => approval.mutate()}
        >
          <Check size={18} />
          {deal.approvals.currentUserApproved ? "Версия согласована" : `Согласовать версию ${deal.versionNumber}`}
        </Button>
      ) : null}

      {deal.status === "DRAFT" ? (
        <Button className="full-width" onClick={onEdit} variant="secondary">Редактировать черновик</Button>
      ) : null}

      {issueInvitation.error ? (
        <Card className="form-message is-error" role="alert">
          <strong>Не удалось создать приглашение</strong>
          <span>{issueInvitation.error instanceof ApiError ? issueInvitation.error.message : "Повторите попытку"}</span>
        </Card>
      ) : null}
    </div>
  );
}

function WorkspaceState({ action, copy, title }: { action?: React.ReactNode; copy: string; title: string }) {
  return <div className="screen-content"><Card className="form-message"><strong>{title}</strong><span>{copy}</span>{action}</Card></div>;
}

async function refreshWorkspace(queryClient: ReturnType<typeof useQueryClient>, dealId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.deals.workspace(dealId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.deals.list() }),
  ]);
}

function statusLabel(status: DealStatus): string {
  const labels: Record<DealStatus, string> = {
    CANCELED: "Сделка отменена", COLLECTING_DATA: "Условия зафиксированы",
    COMPLETED: "Сделка завершена", CONTRACT_DRAFT: "Проект договора",
    COUNTERPARTY_JOINED: "Контрагент подключён", DOCUMENTS_PENDING: "Ожидаем документы",
    DOCUMENTS_REVIEW: "Проверяем документы", DRAFT: "Черновик",
    INVITATION_READY: "Приглашение готово", INVITED: "Ожидаем контрагента",
    READY_TO_SIGN: "Готово к подписанию", SIGNED: "Подписано",
    SIGNED_BY_ONE: "Подписано одной стороной", TERMS_REVIEW: "Согласование условий",
  };
  return labels[status];
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}
