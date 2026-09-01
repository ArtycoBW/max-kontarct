"use client";

import type {
  AdminAuditListResponse,
  AdminUserListResponse,
  AuthUserRole,
} from "@max-contract/contracts";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bot,
  Check,
  CircleAlert,
  FileStack,
  FileSearch,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { AdminAiGenerationsView } from "@/components/admin/ai-generations-view";
import { AdminFileReviewsView } from "@/components/admin/file-reviews-view";
import { AdminTemplatesView } from "@/components/admin/templates-view";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminAuditEvents, getAdminUsers } from "@/lib/api/admin";
import { queryKeys } from "@/lib/api/query-keys";

type AdminTab = "users" | "templates" | "generations" | "files" | "audit";

export default function AdminPage() {
  const auth = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>("users");
  const allowed = auth.user?.role === "ADMIN" || auth.user?.role === "SUPPORT";
  const users = useQuery({
    enabled: allowed && activeTab === "users",
    queryFn: getAdminUsers,
    queryKey: queryKeys.admin.users(),
    retry: false,
  });
  const audit = useQuery({
    enabled: allowed && activeTab === "audit",
    queryFn: getAdminAuditEvents,
    queryKey: queryKeys.admin.audit(),
    retry: false,
  });

  if (auth.isPending) {
    return <AdminLoading />;
  }

  if (auth.error || !auth.user) {
    return (
      <AdminState
        copy={auth.error?.message ?? "Авторизуйтесь и повторите попытку."}
        title="Не удалось проверить доступ"
        onRetry={auth.retry}
      />
    );
  }

  if (!allowed) {
    return (
      <AdminState
        copy="Раздел доступен администратору и сотрудникам поддержки. Права доступа проверяются сервером."
        title="Доступ закрыт"
      />
    );
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand-logo">
            <Image
              alt=""
              aria-hidden="true"
              height={40}
              src="/images/max-contract-app-icon.jpg"
              width={40}
            />
          </span>
          <div>
            <strong>МАКС-КОНТРАКТ</strong>
            <small>Управление</small>
          </div>
        </div>
        <nav aria-label="Разделы администрирования">
          <Button
            className={activeTab === "users" ? "is-active" : undefined}
            onClick={() => setActiveTab("users")}
            type="button"
            variant="unstyled"
          >
            <UsersRound size={17} /> Пользователи
          </Button>
          <Button
            className={activeTab === "templates" ? "is-active" : undefined}
            onClick={() => setActiveTab("templates")}
            type="button"
            variant="unstyled"
          >
            <FileStack size={17} /> Шаблоны
          </Button>
          <Button
            className={activeTab === "generations" ? "is-active" : undefined}
            onClick={() => setActiveTab("generations")}
            type="button"
            variant="unstyled"
          >
            <Bot size={17} /> Генерации ИИ
          </Button>
          <Button
            className={activeTab === "files" ? "is-active" : undefined}
            onClick={() => setActiveTab("files")}
            type="button"
            variant="unstyled"
          >
            <FileSearch size={17} /> Проверка файлов
          </Button>
          <Button
            className={activeTab === "audit" ? "is-active" : undefined}
            onClick={() => setActiveTab("audit")}
            type="button"
            variant="unstyled"
          >
            <ScrollText size={17} /> Журнал событий
          </Button>
        </nav>
        <div className="admin-role-card">
          <UserRoundCheck size={18} />
          <span>
            <small>Текущая роль</small>
            <strong>{roleLabel(auth.user.role)}</strong>
          </span>
        </div>
        <Button asChild variant="ghost">
          <Link href="/"><ArrowLeft size={16} /> В приложение</Link>
        </Button>
      </aside>

      <section className="admin-content">
        <header className="admin-header">
          <div>
            <p>{tabCopy(activeTab)}</p>
            <h1>{tabTitle(activeTab)}</h1>
          </div>
          <span className="admin-security-badge"><Check size={13} /> Доступ защищён</span>
        </header>

        {activeTab === "users" ? <UsersView query={users} /> : null}
        {activeTab === "templates" ? (
          <AdminTemplatesView canManage={auth.user.role === "ADMIN"} />
        ) : null}
        {activeTab === "generations" ? <AdminAiGenerationsView /> : null}
        {activeTab === "files" ? <AdminFileReviewsView canReview={auth.user.role === "ADMIN"} /> : null}
        {activeTab === "audit" ? <AuditView query={audit} /> : null}
      </section>
    </main>
  );
}

