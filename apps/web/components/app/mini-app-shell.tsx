"use client";

import type {
  OnboardingStateResponse,
  TemplateAnswerValidationError,
  TemplateDocumentRequirementResponse,
  VerifiedPhone,
} from "@max-contract/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleAlert,
  FileCheck2,
  Files,
  FileSignature,
  FolderOpen,
  Home,
  LockKeyhole,
  PenLine,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/components/providers/auth-provider";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { ProfileScreen } from "@/components/profile/profile-screen";
import {
  parseQuestionnaireSchema,
  TemplateQuestionnaire,
} from "@/components/templates/template-questionnaire";
import { ApiError } from "@/lib/api/client";
import { getReadiness } from "@/lib/api/health";
import { getOnboardingState } from "@/lib/api/onboarding";
import { queryKeys } from "@/lib/api/query-keys";
import {
  getTemplate,
  getTemplates,
  validateTemplateAnswers,
} from "@/lib/api/templates";
import { normalizeQuestionnaireAnswers } from "@/lib/validation/questionnaire-answers";
import { cn } from "@/lib/utils";

type AppTab = "home" | "deals" | "create" | "documents" | "profile";
type Icon = LucideIcon;

const navigation: Array<{
  id: AppTab;
  icon: Icon;
  label: string;
}> = [
  { id: "home", icon: Home, label: "Главная" },
  { id: "deals", icon: BriefcaseBusiness, label: "Сделки" },
  { id: "create", icon: Plus, label: "Создать" },
  { id: "documents", icon: Files, label: "Документы" },
  { id: "profile", icon: UserRound, label: "Профиль" },
];

function BrandMark() {
  return (
    <span className="brand-mark" aria-label="Макс-Контракт">
      <span className="brand-mark-icon" aria-hidden="true">
        <FileSignature size={18} />
      </span>
      <span className="brand-mark-copy">
        <span>МАКС</span>
        <span>КОНТРАКТ</span>
      </span>
    </span>
  );
}

function ReadinessBadge() {
  const readiness = useQuery({
    queryFn: getReadiness,
    queryKey: queryKeys.health.ready(),
    refetchInterval: 60_000,
  });

  if (readiness.isPending) {
    return (
      <span className="service-status is-pending" role="status">
        <span /> Проверяем сервис
      </span>
    );
  }

  if (readiness.isError) {
    return (
      <Button
        type="button"
        variant="unstyled"
        className="service-status is-error"
        onClick={() => readiness.refetch()}
      >
        <CircleAlert size={13} /> Нет связи · повторить
      </Button>
    );
  }

  return (
    <span className="service-status is-ready" role="status">
      <span /> Сервис готов
    </span>
  );
}

function ScreenHeader({
  action,
  eyebrow,
  title,
}: {
  action?: React.ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <header className="screen-header">
      <div>
        <p className="screen-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {action}
    </header>
  );
}

function HomeScreen({ onNavigate }: { onNavigate: (tab: AppTab) => void }) {
  return (
    <div className="screen-content">
      <div className="shell-topline">
        <BrandMark />
        <ReadinessBadge />
      </div>
      <ScreenHeader eyebrow="Частные сделки" title="Всё важное — в одном процессе" />
      <p className="screen-copy">
        Подготовьте условия, соберите документы и проведите обе стороны до
        подписи без лишней сложности.
      </p>

      <motion.section
        className="editorial-hero"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24 }}
      >
        <span>Ясность / контроль / подпись</span>
        <div>
          <strong>01</strong>
          <p>
            понятный
            <br /> сценарий сделки
          </p>
        </div>
        <i aria-hidden="true" />
      </motion.section>

      <div className="feature-list">
        {[
          [PenLine, "Быстро", "Шаблоны и подсказки помогают начать"],
          [ShieldCheck, "Безопасно", "Доступ только у участников сделки"],
          [FileCheck2, "Под контролем", "Статусы и документы всегда на виду"],
        ].map(([FeatureIcon, label, copy]) => {
          const ItemIcon = FeatureIcon as Icon;
          return (
            <div className="feature-row" key={label as string}>
              <span className="icon-tile">
                <ItemIcon size={17} />
              </span>
              <span>
                <strong>{label as string}</strong>
                <small>{copy as string}</small>
              </span>
            </div>
          );
        })}
      </div>

      <Button className="full-width" onClick={() => onNavigate("create")}>
        Создать первую сделку <ChevronRight size={17} />
      </Button>
    </div>
  );
}

