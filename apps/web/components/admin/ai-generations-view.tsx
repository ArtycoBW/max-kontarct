"use client";

import type { AdminAiGenerationListResponse, AiGenerationStatus } from "@max-contract/contracts";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Bot, CircleAlert, Clock3, RefreshCw, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminAiGenerations } from "@/lib/api/admin";
import { queryKeys } from "@/lib/api/query-keys";

export function AdminAiGenerationsView() {
  const query = useQuery({
    queryFn: getAdminAiGenerations,
    queryKey: queryKeys.admin.aiGenerations(),
    retry: false,
  });
  return <AiGenerationsContent query={query} />;
}

function AiGenerationsContent({
  query,
}: {
  query: UseQueryResult<AdminAiGenerationListResponse, Error>;
}) {
  if (query.isPending) {
    return <div className="admin-list-loading"><Skeleton /><Skeleton /><Skeleton /></div>;
  }
  if (query.error || !query.data) {
    return (
      <Card className="admin-inline-error">
        <CircleAlert size={24} />
        <span><strong>Не удалось загрузить генерации</strong><small>Проверьте соединение и повторите попытку.</small></span>
        <Button onClick={() => query.refetch()} variant="outline"><RefreshCw size={15} /> Повторить</Button>
      </Card>
    );
  }

  const completed = query.data.items.filter(({ status }) => status === "COMPLETED").length;
  const failed = query.data.items.filter(({ status }) => status === "FAILED").length;
  return (
    <div className="admin-generations-view">
      <div className="admin-summary-grid">
        <Card><span>Всего запусков</span><strong>{query.data.total}</strong></Card>
        <Card><span>Договор подготовлен</span><strong>{completed}</strong></Card>
        <Card><span>Завершено с ошибкой</span><strong>{failed}</strong></Card>
      </div>
      <Card className="admin-ai-note">
        <ShieldCheck size={19} />
        <span>
          <strong>Безопасное представление</strong>
          <small>Ответы пользователей и текст подготовленных договоров здесь не отображаются.</small>
        </span>
      </Card>
      <div className="admin-generation-list">
        {query.data.items.map((generation) => (
          <Card className="admin-generation-row" key={generation.id}>
            <span className="admin-generation-icon"><Bot size={18} /></span>
            <span className="admin-generation-main">
              <strong>{generation.templateTitle}</strong>
              <small>Версия {generation.templateVersion} · промпт {generation.promptId} / {generation.promptVersion}</small>
            </span>
            <span>
              <i className={`admin-status is-${generation.status.toLowerCase()}`}>
                {generationStatusLabel(generation.status)}
              </i>
              <small>{providerLabel(generation.provider, generation.model)}</small>
            </span>
            <span className="admin-generation-metrics">
              <strong>{generation.totalTokens ?? "—"}</strong>
              <small>токенов · попыток {generation.attemptCount}</small>
              {generation.redactedPiiCount ? <small>Скрыто персональных значений: {generation.redactedPiiCount}</small> : null}
            </span>
            <time dateTime={generation.updatedAt}>
              <Clock3 size={13} /> {formatDateTime(generation.updatedAt)}
            </time>
          </Card>
        ))}
      </div>
    </div>
  );
}

function generationStatusLabel(status: AiGenerationStatus): string {
  return {
    COMPLETED: "Готово",
    FAILED: "Ошибка",
    GENERATING: "Подготовка",
    NEED_MORE_INFO: "Нужны ответы",
    QUEUED: "В очереди",
    READY_TO_GENERATE: "Готов к запуску",
  }[status];
}

function providerLabel(provider: string | null, model: string | null): string {
  if (!provider && !model) return "Провайдер не вызывался";
  const providerName = provider === "yandex" ? "YandexGPT" : provider === "fake" ? "Тестовый AI" : provider;
  return [providerName, model].filter(Boolean).join(" · ");
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