function UsersView({
  query,
}: {
  query: UseQueryResult<AdminUserListResponse, Error>;
}) {
  if (query.isPending) return <AdminListLoading />;
  if (query.error || !query.data) {
    return <InlineError onRetry={() => query.refetch()} />;
  }

  return (
    <>
      <div className="admin-summary-grid">
        <Card><span>Всего пользователей</span><strong>{query.data.total}</strong></Card>
        <Card>
          <span>Показано безопасно</span>
          <strong>{query.data.items.length}</strong>
          <small>Персональные контакты скрыты</small>
        </Card>
      </div>
      <Card className="admin-table-card">
        <div className="admin-table-head">
          <span>Пользователь</span><span>Роль</span><span>Профиль</span><span>Последняя активность</span>
        </div>
        <div className="admin-table-body">
          {query.data.items.map((user) => (
            <div className="admin-table-row" key={user.id}>
              <span><strong>{user.displayName}</strong><small>Создан {formatDateTime(user.createdAt)}</small></span>
              <span><i className={`role-chip is-${user.role.toLowerCase()}`}>{roleLabel(user.role)}</i></span>
              <span>{user.profileCompleted ? "Заполнен" : "Данные из MAX"}</span>
              <span>{formatDateTime(user.lastSeenAt ?? user.createdAt)}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function AuditView({
  query,
}: {
  query: UseQueryResult<AdminAuditListResponse, Error>;
}) {
  if (query.isPending) return <AdminListLoading />;
  if (query.error || !query.data) {
    return <InlineError onRetry={() => query.refetch()} />;
  }

  return (
    <>
      <Card className="admin-audit-note">
        <ShieldCheck size={19} />
        <span>
          <strong>{formatEventCount(query.data.total)}</strong>
          <small>Служебные данные и персональные сведения скрыты.</small>
        </span>
      </Card>
      <div className="audit-list">
        {query.data.items.map((event) => (
          <Card className="audit-row" key={event.id}>
            <span className="audit-mark"><ScrollText size={17} /></span>
            <span>
              <strong>{auditEventLabel(event.eventType)}</strong>
              <small>{auditEntityLabel(event.entityType)}</small>
            </span>
            <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
          </Card>
        ))}
      </div>
    </>
  );
}

function InlineError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="admin-inline-error">
      <CircleAlert size={24} />
      <span><strong>Не удалось загрузить данные</strong><small>Проверьте соединение и повторите попытку.</small></span>
      <Button onClick={onRetry} variant="outline"><RefreshCw size={15} /> Повторить</Button>
    </Card>
  );
}

function AdminLoading() {
  return <main className="admin-shell"><Skeleton className="admin-loading-sidebar" /><Skeleton className="admin-loading-content" /></main>;
}

function AdminListLoading() {
  return <div className="admin-list-loading"><Skeleton /><Skeleton /><Skeleton /></div>;
}

function AdminState({ copy, onRetry, title }: { copy: string; onRetry?: () => void; title: string }) {
  return (
    <main className="admin-state-page">
      <Card>
        <span className="state-icon is-error"><CircleAlert size={29} /></span>
        <p>Администрирование</p>
        <h1>{title}</h1>
        <small>{copy}</small>
        <div>
          {onRetry ? <Button onClick={onRetry}><RefreshCw size={16} /> Повторить</Button> : null}
          <Button asChild variant={onRetry ? "outline" : "primary"}><Link href="/"><ArrowLeft size={16} /> В приложение</Link></Button>
        </div>
      </Card>
    </main>
  );
}

function roleLabel(role: AuthUserRole): string {
  return { ADMIN: "Администратор", SUPPORT: "Поддержка", USER: "Пользователь" }[role];
}

function tabTitle(tab: AdminTab): string {
  return {
    audit: "Журнал событий",
    files: "Проверка материалов",
    generations: "Генерации ИИ",
    templates: "Шаблоны договоров",
    users: "Пользователи",
  }[tab];
}

function tabCopy(tab: AdminTab): string {
  return {
    audit: "Контроль действий",
    files: "Ручное решение",
    generations: "Контроль подготовки документов",
    templates: "Версии и требования",
    users: "Доступы и профили",
  }[tab];
}

const AUDIT_EVENT_LABELS: Record<string, string> = {
  AUTH_DEV_SUCCEEDED: "Вход в тестовую среду",
  AUTH_LOGOUT: "Выход из аккаунта",
  AUTH_MAX_SUCCEEDED: "Вход через MAX",
  DEV_PHONE_VERIFIED: "Телефон подтверждён в тестовой среде",
  DEV_USER_ROLE_CHANGED: "Роль пользователя изменена",
  DEV_USER_SEEDED: "Тестовый пользователь создан",
  DEAL_FILE_REVIEWED: "Материал сделки проверен",
  DEAL_FILE_UPLOADED: "Материал сделки загружен",
  ADMIN_TEMPLATE_VERSION_ARCHIVED: "Версия шаблона перенесена в архив",
  ADMIN_TEMPLATE_VERSION_CREATED: "Создана версия шаблона",
  ADMIN_TEMPLATE_VERSION_PUBLISHED: "Опубликована версия шаблона",
  ADMIN_TEMPLATE_VERSION_UPDATED: "Изменены требования к документам",
  MAX_PHONE_VERIFIED: "Телефон подтверждён через MAX",
  ONBOARDING_CONSENTS_RECORDED: "Согласия пользователя сохранены",
  USER_PROFILE_CREATED: "Профиль пользователя создан",
  USER_PROFILE_UPDATED: "Профиль пользователя обновлён",
};

const AUDIT_ENTITY_LABELS: Record<string, string> = {
  ConsentDocument: "Согласия пользователя",
  MaxAccount: "Аккаунт MAX",
  User: "Пользователь",
  UserPhone: "Телефон пользователя",
  UserProfile: "Профиль пользователя",
  UserSession: "Сеанс пользователя",
  ContractTemplateVersion: "Версия шаблона договора",
  DealFile: "Материал сделки",
};

function auditEventLabel(eventType: string): string {
  return AUDIT_EVENT_LABELS[eventType] ?? "Системное действие";
}

function auditEntityLabel(entityType: string | null): string {
  if (!entityType) return "Система";
  return AUDIT_ENTITY_LABELS[entityType] ?? "Системный объект";
}

function formatEventCount(total: number): string {
  const lastTwo = total % 100;
  const last = total % 10;
  const noun = lastTwo >= 11 && lastTwo <= 14
    ? "событий"
    : last === 1
      ? "событие"
      : last >= 2 && last <= 4
        ? "события"
        : "событий";
  return `${total} ${noun} в журнале`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