function DealsScreen({ onNavigate }: { onNavigate: (tab: AppTab) => void }) {
  const [filter, setFilter] = useState("all");
  const filters = [
    { id: "all", label: "Все · 0" },
    { id: "draft", label: "Черновики" },
    { id: "signed", label: "Подписаны" },
  ];

  return (
    <div className="screen-content">
      <div className="shell-topline">
        <ReadinessBadge />
        <Button
          className="round-action"
          type="button"
          variant="unstyled"
          aria-label="Уведомления"
        >
          <Bell size={17} />
        </Button>
      </div>
      <ScreenHeader eyebrow="Рабочее пространство" title="Мои сделки" />

      <section className="portfolio-card">
        <span>Портфель / сейчас</span>
        <div>
          <strong>00</strong>
          <p>
            сделок
            <br /> в работе
          </p>
        </div>
        <i aria-hidden="true" />
      </section>

      <div className="filter-row" aria-label="Фильтры сделок">
        {filters.map(({ id, label }) => (
          <Button
            type="button"
            variant="unstyled"
            key={id}
            className={cn("filter-chip", filter === id && "is-active")}
            onClick={() => setFilter(id)}
            aria-pressed={filter === id}
          >
            {label}
          </Button>
        ))}
      </div>

      <Card className="empty-deals">
        <span className="state-icon">
          <FolderOpen size={31} />
        </span>
        <h2>Сделок пока нет</h2>
        <p>
          Создайте первый договор — подскажем, что заполнить и какие документы
          подготовить.
        </p>
        <Button onClick={() => onNavigate("create")}>
          <Plus size={17} /> Создать сделку
        </Button>
      </Card>

      <div className="quick-actions">
        <Button
          type="button"
          variant="unstyled"
          onClick={() => onNavigate("create")}
        >
          <PenLine size={19} />
          <strong>Новая сделка</strong>
          <small>Заполнить условия</small>
        </Button>
        <Button
          type="button"
          variant="unstyled"
          onClick={() => onNavigate("documents")}
        >
          <Files size={19} />
          <strong>Документы</strong>
          <small>Открыть хранилище</small>
        </Button>
      </div>
    </div>
  );
}

function CreateDealScreen() {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [selectedSlug, setSelectedSlug] = useState("");
  const templates = useQuery({
    queryFn: getTemplates,
    queryKey: queryKeys.templates.list(),
  });
  const template = useQuery({
    enabled: selectedSlug.length > 0,
    queryFn: () => getTemplate(selectedSlug),
    queryKey: queryKeys.templates.detail(selectedSlug),
  });
  const definition = useMemo(
    () =>
      template.data
        ? parseQuestionnaireSchema(
            template.data.currentVersion.questionnaireSchema,
          )
        : null,
    [template.data],
  );
  const questionnaireAnswers = useMemo(
    () => ({
      ...Object.fromEntries(
        (definition?.fields ?? [])
          .filter((field) => field.type === "boolean")
          .map((field) => [field.key, false]),
      ),
      ...answers,
    }),
    [answers, definition],
  );
  const validation = useMutation({
    mutationFn: (payload: { answers: Record<string, unknown>; versionId: string }) =>
      validateTemplateAnswers(selectedSlug, {
        answers: payload.answers,
        templateVersionId: payload.versionId,
      }),
  });

  const changeAnswer = (key: string, value: unknown) => {
    setAnswers((current) => {
      if (value === undefined) {
        const next = { ...current };
        delete next[key];
        return next;
      }
      return { ...current, [key]: value };
    });
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    validation.reset();
  };

  const submitQuestionnaire = async (event: FormEvent) => {
    event.preventDefault();
    if (!definition || !template.data) return;

    const normalized = normalizeQuestionnaireAnswers(
      definition,
      questionnaireAnswers,
    );
    setFieldErrors(normalized.errors);
    if (Object.keys(normalized.errors).length > 0) return;

    try {
      await validation.mutateAsync({
        answers: normalized.answers,
        versionId: template.data.currentVersion.id,
      });
    } catch (error) {
      setFieldErrors(extractTemplateFieldErrors(error));
    }
  };

  return (
    <div className="screen-content">
      <ScreenHeader eyebrow="Новая сделка · анкета" title="Выберите шаблон" />
      <p className="screen-copy">
        Анкета и комплект документов формируются по выбранной версии договора.
      </p>

      <form className="deal-form" onSubmit={submitQuestionnaire} noValidate>
        <div className="form-field">
          <label id="template-label">Шаблон договора</label>
          <Select
            disabled={templates.isPending || templates.isError}
            value={selectedSlug}
            onValueChange={(value) => {
              validation.reset();
              setAnswers({});
              setFieldErrors({});
              setSelectedSlug(value);
            }}
          >
            <SelectTrigger aria-labelledby="template-label">
              <SelectValue
                placeholder={
                  templates.isPending ? "Загружаем шаблоны" : "Выберите шаблон"
                }
              />
            </SelectTrigger>
            <SelectContent position="popper">
              {templates.data?.items.map((item) => (
                <SelectItem key={item.id} value={item.slug}>
                  {item.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {templates.isError ? (
          <RequestErrorCard
            message={templates.error.message}
            onRetry={() => templates.refetch()}
          />
        ) : null}

        {templates.data?.items.length === 0 ? (
          <Card className="form-message">
            <strong>Нет опубликованных шаблонов</strong>
            <span>Добавьте опубликованную версию в панели управления.</span>
          </Card>
        ) : null}

        {template.isPending && selectedSlug ? (
          <Card className="form-message" role="status">
            <strong>Загружаем анкету</strong>
            <span>Проверяем опубликованную версию шаблона.</span>
          </Card>
        ) : null}

        {template.isError ? (
          <RequestErrorCard
            message={template.error.message}
            onRetry={() => template.refetch()}
          />
        ) : null}

        {template.data && definition ? (
          <>
            <div className="questionnaire-heading">
              <span>Версия {template.data.currentVersion.versionNumber}</span>
              <h2>{definition.title ?? template.data.title}</h2>
              <p>{template.data.summary}</p>
            </div>
            <TemplateQuestionnaire
              answers={questionnaireAnswers}
              definition={definition}
              errors={fieldErrors}
              onChange={changeAnswer}
            />
            <TemplateDocuments
              requirements={
                template.data.currentVersion.documentRequirements
              }
            />
          </>
        ) : null}

        {template.data && !definition ? (
          <Card className="form-message is-error">
            <strong>Не удалось прочитать анкету</strong>
            <span>Проверьте схему опубликованной версии шаблона.</span>
          </Card>
        ) : null}

        {validation.isError && Object.keys(fieldErrors).length === 0 ? (
          <RequestErrorCard message={validation.error.message} />
        ) : null}

        {validation.data ? (
          <div className="validation-success" role="status">
            <Check size={16} /> Анкета проверена по версии {validation.data.snapshot.versionNumber}.
          </div>
        ) : null}

        {template.data && definition ? (
          <Button className="full-width" disabled={validation.isPending} type="submit">
            {validation.isPending ? "Проверяем анкету" : "Проверить анкету"}
          </Button>
        ) : null}
      </form>
    </div>
  );
}

function TemplateDocuments({
  requirements,
}: {
  requirements: TemplateDocumentRequirementResponse[];
}) {
  return (
    <Card className="template-documents">
      <div className="template-documents-heading">
        <FileCheck2 size={18} />
        <span>
          <strong>Документы по шаблону</strong>
          <small>Состав определён выбранной версией</small>
        </span>
      </div>
      {requirements.length > 0 ? (
        <ul>
          {requirements.map((requirement) => (
            <li key={requirement.id}>
              <span>
                <strong>{requirement.title}</strong>
                {requirement.description ? (
                  <small>{requirement.description}</small>
                ) : null}
              </span>
              <em>{requirement.required ? "Обязательный" : "Дополнительный"}</em>
            </li>
          ))}
        </ul>
      ) : (
        <p>Дополнительные документы не требуются.</p>
      )}
    </Card>
  );
}

function RequestErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="form-message is-error" role="alert">
      <strong>Не удалось выполнить запрос</strong>
      <span>{message}</span>
      {onRetry ? (
        <Button onClick={onRetry} size="sm" type="button" variant="outline">
          Повторить
        </Button>
      ) : null}
    </Card>
  );
}

function extractTemplateFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !isRecord(error.details)) return {};
  const errors = error.details.errors;
  if (!Array.isArray(errors)) return {};

  return Object.fromEntries(
    errors
      .filter(isTemplateAnswerValidationError)
      .map((item) => [item.path, item.message]),
  );
}

function isTemplateAnswerValidationError(
  value: unknown,
): value is TemplateAnswerValidationError {
  return (
    isRecord(value) &&
    typeof value.message === "string" &&
    typeof value.path === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function DocumentsScreen() {
  return (
    <div className="screen-content">
      <ScreenHeader eyebrow="Защищённое хранилище" title="Документы" />
      <p className="screen-copy">
        Здесь хранятся файлы выбранной сделки. Доступ есть только у её участников.
      </p>
      <Card className="center-state">
        <span className="state-icon">
          <Files size={31} />
        </span>
        <h2>Пока нет документов</h2>
        <p>Состав документов определяется выбранным типом договора.</p>
      </Card>
      <Card className="security-note">
        <LockKeyhole size={18} />
        <span>
          <strong>Приватное хранение</strong>
          <small>Доступ проверяется сервером перед каждым скачиванием.</small>
        </span>
      </Card>
    </div>
  );
}

function BottomNavigation({
  active,
  onChange,
}: {
  active: AppTab;
  onChange: (tab: AppTab) => void;
}) {
  return (
    <nav className="bottom-navigation" aria-label="Навигация приложения">
      {navigation.map(({ icon: NavIcon, id, label }) => (
        <Button
          type="button"
          variant="unstyled"
          key={id}
          className={cn(
            "navigation-item",
            active === id && "is-active",
            id === "create" && "is-create",
          )}
          onClick={() => onChange(id)}
          aria-current={active === id ? "page" : undefined}
        >
          <span>
            <NavIcon size={id === "create" ? 22 : 20} />
          </span>
          <small>{label}</small>
        </Button>
      ))}
    </nav>
  );
}

function ActiveScreen({
  active,
  onNavigate,
  phone,
}: {
  active: AppTab;
  onNavigate: (tab: AppTab) => void;
  phone: VerifiedPhone;
}) {
  if (active === "home") return <HomeScreen onNavigate={onNavigate} />;
  if (active === "deals") return <DealsScreen onNavigate={onNavigate} />;
  if (active === "create") return <CreateDealScreen />;
  if (active === "documents") return <DocumentsScreen />;
  return <ProfileScreen fallbackPhone={phone} />;
}

function AuthenticationLoading({
  copy = "Проверяем сессию и данные запуска приложения.",
  eyebrow = "Безопасный вход",
  title = "Подключаем MAX",
}: {
  copy?: string;
  eyebrow?: string;
  title?: string;
} = {}) {
  return (
    <main className="app-viewport">
      <section className="mini-app loading-screen" aria-label="Вход через MAX">
        <div className="auth-loading">
          <span className="auth-loading-mark">
            <ShieldCheck size={24} />
          </span>
          <p className="screen-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{copy}</p>
          <span className="auth-loading-line" aria-hidden="true" />
        </div>
      </section>
    </main>
  );
}

function AuthenticationError({
  error,
  onRetry,
  title = "Не удалось войти через MAX",
}: {
  error: Error | null;
  onRetry: () => void;
  title?: string;
}) {
  return (
    <main className="app-viewport">
      <section className="mini-app error-screen">
        <div className="center-state auth-error">
          <span className="state-icon is-error">
            <CircleAlert size={31} />
          </span>
          <h1>{title}</h1>
          <p>{error?.message ?? "Повторите попытку через несколько секунд."}</p>
          <Button onClick={onRetry}>
            <RefreshCw size={17} /> Повторить
          </Button>
        </div>
      </section>
    </main>
  );
}

export function MiniAppShell({
  showEnvironmentBadge,
}: {
  showEnvironmentBadge: boolean;
}) {
  const auth = useAuth();

  if (auth.isPending) {
    return <AuthenticationLoading />;
  }

  if (auth.error || !auth.user) {
    return <AuthenticationError error={auth.error} onRetry={auth.retry} />;
  }

  return (
    <AuthenticatedMiniApp showEnvironmentBadge={showEnvironmentBadge} />
  );
}

function AuthenticatedMiniApp({
  showEnvironmentBadge,
}: {
  showEnvironmentBadge: boolean;
}) {
  const queryClient = useQueryClient();
  const onboarding = useQuery({
    queryFn: getOnboardingState,
    queryKey: ["onboarding", "state"],
    retry: false,
  });

  if (onboarding.isPending) {
    return (
      <AuthenticationLoading
        copy="Проверяем согласия и подтверждение телефона."
        eyebrow="Настройка профиля"
        title="Проверяем профиль"
      />
    );
  }

  if (onboarding.error || !onboarding.data) {
    return (
      <AuthenticationError
        error={onboarding.error}
        onRetry={() => void onboarding.refetch()}
        title="Не удалось проверить профиль"
      />
    );
  }

  if (!onboarding.data.completed) {
    return (
      <OnboardingFlow
        onStateChange={(nextState: OnboardingStateResponse) =>
          queryClient.setQueryData(["onboarding", "state"], nextState)
        }
        showEnvironmentBadge={showEnvironmentBadge}
        state={onboarding.data}
      />
    );
  }

  return (
    <AppWorkspace
      phone={onboarding.data.phone!}
      showEnvironmentBadge={showEnvironmentBadge}
    />
  );
}

function AppWorkspace({
  phone,
  showEnvironmentBadge,
}: {
  phone: VerifiedPhone;
  showEnvironmentBadge: boolean;
}) {
  const [active, setActive] = useState<AppTab>("deals");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [active]);

  return (
    <main className="app-viewport">
      <section className="mini-app" aria-label="Макс-Контракт">
        {showEnvironmentBadge ? (
          <span className="environment-badge">ТЕСТ</span>
        ) : null}
        <div className="mini-app-scroll" ref={scrollRef}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              className="screen-motion"
              key={active}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <ActiveScreen
                active={active}
                onNavigate={setActive}
                phone={phone}
              />
            </motion.div>
          </AnimatePresence>
        </div>
        <BottomNavigation active={active} onChange={setActive} />
      </section>
    </main>
  );
}
